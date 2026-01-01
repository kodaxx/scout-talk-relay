const http = require('http');
const state = require('./state');
const EventEmitter = require('events');

const webServer = new EventEmitter();

const server = http.createServer((req, res) => {
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(generateHTML());
    } else if (req.url === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(state));
    } else {
        res.writeHead(404);
        res.end();
    }
});

function generateHTML() {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Scout Talk Dashboard</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
        .grid { display: grid; grid-template-columns: 1fr 350px; gap: 20px; }
        #map { height: 400px; border-radius: 8px; border: 1px solid #334155; margin-bottom: 20px; }
        .card { background: #1e293b; padding: 20px; border-radius: 8px; border: 1px solid #334155; }
        .stat-val { font-size: 24px; font-weight: bold; color: #38bdf8; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { text-align: left; color: #94a3b8; border-bottom: 1px solid #334155; padding: 10px; }
        td { padding: 10px; border-bottom: 1px solid #1e293b; }
        .speaking { color: #4ade80; font-weight: bold; animation: pulse 1s infinite; }
        .mesh-tag { background: #4338ca; font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-left: 8px; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
    </style>
</head>
<body>
    <h1>🛰️ Scout Talk Relay v${state.version}</h1>
    
    <div id="map"></div>

    <div class="grid">
        <div class="card">
            <h3>Active Users & Mesh Groups</h3>
            <table id="userTable">
                <thead>
                    <tr>
                        <th>User ID</th>
                        <th>Channel</th>
                        <th>Gateway (IP)</th>
                        <th>Location</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody id="userBody"></tbody>
            </table>
        </div>
        
        <div class="card">
            <h3>Relay Health</h3>
            <div id="stats">
                <p>Packets In: <span id="pIn" class="stat-val">0</span></p>
                <p>Upstream Loss: <span id="pLoss" class="stat-val" style="color:#fb7185">0</span></p>
                <p>Loop Lag: <span id="pLag" class="stat-val">0ms</span></p>
            </div>
            <hr style="border:0; border-top:1px solid #334155">
            <h3>Recent Events</h3>
            <div id="events" style="font-size: 12px; color: #94a3b8; height: 200px; overflow-y: auto;"></div>
        </div>
    </div>

    <script>
        const map = L.map('map').setView([0, 0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        let markers = {};

        async function update() {
            const res = await fetch('/api/status');
            const data = await res.json();
            
            // Update Stats
            document.getElementById('pIn').innerText = data.stats.packetsIn;
            document.getElementById('pLoss').innerText = data.stats.upstreamLoss;
            document.getElementById('pLag').innerText = data.stats.loopLag + 'ms';
            
            // Update Events
            document.getElementById('events').innerHTML = data.events.map(e => 
                '<div>[' + new Date(e.time).toLocaleTimeString() + '] ' + e.msg + '</div>'
            ).reverse().join('');

            // Update Users & Map
            const tbody = document.getElementById('userBody');
            tbody.innerHTML = '';
            
            // Map logic
            const now = Date.now();
            for (const chId in data.channels) {
                const users = data.channels[chId];
                for (const uid in users) {
                    const u = users[uid];
                    const isSpeaking = (now - u.lastAudio < 2000);
                    
                    // Grouping Check: See if others share this transportKey
                    const meshPeers = Object.values(users).filter(other => other.transportKey === u.transportKey).length;
                    const meshLabel = meshPeers > 1 ? '<span class="mesh-tag">MESHED</span>' : '';

                    // Table Row
                    const row = tbody.insertRow();
                    row.innerHTML = '<td>' + uid + meshLabel + '</td>' +
                                  '<td>' + chId + '</td>' +
                                  '<td>' + u.address + '</td>' +
                                  '<td>' + (u.lat ? u.lat.toFixed(4) + ', ' + u.lon.toFixed(4) : 'No Fix') + '</td>' +
                                  '<td class="' + (isSpeaking ? 'speaking' : '') + '">' + (isSpeaking ? 'TRANSMITTING' : 'Idle') + '</td>';

                    // Marker update
                    if (u.lat && u.lon) {
                        if (!markers[uid]) {
                            markers[uid] = L.marker([u.lat, u.lon]).addTo(map).bindPopup('User ' + uid);
                        } else {
                            markers[uid].setLatLng([u.lat, u.lon]);
                        }
                    }
                }
            }
        }

        setInterval(update, 2000);
        update();
    </script>
</body>
</html>
    `;
}

module.exports = server;