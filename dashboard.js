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
        .stat-val { font-size: 24px; font-weight: bold; color: #38bdf8; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { text-align: left; color: #64748b; padding: 12px; border-bottom: 1px solid #1e293b; }
        td { padding: 12px; border-bottom: 1px solid #020617; }
        
        .speaking { color: #4ade80; font-weight: bold; animation: pulse 1.5s infinite; }
        .mesh-tag { background: #4338ca; font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-weight: bold; }
        
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }
        
        button { 
            background: #38bdf8; border: none; padding: 10px 20px; border-radius: 8px; 
            cursor: pointer; font-weight: 600; color: #020617; transition: all 0.2s; 
        }
        button:hover { background: #7dd3fc; transform: translateY(-1px); }
        button:active { transform: translateY(0px); }

        /* Tooltip Style */
        .leaflet-tooltip {
            background: #1e293b; color: #f8fafc; border: 1px solid #334155; border-radius: 4px; font-weight: 600;
        }
    </style>
</head>
<body>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h1 style="margin:0;">Scout Talk Radar <small style="font-size: 12px; color: #64748b; vertical-align: middle;">v${state.version}</small></h1>
        <button onclick="centerMap()">Center Radar View</button>
    </div>
    
    <div id="map"></div>

    <div class="grid">
        <div class="card">
            <h3 style="margin-top:0;">Active Sessions</h3>
            <table id="userTable">
                <thead>
                    <tr>
                        <th>User ID</th>
                        <th>Type</th>
                        <th>Gateway</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody id="userBody"></tbody>
            </table>
        </div>
        
        <div class="card">
            <h3 style="margin-top:0;">Health</h3>
            <div id="stats">
                <p style="margin: 5px 0;">Packets In: <span id="pIn" class="stat-val">0</span></p>
                <p style="margin: 5px 0;">Upstream Loss: <span id="pLoss" class="stat-val" style="color:#fb7185">0</span></p>
                <p style="margin: 5px 0;">Loop Lag: <span id="pLag" class="stat-val" style="color:#facc15">0ms</span></p>
            </div>
            <hr style="border:0; border-top:1px solid #1e293b; margin: 20px 0;">
            <h4 style="margin:0 0 10px 0; color: #64748b;">Event Log</h4>
            <div id="events" style="font-size: 11px; color: #64748b; height: 250px; overflow-y: auto;"></div>
        </div>
    </div>

    <script>
        // Use CartoDB Dark Matter for a tactical look
        const map = L.map('map', { zoomControl: true }).setView([0, 0], 2);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap | © CARTO'
        }).addTo(map);

        let markers = {};

        function centerMap() {
            const markerArray = Object.values(markers);
            if (markerArray.length > 0) {
                const group = new L.featureGroup(markerArray);
                map.fitBounds(group.getBounds(), { padding: [80, 80], maxZoom: 16 });
            }
        }

        async function update() {
            const res = await fetch('/api/status');
            const data = await res.json();
            const now = Date.now();
            
            // Update Text Stats
            document.getElementById('pIn').innerText = data.stats.packetsIn;
            document.getElementById('pLoss').innerText = data.stats.upstreamLoss;
            document.getElementById('pLag').innerText = data.stats.loopLag + 'ms';
            
            // Update Event Log
            document.getElementById('events').innerHTML = data.events.map(e => 
                '<div>[' + new Date(e.time).toLocaleTimeString() + '] ' + e.msg + '</div>'
            ).reverse().join('');

            const tbody = document.getElementById('userBody');
            tbody.innerHTML = '';
            const currentUids = new Set();

            for (const chId in data.channels) {
                const users = data.channels[chId];
                for (const uid in users) {
                    const u = users[uid];
                    currentUids.add(uid);
                    
                    const timeSince = (now - u.lastSeen) / 1000;
                    const isSpeaking = (now - u.lastAudio < 2000);
                    
                    // Logic to check if this is a mesh bridge (multiple users on same IP)
                    const meshPeers = Object.values(users).filter(other => other.transportKey === u.transportKey).length;
                    const userTypeLabel = meshPeers > 1 ? 'Meshed' : 'Standalone';
                    const meshBadge = meshPeers > 1 ? '<span class="mesh-tag">MESH</span>' : '';

                    // Opacity math: Fade linearly to 10% over the 45s timeout window
                    const opacity = Math.max(0.1, 1 - (timeSince / 45));

                    const row = tbody.insertRow();
                    row.innerHTML = \`<td>\${uid}\${meshBadge}</td>
                                  <td>\${userTypeLabel}</td>
                                  <td>\${u.address}</td>
                                  <td class="\${isSpeaking ? 'speaking' : ''}">\${isSpeaking ? 'TRANSMITTING' : 'Idle'}</td>\`;

                    // Handle Tactical Dot Marker
                    if (u.lat && u.lon) {
                        const tooltipContent = \`<b>ID:</b> \${uid}<br><b>Type:</b> \${userTypeLabel}<br><b>Last Seen:</b> \${Math.floor(timeSince)}s ago\`;
                        
                        if (!markers[uid]) {
                            markers[uid] = L.circleMarker([u.lat, u.lon], {
                                radius: 8,
                                fillColor: isSpeaking ? '#4ade80' : '#38bdf8',
                                color: '#f8fafc',
                                weight: 1,
                                fillOpacity: opacity,
                                opacity: opacity
                            }).addTo(map).bindTooltip(tooltipContent, { sticky: true });
                        } else {
                            markers[uid].setLatLng([u.lat, u.lon]);
                            markers[uid].setStyle({
                                fillColor: isSpeaking ? '#4ade80' : '#38bdf8',
                                fillOpacity: opacity,
                                opacity: opacity
                            });
                            markers[uid].setTooltipContent(tooltipContent);
                        }
                    }
                }
            }

            // Remove markers for disconnected users
            for (const uid in markers) {
                if (!currentUids.has(uid)) {
                    map.removeLayer(markers[uid]);
                    delete markers[uid];
                }
            }
        }

        // Poll every 2 seconds
        setInterval(update, 2000);
        update();

        // One-time auto-center on first user discovery
        let initialFocus = true;
        setInterval(() => {
            if (initialFocus && Object.keys(markers).length > 0) {
                centerMap();
                initialFocus = false;
            }
        }, 3000);
    </script>
</body>
</html>
    `;
}

module.exports = server;