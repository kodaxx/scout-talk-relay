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
        .controls { display: flex; gap: 15px; align-items: center; margin-bottom: 20px; }
        select, button { background: #1e293b; color: white; border: 1px solid #334155; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-family: inherit; }
        .stat-val { font-size: 24px; font-weight: bold; color: #00FF41; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { text-align: left; color: #64748b; padding: 12px; border-bottom: 1px solid #1e293b; }
        td { padding: 10px; border-bottom: 1px solid #020617; }
        
        /* Pulse Effects */
        .speaking { color: #00FF41 !ext-important; font-weight: bold; animation: pulse 1.0s infinite; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }
        
        /* Map Pulse for CircleMarkers */
        .pulse-marker { animation: mapPulse 1.0s infinite; }
        @keyframes mapPulse {
            0% { stroke-width: 2; stroke-opacity: 1; }
            50% { stroke-width: 8; stroke-opacity: 0.4; }
            100% { stroke-width: 2; stroke-opacity: 1; }
        }

        .leaflet-tooltip { background: #1e293b; color: #f8fafc; border: 1px solid #334155; border-radius: 4px; font-size: 12px; padding: 8px; }
    </style>
</head>
<body>
    <div class="controls">
        <h1 style="margin:0;">Scout Talk Relay <small style="font-size: 12px; color: #64748b; vertical-align: middle;">v${state.version}</small></h1>
        <div style="flex-grow:1"></div>
        <label>Filter Channel:</label>
        <select id="chanFilter">
            <option value="all">All Channels</option>
        </select>
        <button onclick="centerMap()">Center View</button>
    </div>
    
    <div id="map"></div>

    <div class="grid">
        <div class="card">
            <h3 style="margin-top:0;">Sessions & History</h3>
            <table>
                <thead><tr><th>Identity</th><th>CH</th><th>Last Seen</th><th>Status</th></tr></thead>
                <tbody id="userBody"></tbody>
            </table>
        </div>
        <div class="card">
            <h3 style="margin-top:0;">Relay Health</h3>
            <p>Packets In: <span id="pIn" class="stat-val">0</span></p>
            <p>Upstream Loss: <span id="pLoss" class="stat-val" style="color:#fb7185">0</span></p>
            <div id="events" style="font-size: 11px; color: #64748b; height: 180px; overflow-y: auto; margin-top:10px; border-top: 1px solid #1e293b; padding-top:10px;"></div>
        </div>
    </div>

    <script>
        const map = L.map('map', {zoomControl: false}).setView([0, 0], 2);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
        let markers = {};
        let knownChannels = new Set();

        function centerMap() {
            const markerArray = Object.values(markers);
            if (markerArray.length > 0) {
                const group = new L.featureGroup(markerArray);
                map.fitBounds(group.getBounds(), { padding: [80, 80], maxZoom: 16 });
            }
        }

        async function update() {
            const filter = document.getElementById('chanFilter').value;
            const res = await fetch('/api/status');
            const data = await res.json();
            const now = Date.now();
            
            document.getElementById('pIn').innerText = data.stats.packetsIn;
            document.getElementById('pLoss').innerText = data.stats.upstreamLoss;
            document.getElementById('events').innerHTML = data.events.map(e => 
                '<div>[' + new Date(e.time).toLocaleTimeString() + '] ' + e.msg + '</div>'
            ).reverse().join('');

            const allUsers = {};
            const currentChannels = new Set();

            // 1. Process History (Ghost data)
            if(data.history) {
                for(const id in data.history) {
                    allUsers[id] = { ...data.history[id], status: 'Offline', isGhost: true };
                    currentChannels.add(data.history[id].channel.toString());
                }
            }

            // 2. Overlay Active Sessions
            for (const chId in data.channels) {
                currentChannels.add(chId.toString());
                for (const uid in data.channels[chId]) {
                    allUsers[uid] = { ...data.channels[chId][uid], status: 'Active', isGhost: false, channel: chId };
                }
            }

            // 3. Dynamic Channel Dropdown
            const select = document.getElementById('chanFilter');
            currentChannels.forEach(ch => {
                if (!knownChannels.has(ch)) {
                    const opt = document.createElement('option');
                    opt.value = ch;
                    opt.innerHTML = 'Channel ' + ch;
                    select.appendChild(opt);
                    knownChannels.add(ch);
                }
            });

            const tbody = document.getElementById('userBody');
            tbody.innerHTML = '';
            const processedUids = new Set();

            for (const uid in allUsers) {
                const u = allUsers[uid];
                if (filter !== 'all' && u.channel.toString() !== filter) {
                    if(markers[uid]) { map.removeLayer(markers[uid]); delete markers[uid]; }
                    continue;
                }

                const timeSince = (now - (u.lastSeen || u.time)) / 1000;
                if (timeSince > 14400) continue; 

                processedUids.add(uid);
                const isSpeaking = (now - (u.lastAudio || 0)) < 2000;

                // Table Row: Show Callsign with UserID in small text
                const row = tbody.insertRow();
                row.innerHTML = \`<td><b>\${u.callsign || 'Unknown'}</b><br><small style="color:#64748b">ID: \${uid}</small></td>
                               <td>CH \${u.channel}</td>
                               <td>\${Math.floor(timeSince)}s ago</td>
                               <td class="\${isSpeaking ? 'speaking' : ''}">\${u.status}</td>\`;

                if (u.lat && u.lon) {
                    const opacity = u.isGhost ? Math.max(0.1, 0.6 - (timeSince / 14400)) : 1;
                    const dotColor = "#00FF41"; 
                    
                    const tooltipHtml = \`<b>Callsign: \${u.callsign || 'Unknown'}</b><br>
                                       <b>ID:</b> \${uid}<br>
                                       <b>CH:</b> \${u.channel}<br>
                                       <b>Type:</b> \${u.isGhost ? 'Last Known' : 'Active'}<br>
                                       <b>Seen:</b> \${Math.floor(timeSince)}s ago\`;

                    if (!markers[uid]) {
                        markers[uid] = L.circleMarker([u.lat, u.lon], { 
                            radius: 8, 
                            weight: 2, 
                            color: '#ffffff',
                            className: '' 
                        }).addTo(map);
                    }
                    
                    markers[uid].setLatLng([u.lat, u.lon]);
                    
                    // Update Pulse CSS Class if speaking
                    const markerElement = markers[uid].getElement();
                    if (markerElement) {
                        if (isSpeaking) markerElement.classList.add('pulse-marker');
                        else markerElement.classList.remove('pulse-marker');
                    }

                    markers[uid].setStyle({
                        fillColor: dotColor,
                        fillOpacity: opacity,
                        opacity: opacity,
                        color: isSpeaking ? '#00FF41' : '#ffffff'
                    });
                    markers[uid].bindTooltip(tooltipHtml, { sticky: true });
                }
            }

            for (const id in markers) {
                if (!processedUids.has(id)) {
                    map.removeLayer(markers[id]);
                    delete markers[id];
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