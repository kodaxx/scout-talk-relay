const dgram = require('dgram');
const http = require('http');
const server = dgram.createSocket('udp4');

const UDP_PORT = 6000;
const WEB_PORT = 8080;
const TRUNK_CHANNEL = 0;

// --- Diagnostics State ---
let stats = {
    packetsIn: 0,
    packetsOut: 0,
    droppedLocal: 0,
    loopLag: 0,
    startTime: Date.now()
};

// Monitor Event Loop Lag (High lag = Choppy Audio)
let lastLoop = Date.now();
setInterval(() => {
    const now = Date.now();
    stats.loopLag = now - lastLoop - 100; // Aiming for 100ms interval
    lastLoop = now;
}, 100);

const channels = {}; 

function forwardToChannel(msg, senderKey, targetChannelId) {
    const peers = channels[targetChannelId];
    if (!peers) return;

    for (const [peerKey] of Object.entries(peers)) {
        if (peerKey !== senderKey) {
            const [peerIp, peerPort] = peerKey.split(':');
            server.send(msg, parseInt(peerPort), peerIp, (err) => {
                if (err) stats.droppedLocal++;
                else stats.packetsOut++;
            });
        }
    }
}

server.on('message', (msg, rinfo) => {
    stats.packetsIn++;
    if (msg.length < 11) return;

    const type = msg.readUInt8(0);
    const userId = msg.readUInt32BE(1);
    const channelId = msg.readUInt16BE(5);
    const clientKey = `${rinfo.address}:${rinfo.port}`;
    
    if (!channels[channelId]) channels[channelId] = {};
    channels[channelId][clientKey] = { 
        userId, 
        lastSeen: Date.now(), 
        lastAudio: type === 1 ? Date.now() : (channels[channelId][clientKey]?.lastAudio || 0)
    };

    if (type === 1) { 
        forwardToChannel(msg, clientKey, channelId);
        if (channelId !== TRUNK_CHANNEL) forwardToChannel(msg, clientKey, TRUNK_CHANNEL);
    }
});

// --- Enhanced Web Dashboard ---
const webServer = http.createServer((req, res) => {
    if (req.url === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ channels, stats, now: Date.now() }));
        return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
        <html>
            <head>
                <title>Relay Diagnostics</title>
                <style>
                    body { font-family: sans-serif; background: #121212; color: #e0e0e0; padding: 20px; }
                    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px; }
                    .stat-card { background: #1e1e1e; padding: 15px; border-radius: 8px; border: 1px solid #333; text-align: center; }
                    .stat-val { display: block; font-size: 1.8em; font-weight: bold; color: #3498db; }
                    .warning { color: #e74c3c !important; }
                    .channel-card { background: #1e1e1e; padding: 15px; margin-bottom: 10px; border-radius: 8px; border-left: 4px solid #444; }
                </style>
            </head>
            <body>
                <h1>Network Health Monitor</h1>
                
                <div class="stats-grid">
                    <div class="stat-card"><span class="stat-val" id="pkIn">-</span>Packets Recv</div>
                    <div class="stat-card"><span class="stat-val" id="pkOut">-</span>Packets Sent</div>
                    <div class="stat-card"><span class="stat-val" id="lag">-</span>Loop Lag (ms)</div>
                    <div class="stat-card"><span class="stat-val" id="drop">-</span>Local Drops</div>
                </div>

                <div id="display"></div>

                <script>
                    async function update() {
                        const res = await fetch('/api/status');
                        const data = await res.json();
                        
                        document.getElementById('pkIn').innerText = data.stats.packetsIn.toLocaleString();
                        document.getElementById('pkOut').innerText = data.stats.packetsOut.toLocaleString();
                        document.getElementById('drop').innerText = data.stats.droppedLocal;
                        
                        const lagEl = document.getElementById('lag');
                        lagEl.innerText = data.stats.loopLag;
                        lagEl.className = 'stat-val ' + (data.stats.loopLag > 20 ? 'warning' : '');

                        let html = '';
                        for (const [chId, peers] of Object.entries(data.channels)) {
                            html += \`<div class="channel-card"><strong>Channel \${chId}</strong> (\${Object.keys(peers).length} peers)</div>\`;
                        }
                        document.getElementById('display').innerHTML = html;
                    }
                    setInterval(update, 1000);
                </script>
            </body>
        </html>
    `);
});

server.bind(UDP_PORT);
webServer.listen(WEB_PORT);
