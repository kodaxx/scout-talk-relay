# Scout Talk Relay Server

A lightweight, high-performance UDP reflector designed for Push-To-Talk (PTT) voice applications. It handles NAT traversal (Keep-Alives) and reflects audio packets to clients in the same channel.

## Quick Start (One-Line Deploy)

Run this on a fresh Ubuntu/Debian VPS (e.g., Hostinger, DigitalOcean):

```bash
curl -sL https://raw.githubusercontent.com/kodaxx/scout-talk-relay/main/install.sh | bash

```

---

## Packet Structure

All integers are **Big Endian**. The header is exactly **11 Bytes**.

### Header Format

| Byte Offset | Field | Type | Description |
| --- | --- | --- | --- |
| **0** | `Type` | `UInt8` | Packet Type (Arbitrary, e.g., 1=Voice) |
| **1-4** | `User ID` | `UInt32` | Unique Sender ID |
| **5-6** | `Channel ID` | `UInt16` | **Routing Key** (Clients in same ID hear each other) |
| **7-8** | `Sequence` | `UInt16` | Packet Sequence Number |
| **9-10** | `Payload Len` | `UInt16` | **0** = Heartbeat, **>0** = Audio Data |

### Logic

1. **Heartbeats (`Payload Len == 0`):**
* Send this packet every **15-30 seconds** to keep the NAT hole open.
* **Server Behavior:** Updates the client's "Last Seen" timestamp. **Does not forward.**


2. **Audio (`Payload Len > 0`):**
* Append Opus/Audio data immediately after the 11-byte header.
* **Server Behavior:** Reflects the *entire* packet (Header + Audio) to all other clients in the `Channel ID`.

---

## Manual Installation

If you prefer not to use the automated script:

1. **Install Node.js & PM2:**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

```


2. **Run the Server:**
```bash
git clone https://github.com/kodaxx/scout-talk-relay.git
cd scout-talk-relay
npm install
pm2 start relay_server.js --name "scout-talk-relay"

```


3. **Enable Startup on Boot:**
```bash
pm2 save
pm2 startup

```

---

## Configuration

You can modify these constants at the top of `relay_server.js`:

* `PORT`: Default `6000` (UDP).
* `TIMEOUT_MS`: Default `45000` (45s). Users are removed from memory if silent for this long.

---

## Troubleshooting

**"I can't connect / Packets are dropped"**
If the server is running but packets aren't getting through, check the **Cloud Firewall**.

1. **Hostinger:** Go to **VPS Dashboard** → **Security** → **Firewall**.
* Create a new rule: `Protocol: UDP`, `Port: 6000`, `Source: 0.0.0.0/0`.


2. **AWS/DigitalOcean:** Check "Security Groups" or "Firewalls" and allow Inbound UDP 6000.

**Check Logs:**

```bash
pm2 logs scout-talk-relay

```
