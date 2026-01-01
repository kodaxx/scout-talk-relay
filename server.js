const dgram = require('dgram');
const state = require('./state');
const webServer = require('./dashboard');

const server = dgram.createSocket('udp4');
const { config, stats, channels, events } = state;

// Long-Term Location Storage (Last Known Position)
// Persists for 4 hours even if session times out
const locationHistory = {}; 

// --- Helper: Event Logging ---
function logEvent(msg) {
    events.push({ time: Date.now(), msg });
    if (events.length > 50) events.shift(); 
    console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

// --- Event Loop Monitor ---
let lastLoop = Date.now();
setInterval(() => {
    const now = Date.now();
    stats.loopLag = now - lastLoop - 100;
    lastLoop = now;
}, 100);

// --- UDP Packet Handling ---
server.on('message', (msg, rinfo) => {
    stats.packetsIn++;
    if (msg.length < 11) return;

    const type = msg.readUInt8(0);
    const userId = msg.readUInt32BE(1);
    const channelId = msg.readUInt16BE(5);
    const sequence = msg.readUInt16BE(7);
    
    const clientKey = `${userId}`; 
    const transportKey = `${rinfo.address}:${rinfo.port}`;

    if (!channels[channelId]) channels[channelId] = {};

    // 1. Handle TYPE_LEAVE (3)
    if (type === 3) {
        if (channels[channelId][clientKey]) {
            delete channels[channelId][clientKey];
            logEvent(`User ${userId} LEFT Ch ${channelId}`);
        }
        return; 
    }

    // 2. GPS Extraction (from 19-byte Type 0 Beacon)
    let lat = null;
    let lon = null;
    if (type === 0 && msg.length >= 19) {
        lat = msg.readFloatBE(11);
        lon = msg.readFloatBE(15);
    }

    // 3. Session Management
    const session = channels[channelId][clientKey];
    if (!session) {
        logEvent(`User ${userId} JOINED Ch ${channelId} via ${rinfo.address}`);
    }

    // 4. Update Current Active Session
    const userData = {
        userId,
        address: rinfo.address,
        port: rinfo.port,
        transportKey,
        lastSeen: Date.now(),
        lastSequence: sequence,
        lastAudio: (type === 1 || type === 2) ? Date.now() : (session?.lastAudio || 0),
        lat: lat !== null ? lat : (session?.lat || null),
        lon: lon !== null ? lon : (session?.lon || null),
        losses: session?.losses || 0
    };
    channels[channelId][clientKey] = userData;

    // 5. Update Long-Term History (LKP)
    // We store the last known position and channel for up to 4 hours
    if (userData.lat && userData.lon) {
        locationHistory[userId] = {
            lat: userData.lat,
            lon: userData.lon,
            time: Date.now(),
            channel: channelId
        };
    }

    // 6. Forwarding (Audio/Text)
    if (type === 1 || type === 2) {
        const targets = [channelId, config.TRUNK_CHANNEL].filter((v, i, a) => a.indexOf(v) === i);
        targets.forEach(ch => {
            if (!channels[ch]) return;
            for (const [targetUid, targetData] of Object.entries(channels[ch])) {
                if (targetUid !== clientKey) {
                    server.send(msg, targetData.port, targetData.address, (err) => {
                        if (err) { stats.downstreamErrors++; }
                        else { stats.packetsOut++; }
                    });
                }
            }
        });
    }
});

// --- API Bridge: Inject History into Dashboard ---
// We overwrite state.history dynamically for the web dashboard
Object.defineProperty(state, 'history', {
    get: function() { return locationHistory; },
    enumerable: true
});

// --- Cleanup Task ---
setInterval(() => {
    const now = Date.now();
    
    // Cleanup Active Sessions (45s timeout)
    for (const ch in channels) {
        for (const uid in channels[ch]) {
            if (now - channels[ch][uid].lastSeen > config.TIMEOUT_MS) {
                logEvent(`User ${uid} TIMED OUT from Ch ${ch}`);
                delete channels[ch][uid];
            }
        }
        if (Object.keys(channels[ch]).length === 0) delete channels[ch];
    }

    // Cleanup Long-Term History (4 Hour timeout)
    const FOUR_HOURS = 4 * 60 * 60 * 1000;
    for (const uid in locationHistory) {
        if (now - locationHistory[uid].time > FOUR_HOURS) {
            delete locationHistory[uid];
        }
    }
}, 15000);

server.bind(config.UDP_PORT, () => {
    console.log(`\x1b[32m[UDP]\x1b[0m Relay v${state.version} on Port ${config.UDP_PORT}`);
});

webServer.listen(config.WEB_PORT, () => {
    console.log(`\x1b[32m[WEB]\x1b[0m Dashboard at http://localhost:${config.WEB_PORT}`);
});