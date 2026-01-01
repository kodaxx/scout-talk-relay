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
    <title>Scout Talk Radar</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; background: #020617; color: #f8fafc; margin: 0; padding: 20px; }
        #map { height: 500px; border-radius: 12px; border: 1px solid #1e293b; margin-bottom: 20px; background: #0f172a; }
        .grid { display: grid; grid-template-columns: 1fr 350px; gap: 20px; }
        .card { background: #0f172a; padding: 20px; border-radius: 12px; border: 1px solid #1e293b; }
        .controls { display: flex; gap: 10px; align-items: center; margin-bottom: 20px; }
        select, button { background: #1e293b; color: white; border: 1px solid #334155; padding: 8px 12px; border-radius: 6px; cursor: pointer; }
        .stat-val { font-size: 24px; font-weight: bold; color: #38bdf8; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { text-align: left; color: #64748b; padding: 12px; border-bottom: 1px solid #1e293b; }
        .speaking { color: #4ade80; font-weight: bold; animation: pulse 1.5s infinite; }
        .ghost-marker { filter: grayscale(100%); opacity: 0.5; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }
    </style>
</head>
<body>
    <div class="controls">
        <h1 style="margin:0;">Scout Talk Relay <small style="font-size: 12px; color: #64748b; vertical-align: middle;">v${state.version}</small></h1>
        <div style="flex-grow:1"></div>
        <label>Filter Channel:</label>
        <select id="chanFilter" onchange="update()">
            <option value="all">All Channels</option>
            <option value="0">CH 0 (Trunk)</option>
            <option value="1">CH 1</option>
            <option value="2">CH 2</option>
        </select>
        <button onclick="centerMap()">Center View</button>
    </div>
    
    <div id="map"></div>

    <div class="grid">
        <div class="card">
            <h3>Active & History</h3>
            <table>
                <thead><tr><th>User ID</th><th>CH</th><th>Last Seen</th><th>Status</th></tr></thead>
                <tbody id="userBody"></tbody>
            </table>
        </div>
        <div class="card">
            <h3>Relay Stats</h3>
            <p>Packets In: <span id="pIn" class="stat-val">0</span></p>
            <p>Upstream Loss: <span id="pLoss" class="stat-val" style="color:#fb7185">0</span></p>
            <div id="events" style="font-size: 11px; color: #64748b; height: 150px; overflow-y: auto; margin-top:10px;"></div>
        </div>
    </div>

    <script>
        const map = L.map('map').setView([0, 0], 2);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
        let markers = {};

        async function update() {
            const filter = document.getElementById('chanFilter').value;
            const res = await fetch('/api/status');
            const data = await res.json();
            const now = Date.now();
            const tbody = document.getElementById('userBody');
            tbody.innerHTML = '';

            // We combine active users and "Historical" users
            const allUsers = {};
            
            // 1. Add History First (Ghost data)
            // Note: You'll need to send data.history from the server
            if(data.history) {
                for(const id in data.history) {
                    allUsers[id] = { ...data.history[id], status: 'Offline' };
                }
            }

            // 2. Overwrite with Active Users
            for (const chId in data.channels) {
                for (const uid in data.channels[chId]) {
                    allUsers[uid] = { ...data.channels[chId][uid], status: 'Active', channel: chId };
                }
            }

            for (const uid in allUsers) {
                const u = allUsers[uid];
                if (filter !== 'all' && u.channel != filter) {
                    if(markers[uid]) map.removeLayer(markers[uid]);
                    continue;
                }

                const timeSince = (now - (u.lastSeen || u.time)) / 1000;
                const hoursOld = timeSince / 3600;
                
                // Keep markers for 4 hours
                if (hoursOld > 4) {
                    if(markers[uid]) map.removeLayer(markers[uid]);
                    continue;
                }

                // UI Table
                const row = tbody.insertRow();
                row.innerHTML = \`<td>\${uid}</td><td>\${u.channel}</td><td>\${Math.floor(timeSince)}s ago</td><td>\${u.status}</td>\`;

                // Radar Dot Logic
                const isActive = u.status === 'Active';
                const opacity = isActive ? 1 : Math.max(0.1, 0.6 - (hoursOld / 4));
                const color = isActive ? '#38bdf8' : '#64748b';

                if (u.lat && u.lon) {
                    if (!markers[uid]) {
                        markers[uid] = L.circleMarker([u.lat, u.lon], { radius: 8 }).addTo(map);
                    }
                    markers[uid].setLatLng([u.lat, u.lon]);
                    markers[uid].setStyle({ fillColor: color, color: '#fff', fillOpacity: opacity, opacity: opacity });
                    markers[uid].bindTooltip("ID: "+uid + (isActive ? "" : " (LKP)"));
                }
            }
        }
        setInterval(update, 2000);
        update();
    </script>
</body>
</html>`;
}

module.exports = server;