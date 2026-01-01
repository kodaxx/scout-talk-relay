#!/bin/bash

# --- CONFIGURATION ---
REPO_DIR="scout-talk-relay"
APP_NAME="scout-talk-relay"

# Stop script on error
set -e

echo "=========================================="
echo "    UPDATING SCOUT TALK RELAY SERVER      "
echo "=========================================="

# Navigate to directory
if [ -d "$REPO_DIR" ]; then
    cd "$REPO_DIR"
else
    echo "Error: $REPO_DIR directory not found. Please run the install script first."
    exit 1
fi

# Pull latest changes
echo "[1/4] Pulling latest code from Git..."
git pull

# Install/Update Dependencies
echo "[2/4] Updating npm dependencies..."
if [ -f "package.json" ]; then
    npm install
else
    echo "No package.json found, skipping npm install."
fi

# Restart the service
echo "[3/4] Restarting service with PM2..."
pm2 restart $APP_NAME

# Save PM2 state
echo "[4/4] Saving PM2 process list..."
pm2 save

echo "=========================================="
echo "          UPDATE COMPLETE!                "
echo "=========================================="
echo "Your server is now running the latest version."
echo "View status: pm2 status"
echo "View logs:   pm2 logs $APP_NAME"
