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
echo "    STARTING SCOUT TALK SERVER INSTALLER    "
echo "=========================================="

# Update System
echo "[1/8] Updating System Packages..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - > /dev/null
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
    echo "No package.json found. Initializing minimal setup..."
    npm init -y > /dev/null
fi

# Configure Firewall (UFW)
echo "[5/8] Configuring Firewall..."
sudo ufw allow ssh > /dev/null
sudo ufw allow $PORT/udp
echo "Allowed UDP Port $PORT"

# Start Application with PM2
echo "[6/8] Starting Server..."
pm2 delete $APP_NAME 2> /dev/null || true
pm2 start $MAIN_FILE --name "$APP_NAME"

# Save PM2 List for Startup
echo "[7/8] Configuring Startup..."
pm2 save
ENV_PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME | grep "sudo" | bash

# Set Permissions for Maintenance Scripts
echo "[8/8] Setting script permissions..."
if [ -f "update.sh" ]; then
    chmod +x update.sh
    echo "Successfully made update.sh executable."
else
    echo "Warning: update.sh not found in repository."
fi

echo "=========================================="
echo "    INSTALLATION COMPLETE! "
echo "=========================================="
echo "Server is running."
echo "You can now run ./update.sh to pull new changes."
