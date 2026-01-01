const dgram = require('dgram');
const http = require('http');
const server = dgram.createSocket('udp4');

const UDP_PORT = 6000;
const WEB_PORT = 8080;
const TRUNK_CHANNEL = 0;
const TIMEOUT_MS = 45000;

let stats = {
    packetsIn: 0,
    packetsOut: 0,
    upstreamLoss: 0, // Client -> Server (detected via Sequence gaps)
    downstreamErrors: 0, // Server -> Client (detected via OS send errors)
    loopLag: 0
};

const channels = {}; 

// --- Event Loop Monitor ---
let lastLoop = Date.now();
setInterval(() => {
    const now = Date.now();
    stats.loopLag = now - lastLoop - 100;
    lastLoop = now;
}, 100);

server.on('message', (msg, rinfo) => {
    stats.packetsIn++;
    if (msg.length < 11) return;

    const type = msg.readUInt8(0);
    const userId = msg.readUInt32BE(1);
    const channelId = msg.readUInt16BE(5);
    const sequence = msg.readUInt16BE(7);
    const clientKey = `${rinfo.address}:${rinfo.port}`;
    
    if (!channels[channelId]) channels[channelId] = {};
    
    // 1. Upstream Gap Detection
    const session = channels[channelId][clientKey];
    if (session && type === 1) {
        const expected = (session.lastSequence + 1) % 65536;
        if (sequence !== expected && sequence !== 0) {
            stats.upstreamLoss++;
            session.losses = (session.losses || 0) + 1;
        }
    }

    // 2. Update Session Data
    channels[channelId][clientKey] = { 
        userId, 
        lastSeen: Date.now(), 
        lastSequence: sequence,
        lastAudio: type === 1 ? Date.now() : (session?.lastAudio || 0),
        losses: session?.losses || 0,
        errors: session?.errors || 0
    };

    // 3. Forwarding with Downstream Error Tracking
    if (type === 1) { 
        const targets = [channelId];
        if (channelId !== TRUNK_CHANNEL) targets.push(TRUNK_CHANNEL);

        targets.forEach(ch => {
            const peers = channels[ch];
            if (!peers) return;
            for (const [peerKey, peerData] of Object.entries(peers)) {
                if (peerKey !== clientKey) {
                    const [pIp, pPort] = peerKey.split(':');
                    server.send(msg, parseInt(pPort), pIp, (err) => {
                        if (err) {
                            stats.downstreamErrors++;
                            peerData.errors = (peerData.errors || 0) + 1;
                        } else {
                            stats.packetsOut++;
                        }
                    });
                }
            }
        });
    }
});

// --- Enhanced Dashboard with Users ---
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
                <title>Relay Intelligence</title>
                <style>
                    body { font-family: 'Inter', sans-serif; background: #0f172a; color: #f8fafc; padding: 20px; }
                    .stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 20px; }
                    .card { background: #1e293b; padding: 15px; border-radius: 8px; border: 1px solid #334155; text-align: center; }
                    .val { display: block; font-size: 1.5em; font-weight: 800; color: #38bdf8; }
                    .warn { color: #fb7185; }
                    .channel-container { background: #1e293b; padding: 15px; border-radius: 12px; margin-bottom: 20px; border: 1px solid #334155; }
                    .user-row { display: grid; grid-template-columns: 100px 180px 100px 100px 1fr; gap: 10px; padding: 8px; border-bottom: 1px solid #334155; align-items: center; font-size: 0.9em; }
                    .user-row:last-child { border: none; }
                    .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 5px; }
                    .speaking { background: #2ecc71; box-shadow: 0 0 8px #2ecc71; }
                </style>
            </head>
            <body>
                <h2>Relay Health & Live Channels</h2>
                <div class="stats-grid">
                    <div class="card"><span class="val" id="pkIn">-</span>Packets In</div>
                    <div class="card"><span class="val" id="pkOut">-</span>Packets Out</div>
                    <div class="card"><span class="val warn" id="upLoss">-</span>Upstream Loss</div>
                    <div class="card"><span class="val warn" id="downErr">-</span>Downstream Err</div>
                    <div class="card"><span class="val" id="lag">-</span>Loop Lag</div>
                </div>
                <div id="display"></div>
                <script>
                    async function update() {
                        const res = await fetch('/api/status');
                        const data = await res.json();
                        document.getElementById('pkIn').innerText = data.stats.packetsIn;
                        document.getElementById('pkOut').innerText = data.stats.packetsOut;
                        document.getElementById('upLoss').innerText = data.stats.upstreamLoss;
                        document.getElementById('downErr').innerText = data.stats.downstreamErrors;
                        document.getElementById('lag').innerText = data.stats.loopLag + 'ms';
                        
                        let html = '';
                        for (const [chId, peers] of Object.entries(data.channels)) {
                            html += '<div class="channel-container"><strong>Channel ' + chId + '</strong>';
                            html += '<div class="user-row" style="font-weight:bold; color:#94a3b8; border-bottom: 2px solid #334155;"><div>User ID</div><div>Address</div><div>In-Loss</div><div>Out-Err</div><div>Activity</div></div>';
                            for (const [addr, info] of Object.entries(peers)) {
                                const isSpeaking = (data.now - info.lastAudio) < 2000;
                                html += \`<div class="user-row">
                                    <div>\${info.userId}</div>
                                    <div style="font-family:monospace; font-size:0.85em">\${addr}</div>
                                    <div class="\${info.losses > 0 ? 'warn' : ''}">\${info.losses}</div>
                                    <div class="\${info.errors > 0 ? 'warn' : ''}">\${info.errors}</div>
                                    <div><span class="status-dot \${isSpeaking ? 'speaking' : ''}"></span> \${isSpeaking ? 'SPEAKING' : 'Idle'}</div>
                                </div>\`;
                            }
                            html += '</div>';
                        }
                        document.getElementById('display').innerHTML = html || '<p>Waiting for clients...</p>';
                    }
                    setInterval(update, 1000);
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
}, 10000);

server.bind(UDP_PORT);
webServer.listen(WEB_PORT);
