#!/bin/bash

# Define paths
DIR="$HOME/insta-bulk-grabber"
GRABBER_FILE="$DIR/android_grabber.js"
COOKIES_FILE="$DIR/cookies.json"

echo "============================================="
echo "   Insta Bulk Grabber Configurator          "
echo "============================================="
echo ""

# 1. Ask about Download Count
read -p "Do you want to update the Download Count? (y/n): " edit_count
if [[ "$edit_count" =~ ^[Yy]$ ]]; then
    if [ -f "$GRABBER_FILE" ]; then
        read -p "Enter new target download count: " new_count
        # Basic validation to ensure it's a number
        if [[ "$new_count" =~ ^[0-9]*$ ]]; then
            # Uses sed to look for the pattern and replace whatever number is currently there
            sed -i "s/const TARGET_DOWNLOAD_COUNT = [0-9]*;/const TARGET_DOWNLOAD_COUNT = $new_count;/g" "$GRABBER_FILE"
            echo "✅ Successfully updated download count to $new_count in Android_grabber.js"
        else
            echo "❌ Invalid number. Skipping download count update."
        fi
    else
        echo "❌ Error: Android_grabber.js not found!"
    fi
fi

echo ""

# 2. Ask about Cookies/Session ID
read -p "Do you want to update your Cookies / Session ID? (y/n): " edit_cookies
if [[ "$edit_cookies" =~ ^[Yy]$ ]]; then
    if [ -f "$COOKIES_FILE" ]; then
        read -p "Enter your new Session ID / Cookie text: " new_cookie
        # Replaces "value": "..." with the user's input
        sed -i "s/\"value\": \"[^\"]*\"/\"value\": \"$new_cookie\"/g" "$COOKIES_FILE"
        echo "✅ Successfully updated Session ID in cookies.json"
    else
        echo "❌ Error: cookies.json not found!"
    fi
fi

echo ""
echo "Configuration complete!"
