const dgram = require('dgram');
const readline = require('readline');

// --- CONFIGURATION ---
// Replace with your server's IP. Use '127.0.0.1' if testing locally.
const SERVER_IP = '127.0.0.1'; 
const SERVER_PORT = 6000;
const CHANNEL_ID = 1;

// Generate a random User ID for this session
const USER_ID = Math.floor(Math.random() * 9000) + 1000; 
const HEARTBEAT_INTERVAL = 15000; // 15 seconds

const client = dgram.createSocket('udp4');

// --- PACKET CREATION ---
function createPacket(payloadStr = "") {
    const payloadBuffer = Buffer.from(payloadStr, 'utf-8');
    const headerBuffer = Buffer.alloc(11);

    // Header Format:
    // [0] Type (1)
    // [1-4] UserID (UInt32BE)
    // [5-6] ChanID (UInt16BE)
    // [7-8] Seq (UInt16BE)
    // [9-10] Payload Len (UInt16BE)

    headerBuffer.writeUInt8(1, 0);              // Type
    headerBuffer.writeUInt32BE(USER_ID, 1);     // User ID
    headerBuffer.writeUInt16BE(CHANNEL_ID, 5);  // Channel ID
    headerBuffer.writeUInt16BE(0, 7);           // Sequence (0 for test)
    headerBuffer.writeUInt16BE(payloadBuffer.length, 9); // Payload Length

    return Buffer.concat([headerBuffer, payloadBuffer]);
}

// --- RECEIVE LOGIC ---
client.on('message', (msg, rinfo) => {
    // Basic validation
    if (msg.length < 11) return;

    // Parse Header
    const senderId = msg.readUInt32BE(1);
    const payloadLen = msg.readUInt16BE(9);
    const payload = msg.subarray(11);

    // If payload > 0, it's a message (Fake Audio)
    if (payloadLen > 0) {
        // Move cursor to start of line, clear it, print message, restore prompt
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        console.log(`[User ${senderId}]: ${payload.toString()}`);
        process.stdout.write("> ");
    }
});

// --- HEARTBEAT LOGIC ---
setInterval(() => {
    const heartbeat = createPacket(""); // Empty payload
    client.send(heartbeat, SERVER_PORT, SERVER_IP, (err) => {
        if (err) console.error("Heartbeat failed:", err);
    });
}, HEARTBEAT_INTERVAL);

// --- USER INPUT (FAKE AUDIO) ---
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log(`--- UDP PTT CLIENT (User: ${USER_ID}) ---`);
console.log(`Target: ${SERVER_IP}:${SERVER_PORT} | Channel: ${CHANNEL_ID}`);
console.log("Type a message and press Enter to send.");
process.stdout.write("> ");

rl.on('line', (input) => {
    if (input.trim()) {
        const packet = createPacket(input);
        client.send(packet, SERVER_PORT, SERVER_IP, (err) => {
            if (err) console.error(err);
        });
    }
    process.stdout.write("> ");
});
