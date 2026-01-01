// server.js
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

// --- Event Loop Monitor (Diagnose "Choppy" Audio) ---
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
    const clientKey = `${rinfo.address}:${rinfo.port}`;

    // 1. Handle TYPE_LEAVE (3) - Immediate removal
    if (type === 3) {
        if (channels[channelId] && channels[channelId][clientKey]) {
            delete channels[channelId][clientKey];
            logEvent(`User ${userId} LEFT Ch ${channelId} (Explicit)`);
        }
        return; 
    }

    // 2. Session Presence Management
    if (!channels[channelId]) channels[channelId] = {};
    if (!channels[channelId][clientKey]) {
        logEvent(`User ${userId} JOINED Ch ${channelId} from ${clientKey}`);
    }

    const session = channels[channelId][clientKey];

    // 3. Upstream Loss Detection (Sequence Gap Check)
    if (session && (type === 1 || type === 2)) {
        const expected = (session.lastSequence + 1) % 65536;
        if (session.lastSequence !== undefined && sequence !== expected && sequence !== 0) {
            stats.upstreamLoss++;
            session.losses = (session.losses || 0) + 1;
        }
    }

    // 4. Update Session Metadata
    channels[channelId][clientKey] = {
        userId,
        lastSeen: Date.now(),
        lastSequence: sequence,
        lastAudio: (type === 1 || type === 2) ? Date.now() : (session?.lastAudio || 0),
        losses: session?.losses || 0,
        errors: session?.errors || 0
    };

    // 5. Forwarding Logic (TYPE_AUDIO: 1 and TYPE_TEXT: 2)
    if (type === 1 || type === 2) {
        const targets = [channelId, config.TRUNK_CHANNEL].filter((v, i, a) => a.indexOf(v) === i);
        
        targets.forEach(ch => {
            if (!channels[ch]) return;
            for (const [peerKey, peerData] of Object.entries(channels[ch])) {
                // Self-Echo Guard
                if (peerKey !== clientKey) {
                    const [pIp, pPort] = peerKey.split(':');
                    server.send(msg, parseInt(pPort), pIp, (err) => {
                        if (err) {
                            stats.downstreamErrors++;
                            peerData.errors++;
                        } else {
                            stats.packetsOut++;
                        }
                    });
                }
            }
        });
    }
});

// --- Admin Broadcast Listener ---
webServer.on('adminBroadcast', (text) => {
    logEvent(`ADMIN BROADCAST: ${text}`);
    const payload = Buffer.from(text, 'utf-8');
    const packet = Buffer.alloc(11 + payload.length);
    
    packet.writeUInt8(2, 0);              // Type 2 (Text)
    packet.writeUInt32BE(999, 1);         // Admin UID 999
    packet.writeUInt16BE(0, 5);           // Target Ch 0 (Usually Bridge)
    packet.writeUInt16BE(0, 7);           // Sequence
    packet.writeUInt16BE(payload.length, 9);
    payload.copy(packet, 11);

    const sentTo = new Set();
    for (const ch in channels) {
        for (const peerKey in channels[ch]) {
            if (!sentTo.has(peerKey)) {
                const [ip, port] = peerKey.split(':');
                server.send(packet, port, ip);
                sentTo.add(peerKey);
            }
        }
    }
});

// --- Cleanup Task (Timeout inactive sessions) ---
setInterval(() => {
    const now = Date.now();
    for (const ch in channels) {
        for (const key in channels[ch]) {
            if (now - channels[ch][key].lastSeen > config.TIMEOUT_MS) {
                logEvent(`User ${channels[ch][key].userId} TIMED OUT from Ch ${ch}`);
                delete channels[ch][key];
            }
        }
        if (Object.keys(channels[ch]).length === 0) delete channels[ch];
    }
}, 10000);

// --- Initialization ---
server.bind(config.UDP_PORT, () => {
    console.log(`\x1b[32m[SUCCESS]\x1b[0m Relay Server v${state.version} active on UDP/${config.UDP_PORT}`);
});

webServer.listen(config.WEB_PORT, () => {
    console.log(`\x1b[32m[SUCCESS]\x1b[0m Dashboard active at http://localhost:${config.WEB_PORT}`);
});