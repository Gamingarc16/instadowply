// 🔥 FORCE PLAYWRIGHT TO THINK THIS IS LINUX
Object.defineProperty(process, 'platform', { value: 'linux' });

// ============================================================================
// SAFE PIPELINE CORES (Silently absorb background media or asset timeout drops)
// ============================================================================
process.on('unhandledRejection', (reason) => {
    if (reason?.message?.includes('Timeout') || reason?.message?.includes('status code')) return;
    if (reason?.message?.includes('Target page snapped') || reason?.message?.includes('context mapping')) return;
    console.log('💡 Intercepted background stream exception:', reason?.message || reason);
});

const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ============================================================================
// SYSTEM ARCHITECTURE CONFIGURATIONS
// ============================================================================
const CHROMIUM_PATH = '/data/data/com.termux/files/usr/bin/chromium-browser';
const COOKIES_FILE = path.join(__dirname, 'cookies.json');
const HISTORY_FILE = path.join(__dirname, 'history.json');
const DOWNLOAD_FOLDER = '/storage/emulated/0/Reels';
const LOCK_FILE_PATH = path.join(DOWNLOAD_FOLDER, 'download.lock');

// ============================================================================
// GRACEFUL SHUTDOWN INTERCEPTOR (Ctrl+C Cleanup)
// ============================================================================
const cleanupAndExit = () => {
    console.log('\n🛑 Script interrupted via Ctrl+C. Cleaning up lock file...');
    try {
        if (fs.existsSync(LOCK_FILE_PATH)) {
            fs.unlinkSync(LOCK_FILE_PATH);
            console.log('🗑️ download.lock successfully removed from Reels folder.');
        }
    } catch (e) {
        console.log('⚠️ Could not remove lock file during shutdown:', e.message);
    }
    process.exit(0);
};

// Catch Ctrl+C and system termination events
process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);

const TARGET_DOWNLOAD_COUNT = 400;
const MAX_HISTORY_SIZE = 15000;

if (!fs.existsSync(DOWNLOAD_FOLDER)) {
    fs.mkdirSync(DOWNLOAD_FOLDER, { recursive: true });
}

let downloadedVideoIds = [];
if (fs.existsSync(HISTORY_FILE)) {
    try {
        downloadedVideoIds = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
        console.log(`📦 Loaded ${downloadedVideoIds.length} historical Reel IDs from history.json`);
    } catch (e) {
        console.log('⚠️ History log corrupted, initializing fresh array.');
        downloadedVideoIds = [];
    }
}

let downloadCount = 0;
let downloadQueue = []; 
let isDownloading = false;

function saveToHistory(videoId) {
    if (downloadedVideoIds.includes(videoId)) return;
    downloadedVideoIds.push(videoId);
    if (downloadedVideoIds.length > MAX_HISTORY_SIZE) {
        const itemsToRemove = downloadedVideoIds.length - MAX_HISTORY_SIZE;
        downloadedVideoIds.splice(0, itemsToRemove);
        console.log(`\n🧹 History limit reached. Purged ${itemsToRemove} oldest entries from log.`);
    }
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(downloadedVideoIds, null, 2), 'utf8');
}

// ============================================================================
// LIKE SYNC ENGINE (Decodes raw long IDs and executes native finger-taps)
// ============================================================================
async function processPlayerLikes(page) {
    const LIKES_FILE = path.join(DOWNLOAD_FOLDER, 'pending_likes.json');
    if (!fs.existsSync(LIKES_FILE)) return;

    try {
        const fileContent = fs.readFileSync(LIKES_FILE, 'utf8');
        let pendingIds = [];
        try {
            pendingIds = JSON.parse(fileContent);
        } catch (jsonErr) {
            return;
        }

        if (!Array.isArray(pendingIds) || pendingIds.length === 0) return;

        console.log(`\n❤️ Found ${pendingIds.length} pending Likes shared from Player App. Processing Priority Queue...`);

        for (const id of pendingIds) {
            let targetShortcode = id;

            // Mathematical Base64 shortcode resolution for raw internal long IDs
            if (/^\d+(_\d+)?$/.test(id)) {
                const mediaIdStr = id.split('_')[0];
                try {
                    let num = BigInt(mediaIdStr);
                    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
                    let buildCode = '';
                    while (num > 0n) {
                        let remainder = num % 64n;
                        buildCode = alphabet[Number(remainder)] + buildCode;
                        num = num / 64n;
                    }
                    targetShortcode = buildCode;
                } catch (err) {
                    targetShortcode = id;
                }
            }

            console.log(`  -> Automated targeting for Reel ID: ${id} (Resolved Shortcode: ${targetShortcode})`);
            try {
                await page.goto(`https://www.instagram.com/reels/${targetShortcode}/`, { 
                    waitUntil: 'domcontentloaded', 
                    timeout: 20000 
                });
                
                await page.waitForTimeout(4000); // Allow mobile layouts to fully settle

                // Safeguard: Check if already liked to prevent accidentally toggling it back off
                const alreadyLiked = await page.$('button:has(svg[aria-label="Unlike"]), svg[aria-label="Unlike"], [aria-label="Unlike"]').catch(() => null);
                if (alreadyLiked) {
                    console.log(`     ℹ️ Reel is already liked. Skipping to avoid toggle-off.`);
                    continue;
                }

                let interactionSuccess = false;

                // TIER 1: Find physical Like Button & execute true Native Mobile Touch Tap
                const heartBtn = await page.$('button:has(svg[aria-label="Like"]), svg[aria-label="Like"], [aria-label="Like"]').catch(() => null);
                if (heartBtn) {
                    const box = await heartBtn.boundingBox().catch(() => null);
                    if (box) {
                        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
                        console.log(`     ✅ Heart Button Native Touch-Tapped.`);
                        interactionSuccess = true;
                    }
                }

                // TIER 2: Double-Touch Tap gesture directly on the center of the Video Viewport
                if (!interactionSuccess) {
                    const videoEl = await page.$('video').catch(() => null);
                    if (videoEl) {
                        const box = await videoEl.boundingBox().catch(() => null);
                        if (box) {
                            const centerX = box.x + box.width / 2;
                            const centerY = box.y + box.height / 2;
                            // Fast sequential screen taps to satisfy touch gesture listeners
                            await page.touchscreen.tap(centerX, centerY);
                            await page.waitForTimeout(80);
                            await page.touchscreen.tap(centerX, centerY);
                            console.log(`     ✅ Video Viewport Double-Touch Tapped.`);
                            interactionSuccess = true;
                        }
                    }
                }

                // TIER 3: Programmatic DOM-level click dispatch fallback
                if (!interactionSuccess) {
                    const evalRes = await page.evaluate(() => {
                        const btn = document.querySelector('button:has(svg[aria-label="Like"])') || 
                                    document.querySelector('svg[aria-label="Like"]')?.closest('button') || 
                                    document.querySelector('[aria-label="Like"]');
                        if (btn) {
                            btn.click();
                            return true;
                        }
                        return false;
                    }).catch(() => false);

                    if (evalRes) {
                        console.log(`     ✅ JS DOM Click Dispatched to Like Button.`);
                        interactionSuccess = true;
                    }
                }

                if (!interactionSuccess) {
                    console.log(`     ❌ Error: Interaction handlers could not locate target structures.`);
                }

                await page.waitForTimeout(2000);
            } catch (err) {
                console.log(`     ❌ Link unavailable or skipped: ${err.message}`);
            }
        }

        fs.writeFileSync(LIKES_FILE, JSON.stringify([]), 'utf8');
        console.log('❤️ Priority Likes sync sequence finalized.\n');
    } catch (e) {
        console.log('⚠️ Notice processing sync pipeline:', e.message);
    }
}

// ============================================================================
// NON-BLOCKING ASYNC DOWNLOAD WORKER (CLEAN PIPELINE WITHOUT JITTER)
// ============================================================================
async function processDownloadQueue() {
    if (isDownloading || downloadQueue.length === 0 || downloadCount >= TARGET_DOWNLOAD_COUNT) {
        if (downloadQueue.length === 0 && !isDownloading) {
            try { if (fs.existsSync(LOCK_FILE_PATH)) fs.unlinkSync(LOCK_FILE_PATH); } catch(e){}
        }
        setTimeout(processDownloadQueue, 500);
        return;
    }
    
    isDownloading = true;

    try {
        fs.writeFileSync(LOCK_FILE_PATH, 'ACTIVE', 'utf8');
    } catch (lockError) {
        console.log('⚠️ Storage write permission denied. Run: termux-setup-storage');
    }

    const task = downloadQueue.shift();
    const filePath = path.join(DOWNLOAD_FOLDER, `reel_${task.id}.mp4`);

    try {
        const response = await axios({
            method: 'GET',
            url: task.url,
            responseType: 'stream',
            timeout: 20000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                'Accept': '*/*'
            }
        });

        const writer = fs.createWriteStream(filePath);
        
        await new Promise((resolve) => {
            response.data.pipe(writer);

            writer.on('finish', () => {
                downloadCount++;
                saveToHistory(task.id); 
                console.log(`  -> [SAVED] Progress: ${downloadCount}/${TARGET_DOWNLOAD_COUNT} files. (Queue size: ${downloadQueue.length})`);
                
                if (downloadQueue.length === 0) {
                    try { if (fs.existsSync(LOCK_FILE_PATH)) fs.unlinkSync(LOCK_FILE_PATH); } catch(e){}
                }
                resolve();
            });

            const handleFailure = () => {
                writer.end();
                try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch(e){}
                if (downloadQueue.length === 0) {
                    try { if (fs.existsSync(LOCK_FILE_PATH)) fs.unlinkSync(LOCK_FILE_PATH); } catch(e){}
                }
                resolve();
            };

            response.data.on('error', handleFailure);
            writer.on('error', handleFailure);
        });
    } catch (error) {
        // Fail silently and keep processing queue forward
    }

    isDownloading = false;
    setTimeout(processDownloadQueue, 300);
}

function findVideoUrls(obj, foundLinks = []) {
    if (!obj || typeof obj !== 'object') return foundLinks;
    
    if (obj.video_versions && Array.isArray(obj.video_versions) && obj.video_versions.length > 0) {
        const id = obj.id || obj.pk || Math.random().toString(36).substring(7);
        foundLinks.push({ url: obj.video_versions[0].url, id: id });
    }
    
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            findVideoUrls(obj[key], foundLinks);
        }
    }
    return foundLinks;
}

// ============================================================================
// AUTOMATION ENGINE
// ============================================================================
(async () => {
    console.log('Initializing Termux Android Native Scraper Pipeline...');

    const browser = await chromium.launch({
        executablePath: CHROMIUM_PATH,
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled'
        ]
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true
    });

    if (fs.existsSync(COOKIES_FILE)) {
        const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
        await context.addCookies(cookies);
        console.log('Successfully injected authenticated session cookies.');
    } else {
        console.error('CRITICAL ERROR: cookies.json is missing!');
        process.exit(1);
    }

    const page = await context.newPage();

    try {
        console.log('Navigating directly to Reels target area...');
        await page.goto('https://www.instagram.com/reels/', {
            waitUntil: 'networkidle',
            timeout: 60000
        });
    } catch (gotoError) {
        console.log('⚠️  Navigation warning:', gotoError.message);
    }
    
    const finalUrl = page.url();
    console.log(`Verified Browser Location: ${finalUrl}`);

    if (!finalUrl.includes('/reels/')) {
        console.error('❌ CRITICAL: Session cookies likely expired or invalid.');
        await browser.close();
        process.exit(1);
    }

    // 1️⃣ Run the touch-native interaction priority queue first
    await processPlayerLikes(page);

    // 2️⃣ Spin up the single instance non-blocking background downloader loop
    processDownloadQueue();

    page.on('response', async (response) => {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';
        
        if ((url.includes('/api/v1/clips/home/') || url.includes('graphql/query')) && contentType.includes('json')) {
            try {
                const json = await response.json();
                const targets = findVideoUrls(json);
                for (const target of targets) {
                    if (downloadCount >= TARGET_DOWNLOAD_COUNT) break;
                    if (downloadedVideoIds.includes(target.id)) continue;

                    if (!downloadQueue.some(item => item.id === target.id)) {
                        console.log(`[QUEUE] Intercepted NEW Reel ID: ${target.id}`);
                        downloadQueue.push(target);
                    }
                }
            } catch (e) {}
        }
    });

    console.log('Connected to Algorithmic Feed Stream. Beginning automatic crawl loop...');

    let lastDownloadCount = 0;
    let stuckCounter = 0;

    while (downloadCount < TARGET_DOWNLOAD_COUNT) {
        
        if (downloadQueue.length > 20) {
            console.log(`\n🛑 [QUEUE THRESHOLD EXCEEDED] Queue is at ${downloadQueue.length}. Pausing player view to protect feed integrity...`);
            
            try {
                // Perform a short tap on the visual canvas to pause media playback safely
                await page.touchscreen.tap(195, 400);
            } catch (err) {}

            while (downloadQueue.length > 5) {
                await page.waitForTimeout(1000);
            }

            console.log('▶️ [QUEUE CLEAR] Backlog cleared below threshold safety limit. Resuming feed engine...\n');
            try {
                await page.touchscreen.tap(195, 400);
            } catch (err) {}
        }

        if (downloadCount > 0 && downloadCount % 20 === 0) {
            const randomNapTime = Math.floor(Math.random() * 4000) + 2000;
            console.log(`\n☕ [HUMAN BREAK] Simulating stepping away for ${Math.round(randomNapTime/1000)}s...`);
            await page.waitForTimeout(randomNapTime);
            console.log('▶️  Resuming feed stream...\n');
        }

        try {
            const startX = 195 + (Math.random() * 30 - 15);
            const startY = 680 + (Math.random() * 40 - 20);
            const endY = 130 + (Math.random() * 30 - 15);

            await page.mouse.move(startX, startY);
            await page.mouse.down();
            await page.mouse.move(startX - (Math.random() * 12), 430, { steps: Math.floor(Math.random() * 3) + 4 });
            await page.mouse.move(startX + (Math.random() * 8), endY, { steps: Math.floor(Math.random() * 3) + 4 });
            await page.mouse.up();
            
            console.log(`[TOUCH SWIPE] Crawled feed step. Saved items: ${downloadCount}/${TARGET_DOWNLOAD_COUNT}`);
        } catch (swipeError) {
            try { await page.evaluate(() => window.scrollBy(0, window.innerHeight)); } catch(e){}
        }

        if (downloadCount === lastDownloadCount) {
            stuckCounter++;
            
            if (stuckCounter > 2) {
                const currentUrl = page.url();
                
                if (currentUrl.match(/\/reels\/[A-Za-z0-9_-]+\//)) {
                    console.log('⚠️  [PATH CORRECTION] Trapped inside a static Reel deep link context. Steering back to main stream...');
                    try {
                        await page.evaluate(() => {
                            window.location.href = 'https://www.instagram.com/reels/';
                        });
                        await page.waitForTimeout(4000);
                    } catch (urlErr) {}
                    stuckCounter = 0;
                    continue;
                }

                console.log('⚠️  [STUCK SEGMENT] Container tracking lost. Re-focusing viewport elements...');
                try {
                    await page.touchscreen.tap(195, 400);
                    await page.waitForTimeout(400);
                    
                    await page.evaluate(() => {
                        const mainContainer = document.querySelector('main') || window;
                        mainContainer.scrollBy(0, window.innerHeight);
                    });
                } catch (scrollErr) {}
                stuckCounter = 0;
            }
        } else {
            stuckCounter = 0;
            lastDownloadCount = downloadCount;
        }
        
        const behavioralRoll = Math.random();
        let viewDelay = Math.floor(Math.random() * 2500) + 3500; 
        
        if (behavioralRoll < 0.20) {
            viewDelay = Math.floor(Math.random() * 800) + 1200;
            console.log('  -> [BEHAVIOR] Simulating immediate rapid swipe-past...');
            
        } else if (behavioralRoll > 0.82 && behavioralRoll <= 0.92) {
            console.log('  -> [BEHAVIOR] Simulating deeply engaged play session...');
            try {
                const jitterX = 195 + Math.floor(Math.random() * 40 - 20);
                const jitterY = 422 + Math.floor(Math.random() * 40 - 20);
                
                await page.touchscreen.tap(jitterX, jitterY);
                await page.waitForTimeout(Math.floor(Math.random() * 1500) + 1000);
                
                await page.evaluate(() => window.scrollBy(0, 120));
                await page.waitForTimeout(Math.floor(Math.random() * 2000) + 2000);
                
                await page.evaluate(() => window.scrollBy(0, -120));
                await page.waitForTimeout(Math.floor(Math.random() * 1000) + 1000);
                
                await page.touchscreen.tap(jitterX, jitterY);
            } catch (err) {}
            viewDelay = Math.floor(Math.random() * 2000) + 2000;

        } else if (behavioralRoll > 0.92 && behavioralRoll <= 0.96) {
            console.log('  -> [BEHAVIOR] Simulating device slip / grip fumble behavior...');
            try {
                const fumbleX = Math.random() < 0.5 ? (30 + Math.random() * 40) : (340 + Math.random() * 30);
                const fumbleY = 300 + Math.floor(Math.random() * 200);
                
                await page.mouse.move(fumbleX, fumbleY);
                await page.mouse.down();
                await page.mouse.move(fumbleX + (Math.random() * 40 - 20), fumbleY - (Math.random() * 60 + 20), { steps: 2 });
                await page.mouse.up();
                console.log('     -> Unintentional screen swipe registered.');
                
                const recoveryPause = Math.floor(Math.random() * 2500) + 2000;
                console.log(`     -> Pausing ${Math.round(recoveryPause/1000)}s for natural hand grip readjustment...`);
                await page.waitForTimeout(recoveryPause);
            } catch (err) {}
            viewDelay = Math.floor(Math.random() * 2000) + 2000;

        } else if (behavioralRoll > 0.96) {
            console.log('  -> [BEHAVIOR] Simulating profile context discovery tracking detour...');
            try {
                const profileHandleX = 65 + Math.floor(Math.random() * 30 - 15);
                const profileHandleY = 745 + Math.floor(Math.random() * 20 - 10);
                
                await page.touchscreen.tap(profileHandleX, profileHandleY);
                console.log('     -> Navigating away from main feed to examine profile grid details...');
                
                await page.waitForTimeout(Math.floor(Math.random() * 3000) + 4000);
                
                await page.goBack({ waitUntil: 'domcontentloaded' });
                console.log('     -> Executed native history navigation back. Returned to operational stream baseline.');
            } catch (err) {}
            viewDelay = Math.floor(Math.random() * 3000) + 3000;
        }

        await page.waitForTimeout(viewDelay);
    }

    while(downloadQueue.length > 0 || isDownloading) {
        await new Promise(r => setTimeout(r, 1000));
    }

    try { if (fs.existsSync(LOCK_FILE_PATH)) fs.unlinkSync(LOCK_FILE_PATH); } catch(e){}

    console.log(`\n🎉 Success! Processed session cap of ${downloadCount} fresh items into storage.`);
    await browser.close();
})();