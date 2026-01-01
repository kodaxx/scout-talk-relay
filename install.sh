#!/bin/bash

# --- CONFIGURATION ---
REPO_URL="https://github.com/kodaxx/scout-talk-relay.git"
REPO_DIR="scout-talk-relay"
MAIN_FILE="server.js"  # Pointing to the new modular entry point
APP_NAME="scout-talk-relay"
UDP_PORT=6000
WEB_PORT=8080

# Stop script on error
set -e

echo "=========================================="
echo "    STARTING SCOUT TALK SERVER INSTALLER    "
echo "=========================================="

# Update System
echo "[1/8] Updating System Packages..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - > /dev/null
sudo apt-get update > /dev/null
sudo apt-get install -y nodejs git ufw > /dev/null

# Install Global Tools (PM2)
echo "[2/8] Installing PM2 (Process Manager)..."
sudo npm install -g pm2 > /dev/null

# Clone or Update Repository
echo "[3/8] Fetching Source Code..."
if [ -d "$REPO_DIR" ]; then
    echo "Directory exists. Pulling latest changes..."
    cd "$REPO_DIR"
    git pull
else
    git clone "$REPO_URL"
    cd "$REPO_DIR"
fi

# Install Project Dependencies
echo "[4/8] Installing Dependencies..."
if [ -f "package.json" ]; then
    npm install
else
    echo "No package.json found. Creating minimal setup..."
    npm init -y > /dev/null
fi

# Configure Firewall (UFW)
echo "[5/8] Configuring Firewall..."
sudo ufw allow ssh > /dev/null
sudo ufw allow $UDP_PORT/udp > /dev/null
sudo ufw allow $WEB_PORT/tcp > /dev/null # Added for Dashboard
echo "Allowed UDP Port $UDP_PORT (Radio Traffic)"
echo "Allowed TCP Port $WEB_PORT (Dashboard UI)"

# Start Application with PM2
echo "[6/8] Starting Server..."
pm2 delete $APP_NAME 2> /dev/null || true
# Start server.js which pulls in state.js and dashboard.js
pm2 start $MAIN_FILE --name "$APP_NAME"

# Save PM2 List for Startup
echo "[7/8] Configuring Startup..."
pm2 save
# This logic auto-executes the PM2 startup command for the current user
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME --force

# Set Permissions for Maintenance Scripts
echo "[8/8] Setting script permissions..."
if [ -f "update.sh" ]; then
    chmod +x update.sh
    echo "Successfully made update.sh executable."
fi

echo "=========================================="
echo "    INSTALLATION COMPLETE! "
echo "=========================================="
echo "Relay: 0.0.0.0:$UDP_PORT"
echo "Dashboard: http://$(curl -s ifconfig.me):$WEB_PORT"
echo "------------------------------------------"
echo "Run 'pm2 logs $APP_NAME' to see live traffic."