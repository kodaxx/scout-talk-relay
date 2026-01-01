const dgram = require('dgram');
const state = require('./state');
const webServer = require('./dashboard');

const server = dgram.createSocket('udp4');
const { config, stats, channels, events } = state;

// --- Helper: Event Logging ---
function logEvent(msg) {
    events.push({ time: Date.now(), msg });
    if (events.length > 50) events.shift(); 
    console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

// --- Event Loop Monitor (Diagnose Performance) ---
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
    
    // PRIMARY KEY: UserID (Enables Mesh Multiplexing)
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

    // 4. Update Persistence (Saves coordinates even during voice traffic)
    channels[channelId][clientKey] = {
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

    // 5. Forwarding Logic (Audio/Text)
    if (type === 1 || type === 2) {
        const targets = [channelId, config.TRUNK_CHANNEL].filter((v, i, a) => a.indexOf(v) === i);
        
        targets.forEach(ch => {
            if (!channels[ch]) return;
            for (const [targetUid, targetData] of Object.entries(channels[ch])) {
                // Self-echo guard based on UserID
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

// --- Session Cleanup ---
setInterval(() => {
    const now = Date.now();
    for (const ch in channels) {
        for (const uid in channels[ch]) {
            if (now - channels[ch][uid].lastSeen > config.TIMEOUT_MS) {
                logEvent(`User ${uid} TIMED OUT from Ch ${ch}`);
                delete channels[ch][uid];
            }
        }
        if (Object.keys(channels[ch]).length === 0) delete channels[ch];
    }
}, 10000);

// --- Startup ---
server.bind(config.UDP_PORT, () => {
    console.log(`\x1b[32m[UDP]\x1b[0m Relay v${state.version} on Port ${config.UDP_PORT}`);
});

webServer.listen(config.WEB_PORT, () => {
    console.log(`\x1b[32m[WEB]\x1b[0m Dashboard at http://localhost:${config.WEB_PORT}`);
});