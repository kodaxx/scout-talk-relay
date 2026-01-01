#!/bin/bash

# --- CONFIGURATION ---
REPO_URL="https://github.com/kodaxx/scout-talk-relay.git"
REPO_DIR="scout-talk-relay"
MAIN_FILE="relay_server.js"
APP_NAME="scout-talk-relay"
PORT=6000

# Stop script on error
set -e

echo "=========================================="
echo "   STARTING SCOUT TALK SERVER INSTALLER   "
echo "=========================================="

# Update System
echo "[1/7] Updating System Packages..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - > /dev/null
sudo apt-get install -y nodejs git ufw > /dev/null

# Install Global Tools (PM2)
echo "[2/7] Installing PM2 (Process Manager)..."
sudo npm install -g pm2 > /dev/null

# Clone or Update Repository
echo "[3/7] Fetching Source Code..."
if [ -d "$REPO_DIR" ]; then
    echo "Directory exists. Pulling latest changes..."
    cd "$REPO_DIR"
    git pull
else
    git clone "$REPO_URL"
    cd "$REPO_DIR"
fi

# Install Project Dependencies
echo "[4/7] Installing Dependencies..."
# Check if package.json exists, otherwise init and install dgram
if [ -f "package.json" ]; then
    npm install
else
    echo "No package.json found. Initializing minimal setup..."
    npm init -y > /dev/null
    # dgram is built-in, but in the future I may add other dependencies
fi

# Configure Firewall (UFW)
echo "[5/7] Configuring Firewall..."
sudo ufw allow ssh > /dev/null  # Don't lock ourselves out!
sudo ufw allow $PORT/udp
echo "Allowed UDP Port $PORT"

# Start Application with PM2
echo "[6/7] Starting Server..."
# Stop existing instance if running to ensure fresh start
pm2 delete $APP_NAME 2> /dev/null || true
pm2 start $MAIN_FILE --name "$APP_NAME"

# Save PM2 List for Startup
echo "[7/7] Configuring Startup..."
pm2 save
# This trick automatically runs the pm2 startup command for the current user
ENV_PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME | grep "sudo" | bash

echo "=========================================="
echo "   INSTALLATION COMPLETE! "
echo "=========================================="
echo "Server is running."
echo "Check logs with: pm2 logs $APP_NAME"
