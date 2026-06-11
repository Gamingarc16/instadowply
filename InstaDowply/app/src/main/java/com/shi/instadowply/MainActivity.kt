package com.shi.instadowply

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import java.io.File

class MainActivity : ComponentActivity() {

    private lateinit var sharedReelsDir: File
    private lateinit var oldReelsDir: File // 📂 Track old visible directory reference

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val publicStorage = Environment.getExternalStorageDirectory()
        oldReelsDir = File(publicStorage, "Reels")    // Old path
        sharedReelsDir = File(publicStorage, ".Reels")  // New hidden path with a dot

        // Fetch the index position where the user left off last time
        val prefs = getSharedPreferences("instadowply_cache", Context.MODE_PRIVATE)
        val initialSavedIndex = prefs.getInt("LAST_WATCHED_INDEX", 0)

        setContent {
            MaterialTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    var showPermissionDialog by remember { mutableStateOf(false) }

                    LaunchedEffect(Unit) {
                        if (!Environment.isExternalStorageManager()) {
                            showPermissionDialog = true
                        } else {
                            // 🚀 Run migration instantly on startup if storage access is authorized
                            handleMigrationAndFolderSetup()
                        }
                    }

                    // Pass tracking parameters directly to the engine screen surface
                    ReelPlayerScreen(
                        videoDirectory = sharedReelsDir,
                        initialPage = initialSavedIndex,
                        onPageChanged = { index -> saveProgressState(index) },
                        onFeedFinished = { purgeCache() },
                        onLaunchTermux = { launchTermuxScript() }
                    )

                    if (showPermissionDialog) {
                        AlertDialog(
                            onDismissRequest = { },
                            title = { Text("Storage Access Required") },
                            text = { Text("InstaDowply needs 'All Files Access' to play video streams from your shared storage folder.\n\nPlease enable it on the next screen.") },
                            confirmButton = {
                                TextButton(
                                    onClick = {
                                        showPermissionDialog = false
                                        openAllFilesAccessSettings()
                                    }
                                ) { Text("Grant Access") }
                            },
                            dismissButton = {
                                TextButton(onClick = { finish() }) { Text("Exit App") }
                            }
                        )
                    }
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // 🚀 Triggers migration if user just returned from granting "All Files Access"
        if (Environment.isExternalStorageManager()) {
            handleMigrationAndFolderSetup()
        }
    }

    /**
     * 🛠️ Checks for the legacy directory, copies contents over, and removes old footprint
     */
    private fun handleMigrationAndFolderSetup() {
        try {
            if (oldReelsDir.exists() && oldReelsDir.isDirectory) {
                // Ensure the hidden targeted .Reels folder is ready
                if (!sharedReelsDir.exists()) {
                    sharedReelsDir.mkdirs()
                }

                // Batch stream all internal assets across directories
                val legacyFiles = oldReelsDir.listFiles()
                legacyFiles?.forEach { file ->
                    if (file.isFile) {
                        val destinationTarget = File(sharedReelsDir, file.name)
                        
                        // Use instantaneous file table pointer migration (renameTo)
                        val movedSuccessfully = file.renameTo(destinationTarget)
                        
                        // Stream-copy fallback if storage controller flags are busy
                        if (!movedSuccessfully) {
                            try {
                                file.inputStream().use { input ->
                                    destinationTarget.outputStream().use { output ->
                                        input.copyTo(output)
                                    }
                                }
                                file.delete()
                            } catch (e: Exception) {
                                e.printStackTrace()
                            }
                        }
                    }
                }

                // Delete the old visible container folder if it is completely empty now
                if (oldReelsDir.listFiles()?.isEmpty() == true) {
                    oldReelsDir.delete()
                }
            } else {
                // Standard startup routine if old version doesn't exist
                if (!sharedReelsDir.exists()) {
                    sharedReelsDir.mkdirs()
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    /**
     * Commits the active vertical scroll page index to disk safely
     */
    private fun saveProgressState(index: Int) {
        val prefs = getSharedPreferences("instadowply_cache", Context.MODE_PRIVATE)
        prefs.edit().putInt("LAST_WATCHED_INDEX", index).apply()
    }

    private fun openAllFilesAccessSettings() {
        try {
            val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                addCategory(Intent.CATEGORY_DEFAULT)
                data = Uri.parse("package:$packageName")
            }
            startActivity(intent)
        } catch (e: Exception) {
            val intent = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
            startActivity(intent)
        }
    }

    private fun launchTermuxScript() {
        try {
            val intent = Intent().apply {
                setClassName("com.termux", "com.termux.app.TermuxActivity")
                action = Intent.ACTION_MAIN
                addCategory(Intent.CATEGORY_LAUNCHER)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun purgeCache() {
        try {
            if (Environment.isExternalStorageManager() && sharedReelsDir.exists()) {
                sharedReelsDir.listFiles()?.forEach { file ->
                    // Deletes mp4, txt, jpg, and user.txt by looking for the base prefix
                    if (file.isFile && file.name.startsWith("reel_")) {
                        file.delete()
                    }
                }
                // Reset to Index 0 (Reel 1) since memory is cleared
                saveProgressState(0)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        try {
            this.currentFocus?.clearFocus()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}