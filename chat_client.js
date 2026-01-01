const dgram = require('dgram');
const readline = require('readline');

// --- CONFIGURATION ---
// Change to your Droplet IP when deploying
const SERVER_IP = '127.0.0.1'; 
const SERVER_PORT = 6000;
const USER_ID = Math.floor(Math.random() * 9000) + 1000; 
const HEARTBEAT_INTERVAL = 15000;

// --- PROTOCOL CONSTANTS ---
const TYPE_BEACON = 0;
const TYPE_AUDIO  = 1;
const TYPE_TEXT   = 2;
const TYPE_LEAVE  = 3;

// --- CLIENT STATE ---
const client = dgram.createSocket('udp4');
let currentChannel = 1;
let sequence = 0;

/**
 * Creates a protocol-compliant 11-byte header + payload
 */
function createPacket(type, channel, payloadStr = "") {
    const payloadBuffer = Buffer.from(payloadStr, 'utf-8');
    const headerBuffer = Buffer.alloc(11);

    // [0] Type
    headerBuffer.writeUInt8(type, 0);
    // [1-4] User ID
    headerBuffer.writeUInt32BE(USER_ID, 1);
    // [5-6] Channel ID
    headerBuffer.writeUInt16BE(channel, 5);
    // [7-8] Sequence
    headerBuffer.writeUInt16BE(sequence, 7);
    // [9-10] Payload Length
    headerBuffer.writeUInt16BE(payloadBuffer.length, 9);

    // Increment sequence for tracking (Audio and Text usually track loss)
    if (type === TYPE_AUDIO || type === TYPE_TEXT) {
        sequence = (sequence + 1) % 65536;
    }

    return Buffer.concat([headerBuffer, payloadBuffer]);
}

// --- RECEIVE LOGIC ---
client.on('message', (msg, rinfo) => {
    if (msg.length < 11) return;

    const type = msg.readUInt8(0);
    const senderId = msg.readUInt32BE(1);
    const payloadLen = msg.readUInt16BE(9);
    const payload = msg.subarray(11, 11 + payloadLen).toString();

    // Only process TYPE_TEXT (2). Ignore Audio (1) and Beacons (0).
    if (type === TYPE_TEXT) {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        
        // Use colors to distinguish different users (Cyan for ID, Default for text)
        console.log(`\x1b[36m[CH ${currentChannel} | User ${senderId}]\x1b[0m: ${payload}`);
        process.stdout.write(`(Ch ${currentChannel}) > `);
    }
});

// --- HEARTBEAT / BEACON ---
// Periodically tells the server we are still here and updates NAT mapping
setInterval(() => {
    const beacon = createPacket(TYPE_BEACON, currentChannel, "");
    client.send(beacon, SERVER_PORT, SERVER_IP);
}, HEARTBEAT_INTERVAL);

// --- INTERFACE & COMMANDS ---
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log(`\x1b[32m==========================================`);
console.log(`   SCOUT TALK CHAT CLIENT (ID: ${USER_ID})`);
console.log(`==========================================\x1b[0m`);
console.log(`Target: ${SERVER_IP}:${SERVER_PORT}`);
console.log(`Commands:`);
console.log(`  /join <0-999>  - Switch channels (sends TYPE_LEAVE to old)`);
console.log(`  /exit          - Quit application`);
console.log(`------------------------------------------`);
process.stdout.write(`(Ch ${currentChannel}) > `);

rl.on('line', (input) => {
    const line = input.trim();

    if (line.startsWith('/join ')) {
        const newChan = parseInt(line.split(' ')[1]);
        
        if (!isNaN(newChan) && newChan >= 0 && newChan <= 999) {
            // 1. Tell the server we are leaving the OLD channel
            const leavePacket = createPacket(TYPE_LEAVE, currentChannel, "");
            client.send(leavePacket, SERVER_PORT, SERVER_IP, () => {
                
                const oldChan = currentChannel;
                currentChannel = newChan;
                
                // 2. Immediately register on the NEW channel
                const joinBeacon = createPacket(TYPE_BEACON, currentChannel, "");
                client.send(joinBeacon, SERVER_PORT, SERVER_IP);
                
                console.log(`\x1b[33m[SYSTEM] Switched from Ch ${oldChan} to Ch ${currentChannel}\x1b[0m`);
                process.stdout.write(`(Ch ${currentChannel}) > `);
            });
        } else {
            console.log(`\x1b[31m[ERROR] Invalid channel. Use 0-999.\x1b[0m`);
            process.stdout.write(`(Ch ${currentChannel}) > `);
        }
    } 
    else if (line === '/exit') {
        const leavePacket = createPacket(TYPE_LEAVE, currentChannel, "");
        client.send(leavePacket, SERVER_PORT, SERVER_IP, () => {
            console.log("Exiting...");
            process.exit();
        });
    } 
    else if (line) {
        // 3. Send message as TYPE_TEXT (2)
        const packet = createPacket(TYPE_TEXT, currentChannel, line);
        client.send(packet, SERVER_PORT, SERVER_IP, (err) => {
            if (err) console.error("Send Error:", err);
        });
        process.stdout.write(`(Ch ${currentChannel}) > `);
    } else {
        process.stdout.write(`(Ch ${currentChannel}) > `);
    }
});

// Handle graceful shutdown on Ctrl+C
rl.on('SIGINT', () => {
    const leavePacket = createPacket(TYPE_LEAVE, currentChannel, "");
    client.send(leavePacket, SERVER_PORT, SERVER_IP, () => {
        console.log("\nSession Ended.");
        process.exit();
    });
});