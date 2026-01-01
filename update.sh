#!/bin/bash

# --- CONFIGURATION ---
APP_NAME="scout-talk-relay"

# Stop script on error
set -e

echo "=========================================="
echo "    UPDATING SCOUT TALK RELAY SERVER      "
echo "=========================================="

# 1. Verify we are in a git repo
if [ ! -d ".git" ]; then
    echo "Error: This script must be run from the root of the scout-talk-relay directory."
    exit 1
fi

# 2. Pull latest changes
echo "[1/4] Pulling latest code from Git..."
git pull origin main || git pull # Handles cases where branch might not be 'main'

# 3. Install/Update Dependencies
echo "[2/4] Updating npm dependencies..."
if [ -f "package.json" ]; then
    # 'npm install' ensures new files in state.js or dashboard.js are handled
    npm install --production
else
    echo "No package.json found, skipping npm install."
fi

# 4. Restart the service
echo "[3/4] Restarting service with PM2..."
# Using 'pm2 restart' reloads all files including state.js and dashboard.js
pm2 restart $APP_NAME --update-env

# 5. Save PM2 state
echo "[4/4] Saving PM2 process list..."
pm2 save

echo "=========================================="
echo "          UPDATE COMPLETE!                "
echo "=========================================="
echo "Your server is now running the latest version."
echo "------------------------------------------"
echo "Current Status:"
pm2 status $APP_NAME