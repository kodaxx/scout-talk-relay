# System Architecture & Routing Roles (v1.6.2)

The system is comprised of three primary hardware/software roles. While they all communicate using the same 31-byte protocol header, their responsibilities in moving data differ significantly.

---

## 1. Standalone Unit (The Direct Uplink)

A Standalone unit is typically a high-power mobile device or a fixed site that has a **direct connection to the Internet** (via LTE, Satellite, or Ethernet) while simultaneously running the Scout Talk app.

* **Network Role:** End-Point.
* **Routing Behavior:** * Encapsulates its own GPS, Callsign, and Audio directly into UDP packets.
* Sends packets straight to the Relay Server IP.
* Does not "repeat" or "bridge" traffic for others.


* **Radar Status:** Appears as a high-reliability "Active" node.

---

## 2. Mesh Bridge (The Tactical Gateway)

The Mesh Bridge is the most critical role. It acts as the "translator" between the **Offline Mesh (Wi-Fi HaLow)** and the **Online Relay Server**. It usually possesses two network interfaces: a HaLow radio and an Internet uplink (LTE/Starlink).

* **Network Role:** Transparent Multiplexer / Gateway.
* **Routing Behavior:**
* **Inbound (From Mesh):** Listens for HaLow radio packets from Mesh Nodes. It takes those packets and wraps them in the UDP protocol, then forwards them to the Relay Server.
* **Outbound (From Server):** Receives UDP traffic from the Relay Server and broadcasts it over the HaLow radio frequency to all local Mesh Nodes.


* **Multiplexing:** It maintains the `UserID` of the original sender. The server sees the Bridge's IP address but recognizes multiple distinct `UserIDs` coming from it.
* **Radar Status:** Identified by the "MESH" tag on the dashboard, as multiple IDs share the same gateway IP.

---

## 3. Mesh Node (The Edge User)

A Mesh Node is a user with a HaLow-equipped radio but **no direct internet access**. They rely entirely on being within HaLow range of a Mesh Bridge to communicate with the rest of the world.

* **Network Role:** Edge Client.
* **Routing Behavior:**
* Broadcasts HaLow packets locally.
* "Hears" other Mesh Nodes directly (if in range) or via the Bridge (if the Bridge repeats the signal).
* Relies on the Bridge to insert its `UserID` and `Callsign` into the global Relay Server.


* **Radar Status:** Appears on the map via the Bridge’s coordinates (or its own GPS if equipped). If it moves out of range of the Bridge, it becomes a **"Ghost/Historical"** marker after 45 seconds.

---

## Summary of Traffic Flow

| Role | Primary Link | Secondary Link | Routing Logic |
| --- | --- | --- | --- |
| **Standalone** | LTE/Internet | N/A | Direct to Server |
| **Mesh Bridge** | LTE/Internet | Wi-Fi HaLow | Bridge <-> Server |
| **Mesh Node** | Wi-Fi HaLow | N/A | Node -> Bridge -> Server |

---

## The Role of Wi-Fi HaLow

Unlike standard 2.4GHz Wi-Fi, the **HaLow** layer allows the Mesh Nodes to stay connected to the Bridge even through heavy foliage or at distances exceeding 1km. This protocol (v1.6.2) is designed specifically for this because HaLow has lower data rates than traditional Wi-Fi; by keeping our packets at **31 bytes**, we ensure the HaLow frequency isn't "clogged" with overhead, leaving maximum room for clear audio.