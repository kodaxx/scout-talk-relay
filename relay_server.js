const dgram = require('dgram');
const server = dgram.createSocket('udp4');

// --- Configuration ---
const PORT = 6000;
const TIMEOUT_MS = 45000; 
const TRUNK_CHANNEL = 0; // The "Global" Bridge Channel

// --- Protocol Constants ---
const TYPE_BEACON = 0;
const TYPE_AUDIO = 1;

// --- State Storage ---
const channels = {};

server.on('error', (err) => {
    console.log(`Server error:\n${err.stack}`);
    server.close();
});

/**
 * Helper to send packets to a specific channel's participants
 * @param {Buffer} msg - The raw packet
 * @param {string} senderKey - The ip:port of the source
 * @param {number} targetChannelId - Which channel to iterate over
 */
function forwardToChannel(msg, senderKey, targetChannelId) {
    const peers = channels[targetChannelId];
    if (!peers) return;

    for (const [peerKey, lastSeen] of Object.entries(peers)) {
        // "Self-Echo" Guard: Never send back to the originating socket
        if (peerKey !== senderKey) {
            const [peerIp, peerPort] = peerKey.split(':');
            
            server.send(msg, parseInt(peerPort), peerIp, (err) => {
                if (err) console.error(`Send error to ${peerKey} on Ch ${targetChannelId}:`, err);
            });
        }
    }
}

server.on('message', (msg, rinfo) => {
    if (msg.length < 11) return;

    // Parse Header
    const type = msg.readUInt8(0);
    const userId = msg.readUInt32BE(1); // User ID/IP for logging
    const channelId = msg.readUInt16BE(5);
    
    const clientKey = `${rinfo.address}:${rinfo.port}`;
    const now = Date.now();

    // 1. Update Session State
    if (!channels[channelId]) channels[channelId] = {};
    
    if (!channels[channelId][clientKey]) {
        const role = channelId === TRUNK_CHANNEL ? "BRIDGE" : "USER";
        console.log(`[${role} JOINED] ID: ${userId} | Addr: ${clientKey} | Ch: ${channelId}`);
    }
    channels[channelId][clientKey] = now;

    // 2. Protocol Logic
    if (type === TYPE_BEACON) {
        // Beacons only update timestamps (handled above)
        return;
    } 
    
    else if (type === TYPE_AUDIO) {
        // FORWARDING LOGIC
        
        // A. Forward to the specific channel subscribers
        forwardToChannel(msg, clientKey, channelId);

        // B. GLOBAL TRUNK: If this isn't already the trunk channel, 
        // forward it to all Bridges on Channel 0.
        if (channelId !== TRUNK_CHANNEL) {
            forwardToChannel(msg, clientKey, TRUNK_CHANNEL);
        }
    }
});

// Cleanup Task (Stale session removal)
setInterval(() => {
    const now = Date.now();
    for (const chId in channels) {
        for (const clientKey in channels[chId]) {
            if (now - channels[chId][clientKey] > TIMEOUT_MS) {
                console.log(`Timeout: Removing ${clientKey} from Channel ${chId}`);
                delete channels[chId][clientKey];
            }
        }
        if (Object.keys(channels[chId]).length === 0) {
            delete channels[chId];
        }
    }
}, 10000);

server.bind(PORT, () => {
    console.log(`UDP Global Relay Active on port ${PORT}`);
    console.log(`Bridges should connect to Channel ${TRUNK_CHANNEL}`);
});
