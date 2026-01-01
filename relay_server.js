const dgram = require('dgram');
const http = require('http'); // Added for the webapp
const server = dgram.createSocket('udp4');

// --- Configuration ---
const UDP_PORT = 6000;
const WEB_PORT = 8080; // Access dashboard at http://localhost:8080
const TIMEOUT_MS = 45000;
const TRUNK_CHANNEL = 0;

// --- State Storage ---
const channels = {};

// --- Web Dashboard Logic ---
const webServer = http.createServer((req, res) => {
    if (req.url === '/api/status') {
        // Return active sessions as JSON
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(channels, null, 2));
    } else {
        // Simple HTML Dashboard
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <html>
                <head><title>Relay Monitor</title></head>
                <body style="font-family: sans-serif; padding: 20px; background: #f4f4f9;">
                    <h1>Live UDP Relay Dashboard</h1>
                    <div id="display">Loading...</div>
                    <script>
                        async function update() {
                            const res = await fetch('/api/status');
                            const data = await res.json();
                            let html = '';
                            for (const [ch, peers] of Object.entries(data)) {
                                const isTrunk = ch == "${TRUNK_CHANNEL}";
                                html += \`<div style="background:white; padding:10px; margin-bottom:10px; border-radius:8px; border-left: 5px solid \${isTrunk ? '#e74c3c' : '#3498db'}">
                                    <strong>Channel \${ch} \${isTrunk ? '(GLOBAL TRUNK)' : ''}</strong><br/>
                                    \${Object.keys(peers).map(p => ' - ' + p).join('<br/>')}
                                </div>\`;
                            }
                            document.getElementById('display').innerHTML = html || 'No active sessions';
                        }
                        setInterval(update, 2000); // Update every 2 seconds
                        update();
                    </script>
                </body>
            </html>
        `);
    }
});

// --- UDP Protocol Logic ---
function forwardToChannel(msg, senderKey, targetChannelId) {
    const peers = channels[targetChannelId];
    if (!peers) return;
    for (const [peerKey] of Object.entries(peers)) {
        if (peerKey !== senderKey) {
            const [peerIp, peerPort] = peerKey.split(':');
            server.send(msg, parseInt(peerPort), peerIp);
        }
    }
}

server.on('message', (msg, rinfo) => {
    if (msg.length < 11) return;
    const type = msg.readUInt8(0);
    const channelId = msg.readUInt16BE(5);
    const clientKey = `${rinfo.address}:${rinfo.port}`;
    
    if (!channels[channelId]) channels[channelId] = {};
    channels[channelId][clientKey] = Date.now();

    if (type === 1) { // TYPE_AUDIO
        forwardToChannel(msg, clientKey, channelId);
        if (channelId !== TRUNK_CHANNEL) forwardToChannel(msg, clientKey, TRUNK_CHANNEL);
    }
});

// Cleanup Task
setInterval(() => {
    const now = Date.now();
    for (const ch in channels) {
        for (const key in channels[ch]) {
            if (now - channels[ch][key] > TIMEOUT_MS) delete channels[ch][key];
        }
        if (Object.keys(channels[ch]).length === 0) delete channels[ch];
    }
}, 10000);

// Bind both servers
server.bind(UDP_PORT, () => console.log(`UDP Relay: ${UDP_PORT}`));
webServer.listen(WEB_PORT, () => console.log(`Web Dashboard: http://localhost:${WEB_PORT}`));
