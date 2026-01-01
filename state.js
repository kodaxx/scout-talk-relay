module.exports = {
    version: "0.2.0",
    
    // Structure: channels[channelId][userId] = { sessionData }
    channels: {},

    // Global performance metrics
    stats: {
        packetsIn: 0,
        packetsOut: 0,
        upstreamLoss: 0,        // Detected via sequence gaps
        downstreamErrors: 0,    // UDP send failures
        loopLag: 0              // Event loop delay in ms
    },

    // Rolling buffer of the last 50 system events
    events: [],

    // Server configuration
    config: {
        UDP_PORT: 6000,
        WEB_PORT: 8080,
        TRUNK_CHANNEL: 0,       // All traffic is mirrored here
        TIMEOUT_MS: 45000       // User is dropped after 45s of silence
    }
};