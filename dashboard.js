const http = require('http');
const state = require('./state');

const webServer = http.createServer((req, res) => {
    if (req.url === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ 
            channels: state.channels, 
            stats: state.stats, 
            events: state.events, 
            now: Date.now() 
        }));
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
        <html>
            <head>
                <title>Relay v${state.version}</title>
                <style>
                    body { font-family: 'Inter', sans-serif; background: #0f172a; color: #f8fafc; padding: 20px; margin: 0; }
                    .stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 20px; }
                    .card { background: #1e293b; padding: 15px; border-radius: 8px; text-align: center; border: 1px solid #334155; }
                    .val { display: block; font-size: 1.5em; font-weight: 800; color: #38bdf8; }
                    #log-container { background: #020617; border: 1px solid #334155; height: 200px; overflow-y: auto; padding: 10px; font-family: monospace; font-size: 0.85em; border-radius: 8px; margin-top: 20px; }
                    .log-entry { margin-bottom: 4px; border-left: 3px solid #38bdf8; padding-left: 8px; }
                    .channel-container { background: #1e293b; padding: 15px; border-radius: 12px; margin-top: 20px; border: 1px solid #334155; }
                    .user-row { display: grid; grid-template-columns: 80px 180px 80px 80px 1fr; gap: 10px; padding: 8px; border-bottom: 1px solid #334155; align-items: center; }
                    .speaking { color: #2ecc71; font-weight: bold; }
                </style>
            </head>
            <body>
                <h2>Relay Health Monitor <span style="font-size:0.5em; color:#64748b;">v${state.version}</span></h2>
                <div class="stats-grid">
                    <div class="card"><span class="val" id="pkIn">0</span>Packets In</div>
                    <div class="card"><span class="val" id="upLoss" style="color:#fb7185">0</span>In-Loss</div>
                    <div class="card"><span class="val" id="lag">0ms</span>Lag</div>
                    <div class="card"><span class="val" id="pkOut">0</span>Packets Out</div>
                    <div class="card"><span class="val" id="downErr" style="color:#fb7185">0</span>Out-Err</div>
                </div>
                <div id="display"></div>
                <h3>Event Log</h3>
                <div id="log-container"></div>

                <script>
                    async function update() {
                        const res = await fetch('/api/status');
                        const data = await res.json();
                        
                        document.getElementById('pkIn').innerText = data.stats.packetsIn;
                        document.getElementById('upLoss').innerText = data.stats.upstreamLoss;
                        document.getElementById('lag').innerText = data.stats.loopLag + 'ms';
                        document.getElementById('pkOut').innerText = data.stats.packetsOut;
                        document.getElementById('downErr').innerText = data.stats.downstreamErrors;

                        // Update Log
                        const logDiv = document.getElementById('log-container');
                        logDiv.innerHTML = data.events.map(e => \`<div class="log-entry">[\${new Date(e.time).toLocaleTimeString()}] \${e.msg}</div>\`).reverse().join('');

                        // Update User List
                        let html = '';
                        for (const [chId, peers] of Object.entries(data.channels)) {
                            html += '<div class="channel-container"><strong>Channel ' + chId + '</strong>';
                            for (const [addr, info] of Object.entries(peers)) {
                                const active = (data.now - info.lastAudio) < 2000;
                                html += \`<div class="user-row">
                                    <div>ID: \${info.userId}</div>
                                    <div style="opacity:0.6">\${addr}</div>
                                    <div>L: \${info.losses}</div>
                                    <div>E: \${info.errors}</div>
                                    <div class="\${active ? 'speaking' : ''}">\${active ? '▶ SPEAKING' : 'IDLE'}</div>
                                </div>\`;
                            }
                            html += '</div>';
                        }
                        document.getElementById('display').innerHTML = html;
                    }
                    setInterval(update, 1000);
                </script>
            </body>
        </html>
    `);
});

module.exports = webServer;