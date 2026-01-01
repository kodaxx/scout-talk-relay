const dgram = require('dgram');
const http = require('http');
const server = dgram.createSocket('udp4');

const UDP_PORT = 6000;
const WEB_PORT = 8080;
const TRUNK_CHANNEL = 0;

let stats = {
    packetsIn: 0,
    packetsOut: 0,
    upstreamLoss: 0, // Loss from Client -> Server
    loopLag: 0,
    startTime: Date.now()
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
    const sequence = msg.readUInt16BE(7); // Parse Sequence from [7-8]
    const clientKey = `${rinfo.address}:${rinfo.port}`;
    
    if (!channels[channelId]) channels[channelId] = {};
    
    // Track Sequence Continuity
    const session = channels[channelId][clientKey];
    if (session && type === 1) { // Only track gaps for Audio
        const expected = (session.lastSequence + 1) % 65536;
        if (sequence !== expected && sequence !== 0) {
            // We found a gap!
            stats.upstreamLoss++;
        }
    }

    // Update Session
    channels[channelId][clientKey] = { 
        userId, 
        lastSeen: Date.now(), 
        lastSequence: sequence,
        lastAudio: type === 1 ? Date.now() : (session?.lastAudio || 0)
    };

    if (type === 1) { 
        // Forwarding Logic
        const targetChannels = [channelId];
        if (channelId !== TRUNK_CHANNEL) targetChannels.push(TRUNK_CHANNEL);

        targetChannels.forEach(ch => {
            const peers = channels[ch];
            if (!peers) return;
            for (const [peerKey] of Object.entries(peers)) {
                if (peerKey !== clientKey) {
                    const [pIp, pPort] = peerKey.split(':');
                    server.send(msg, parseInt(pPort), pIp, (err) => {
                        if (!err) stats.packetsOut++;
                    });
                }
            }
        });
    }
});

// --- Dashboard with Loss Metrics ---
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
                    body { font-family: 'Segoe UI', sans-serif; background: #0f172a; color: #f8fafc; padding: 20px; }
                    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 25px; }
                    .card { background: #1e293b; padding: 20px; border-radius: 12px; border: 1px solid #334155; text-align: center; }
                    .val { display: block; font-size: 2em; font-weight: 800; color: #38bdf8; }
                    .loss-val { color: #fb7185; } /* Red for loss */
                    .channel-box { background: #1e293b; padding: 15px; border-radius: 12px; margin-top: 10px; }
                </style>
            </head>
            <body>
                <h2>Relay Health & Upstream Loss</h2>
                <div class="stats-grid">
                    <div class="card"><span class="val" id="pkIn">-</span>Packets In</div>
                    <div class="card"><span class="val loss-val" id="loss">-</span>Upstream Loss</div>
                    <div class="card"><span class="val" id="lag">-</span>Loop Lag</div>
                    <div class="card"><span class="val" id="pkOut">-</span>Packets Out</div>
                </div>
                <div id="display"></div>
                <script>
                    async function update() {
                        const res = await fetch('/api/status');
                        const data = await res.json();
                        document.getElementById('pkIn').innerText = data.stats.packetsIn;
                        document.getElementById('pkOut').innerText = data.stats.packetsOut;
                        document.getElementById('loss').innerText = data.stats.upstreamLoss;
                        document.getElementById('lag').innerText = data.stats.loopLag + 'ms';
                        
                        let html = '';
                        for (const [id, p] of Object.entries(data.channels)) {
                            html += '<div class="channel-box"><strong>Channel ' + id + '</strong></div>';
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
