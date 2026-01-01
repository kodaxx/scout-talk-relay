module.exports = {
    version: "0.4.0",
    
    // Active routing table: channels[channelId][userId]
    channels: {},

    // Persistent GPS cache (Last Known Position)
    // Updated by server.js, persists for 4 hours
    history: {},

    stats: {
        packetsIn: 0,
        packetsOut: 0,
        upstreamLoss: 0,
        downstreamErrors: 0,
        loopLag: 0
    },

    events: [],

    config: {
        UDP_PORT: 6000,
        WEB_PORT: 8080,
        TRUNK_CHANNEL: 0,
        TIMEOUT_MS: 45000 // Active session timeout (45s)
    }
};