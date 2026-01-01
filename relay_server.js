const dgram = require('dgram');
const http = require('http');
const server = dgram.createSocket('udp4');

const UDP_PORT = 6000;
const WEB_PORT = 8080;
const TIMEOUT_MS = 45000;
const ACTIVE_THRESHOLD = 2000; // Consider "speaking" if audio sent in last 2s
const TRUNK_CHANNEL = 0;

const channels = {}; 

// --- Helper: Forwarding with Activity Logging ---
function forwardToChannel(msg, senderKey, targetChannelId) {
    const peers = channels[targetChannelId];
    if (!peers) return;

    // Mark the sender as "Active Speaker"
    if (channels[msg.readUInt16BE(5)] && channels[msg.readUInt16BE(5)][senderKey]) {
        channels[msg.readUInt16BE(5)][senderKey].lastAudio = Date.now();
    }

    for (const [peerKey] of Object.entries(peers)) {
        if (peerKey !== senderKey) {
            const [peerIp, peerPort] = peerKey.split(':');
            server.send(msg, parseInt(peerPort), peerIp);
        }
    }
}

// --- UDP Logic ---
server.on('message', (msg, rinfo) => {
    if (msg.length < 11) return;
    const type = msg.readUInt8(0);
    const userId = msg.readUInt32BE(1);
    const channelId = msg.readUInt16BE(5);
    const clientKey = `${rinfo.address}:${rinfo.port}`;
    
    if (!channels[channelId]) channels[channelId] = {};
    
    // Initialize or update session
    if (!channels[channelId][clientKey]) {
        channels[channelId][clientKey] = { userId, lastSeen: Date.now(), lastAudio: 0 };
    } else {
        channels[channelId][clientKey].lastSeen = Date.now();
    }

    if (type === 1) { // TYPE_AUDIO
        forwardToChannel(msg, clientKey, channelId);
        if (channelId !== TRUNK_CHANNEL) forwardToChannel(msg, clientKey, TRUNK_CHANNEL);
    }
});

// --- Web Dashboard ---
const webServer = http.createServer((req, res) => {
    if (req.url === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ channels, now: Date.now() }));
        return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
        <html>
            <head>
                <title>Relay Monitor</title>
                <style>
                    body { font-family: 'Segoe UI', sans-serif; background: #1a1a1a; color: #eee; padding: 20px; }
                    .channel-card { background: #2a2a2a; border-radius: 8px; padding: 15px; margin-bottom: 15px; border-top: 4px solid #444; }
                    .trunk { border-top-color: #ff4757; }
                    .user-row { display: flex; align-items: center; padding: 5px 0; border-bottom: 1px solid #333; }
                    .indicator { width: 12px; height: 12px; border-radius: 50%; margin-right: 10px; background: #444; }
                    .active { background: #2ecc71; box-shadow: 0 0 10px #2ecc71; }
                    .meta { font-size: 0.8em; color: #888; margin-left: auto; }
                    .receiving-label { font-size: 0.7em; color: #3498db; margin-left: 10px; font-weight: bold; }
                </style>
            </head>
            <body>
                <h1>Relay Status <small style="font-size:0.5em; color: #666;">(Port ${UDP_PORT})</small></h1>
                <div id="display"></div>
                <script>
                    async function update() {
                        const res = await fetch('/api/status');
                        const data = await res.json();
                        let html = '';
                        
                        for (const [chId, peers] of Object.entries(data.channels)) {
                            const isTrunk = chId == "${TRUNK_CHANNEL}";
                            const peerCount = Object.keys(peers).length;
                            
                            html += \`<div class="channel-card \${isTrunk ? 'trunk' : ''}">
                                <h3>Channel \${chId} \${isTrunk ? '— GLOBAL TRUNK' : ''} <span style="font-size:0.6em; opacity:0.5">(\${peerCount} connected)</span></h3>\`;
                            
                            for (const [key, info] of Object.entries(peers)) {
                                const isSpeaking = (data.now - info.lastAudio) < ${ACTIVE_THRESHOLD};
                                const recCount = isTrunk ? "Everyone" : (peerCount - 1 + (data.channels["0"] ? Object.keys(data.channels["0"]).length : 0));

                                html += \`<div class="user-row">
                                    <div class="indicator \${isSpeaking ? 'active' : ''}"></div>
                                    <strong>ID: \${info.userId}</strong> 
                                    <span style="margin-left:10px; opacity:0.7">\${key}</span>
                                    \${isSpeaking ? '<span class="receiving-label">▶ SENDING TO ' + recCount + ' PEERS</span>' : ''}
                                    <div class="meta">Seen: \${Math.round((data.now - info.lastSeen)/1000)}s ago</div>
                                </div>\`;
                            }
                            html += '</div>';
                        }
                        document.getElementById('display').innerHTML = html || 'No activity detected.';
                    }
                    setInterval(update, 1000);
                    update();
                </script>
            </body>
        </html>
    `);
});

// Cleanup Stale Sessions
setInterval(() => {
    const now = Date.now();
    for (const ch in channels) {
        for (const key in channels[ch]) {
            if (now - channels[ch][key].lastSeen > TIMEOUT_MS) delete channels[ch][key];
        }
        if (Object.keys(channels[ch]).length === 0) delete channels[ch];
    }
}, 5000);

server.bind(UDP_PORT);
webServer.listen(WEB_PORT);
