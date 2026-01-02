# Scout Talk Relay Protocol Specification (v0.5.0)

This document defines the communication standard for the Scout Talk Relay system, optimized for high-latency, low-bandwidth environments such as radio-to-internet mesh bridges.

## 1. Transport Layer

* **Protocol:** UDP (User Datagram Protocol)
* **Port:** 6000 (Default)
* **Byte Order:** Big-Endian (Network Byte Order)
* **Identification:** Stateless. The server identifies unique users by the 32-bit `UserID` field, allowing multiple users per IP address (Multiplexing).

---

## 2. The Universal Header (11 Bytes)

Every packet sent to the server (Type 0, 1, 2, or 3) **must** start with this 11-byte header.

| Offset | Field | Size | Data Type | Description |
| --- | --- | --- | --- | --- |
| **0** | **Type** | 1 Byte | UInt8 | `0`: Beacon, `1`: Audio, `2`: Text, `3`: Leave |
| **1-4** | **UserID** | 4 Bytes | UInt32BE | Unique numeric ID of the specific radio node/user. |
| **5-6** | **Channel** | 2 Bytes | UInt16BE | The destination Channel ID (0 = Trunk). |
| **7-8** | **Sequence** | 2 Bytes | UInt16BE | Incrementing counter to track packet loss. |
| **9-10** | **Length** | 2 Bytes | UInt16BE | The size of the **Payload** following this header. |

---

## 3. Payload Specifications

### Type 0: Beacon / GPS Heartbeat (31 Bytes Total)

This packet is used for location tracking and identity broadcast. Standalone units send this periodically; Mesh nodes send it as a preamble before audio.

* **Header Length Field:** Must be `20`.
* **Total Packet Size:** 11 (Header) + 20 (Payload) = **31 Bytes**.

| Offset | Field | Size | Data Type | Description |
| --- | --- | --- | --- | --- |
| **11-14** | **Latitude** | 4 Bytes | Float32BE | IEEE 754 Latitude (e.g., 34.0522) |
| **15-18** | **Longitude** | 4 Bytes | Float32BE | IEEE 754 Longitude (e.g., -118.2437) |
| **19-30** | **Callsign** | 12 Bytes | String | UTF-8, Null-padded (`\0`) to 12 bytes. |

### Type 1: Audio Data

* **Header Length Field:** Size of the compressed audio frame.
* **Payload:** Raw compressed audio (e.g., Opus, Speex).

### Type 2: Text Message

* **Header Length Field:** Length of the string.
* **Payload:** UTF-8 encoded text message.

---

## 4. Operational Logic & Persistence

### PTT Preamble Logic

Since mesh radio nodes do not maintain a constant IP connection, they must send a **Type 0** packet immediately before an audio stream. This "wakes up" the server's routing table for that specific User ID and updates their location on the radar.

### Last Known Position (LKP) Radar

* **Active (Live):** A user is marked as active and pulsing green if a packet was received within **45 seconds**.
* **Historical (Ghost):** If no packets are received after 45 seconds, the server moves the user to `history`.
* **Persistence:** The map retains the dot as a faded "Ghost" for **4 hours**. After 4 hours of total silence, the user is purged from the radar.

---

## 5. Developer Implementation Example (Node.js)

```javascript
// Example: Creating a 31-byte Beacon
const buf = Buffer.alloc(31);

// Header
buf.writeUInt8(0, 0);            // Type 0
buf.writeUInt32BE(1234, 1);      // UserID 1234
buf.writeUInt16BE(1, 5);         // Channel 1
buf.writeUInt16BE(seq++, 7);     // Sequence
buf.writeUInt16BE(20, 9);        // Payload Length

// Payload
buf.writeFloatBE(34.0522, 11);   // Latitude
buf.writeFloatBE(-118.2437, 15); // Longitude
buf.write("MY-CALLSIGN", 19, 12, 'utf8'); // Callsign (auto-pads)

```