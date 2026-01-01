const dgram = require('dgram');
const server = dgram.createSocket('udp4');

// --- Configuration ---
const PORT = 6000;
const TIMEOUT_MS = 45000; // 45 seconds timeout

// --- State Storage ---
// Structure: { channelID: { "ip:port": lastSeenTimestamp } }
const channels = {};

server.on('error', (err) => {
    console.log(`Server error:\n${err.stack}`);
    server.close();
});

server.on('message', (msg, rinfo) => {
    // 1. Validate Packet Size
    // Header is exactly 11 bytes. Any packet smaller than this is junk.
    if (msg.length < 11) return;

    // 2. Parse Header (Big Endian)
    // [0] Type (1 Byte) - Not used for routing, but good to know
    // [1-4] Virtual IP / User ID (4 Bytes)
    // [5-6] Channel ID (2 Bytes) -> ROUTING KEY
    // [7-8] Sequence (2 Bytes)
    // [9-10] Payload Length (2 Bytes) -> HEARTBEAT CHECK

    const userId = msg.readUInt32BE(1);      // Bytes 1-4
    const channelId = msg.readUInt16BE(5);   // Bytes 5-6
    const payloadLen = msg.readUInt16BE(9);  // Bytes 9-10

    // Create unique network address key
    const clientKey = `${rinfo.address}:${rinfo.port}`;
    const now = Date.now();

    // 3. Update Session (NAT Keep-Alive Logic)
    if (!channels[channelId]) {
        channels[channelId] = {};
    }

    if (!channels[channelId][clientKey]) {
        console.log(`New Client: User ${userId} (IP: ${clientKey}) joined Channel ${channelId}`);
    }
    
    // Update timestamp to keep the router port open
    channels[channelId][clientKey] = now;

    // Reflection Rule
    // Check the Payload Length field we parsed from bytes 9-10
    if (payloadLen === 0) {
        // It is a Heartbeat.
        // We updated the timestamp above, so we are done. Do NOT forward.
        // console.log(`Heartbeat from User ${userId}`); // Uncomment for debugging
        return;
    }

    // It is Audio (PayloadLen > 0). FORWARD to peers.
    const peers = channels[channelId];
    
    for (const [peerKey, lastSeen] of Object.entries(peers)) {
        // Don't echo back to sender
        if (peerKey !== clientKey) {
            const [peerIp, peerPort] = peerKey.split(':');
            
            // Forward the EXACT raw message (Header + Audio)
            // We do not modify the packet; we just reflect it.
            server.send(msg, parseInt(peerPort), peerIp, (err) => {
                if (err) console.error(`Send error to ${peerKey}:`, err);
            });
        }
    }
});

// Cleanup Task (Runs every 10 seconds)
setInterval(() => {
    const now = Date.now();
    for (const channelId in channels) {
        const clients = channels[channelId];
        for (const clientKey in clients) {
            if (now - clients[clientKey] > TIMEOUT_MS) {
                console.log(`Timeout: Removing ${clientKey} from Channel ${channelId}`);
                delete clients[clientKey];
            }
        }
        if (Object.keys(clients).length === 0) {
            delete channels[channelId];
        }
    }
}, 10000);

server.bind(PORT, () => {
    console.log(`UDP Relay Server listening on 0.0.0.0:${PORT}`);
    console.log("Expecting Big Endian Binary Packets (11 Byte Header)");
});
