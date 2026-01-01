# Scout Talk Relay Server (v0.2.0)

A modular, high-performance UDP reflector designed for Push-To-Talk (PTT) voice and text applications. It handles NAT traversal, real-time diagnostics, and "Global Trunk" bridging.

## Quick Start (One-Line Deploy)

Run this on a fresh Ubuntu/Debian VPS (e.g., DigitalOcean, Hostinger):

```bash
curl -sL https://raw.githubusercontent.com/kodaxx/scout-talk-relay/main/install.sh | bash

```

---

## 📡 Protocol Specification

All integers are **Big Endian**. The header is exactly **11 Bytes**.

### Header Format

| Byte Offset | Field | Type | Description |
| --- | --- | --- | --- |
| **0** | `Type` | `UInt8` | 0=Beacon, 1=Audio, 2=Text, 3=Leave |
| **1-4** | `User ID` | `UInt32` | Unique ID/IP for the session |
| **5-6** | `Channel ID` | `UInt16` | **Routing Key** (0-999) |
| **7-8** | `Sequence` | `UInt16` | Packet counter for loss detection |
| **9-10** | `Payload Len` | `UInt16` | Length of data following the header |

### Packet Logic

1. **TYPE_BEACON (0):**
* Sent every **15-30s** to maintain NAT mapping.
* **Server:** Updates "Last Seen" timestamp. **Does not forward.**


2. **TYPE_AUDIO (1) & TYPE_TEXT (2):**
* Contains voice or chat data.
* **Server:** Reflects packet to everyone in the `Channel ID` **AND** everyone in `Channel 0`.


3. **TYPE_LEAVE (3):**
* Sent when a user switches channels or exits.
* **Server:** Instantly deletes the user from that channel list.



---

## 🏗 Modular Architecture

To ensure stability, the server is split into three components:

* **`state.js`**: Shared in-memory data (channels, stats, and logs).
* **`server.js`**: The UDP relay engine and session manager.
* **`dashboard.js`**: A web-based UI for real-time monitoring.

---

## 📊 Live Dashboard & Diagnostics

The server includes a built-in monitoring tool accessible at `http://your-ip:8080`.

* **Real-time Stats:** Monitor Packets In/Out and Event Loop Lag.
* **Upstream Loss:** Uses the `Sequence` header to detect packets lost between the user and the server.
* **Global Broadcast:** Send administrative text messages to every connected user.
* **Event Log:** View join/leave/timeout events as they happen.

---

## 🛠 Manual Installation

1. **Install Node.js & PM2:**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

```


2. **Setup Project:**
```bash
git clone https://github.com/kodaxx/scout-talk-relay.git
cd scout-talk-relay
npm install
pm2 start server.js --name "scout-talk-relay"

```



---

## 🛡 Firewall Configuration

You must open both the UDP port for traffic and the TCP port for the dashboard:

1. **UDP Port 6000:** Voice and Data traffic.
2. **TCP Port 8080:** Dashboard Web UI.

```bash
sudo ufw allow 6000/udp
sudo ufw allow 8080/tcp

```

---

## Management

**Check Live Traffic:**

```bash
pm2 logs scout-talk-relay

```

**Hot-Reload Update:**

```bash
./update.sh

```