module.exports = {
    version: "0.1.0",
    channels: {},
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
        TIMEOUT_MS: 45000
    }
};