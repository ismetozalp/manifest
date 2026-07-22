'use strict';
(function (root) {
    const DEFAULT_SETTINGS = {
        theme: 'system',                           // ManifestThemes id
        rpc: { port: null, secret: null },        // filled at setup
        pollIntervalMs: 1500,
        destinations: { default: null, bookmarks: [], recents: [] },
        limits: {
            maxConcurrentDownloads: 5,              // max-concurrent-downloads
            maxConnectionsPerServer: 16,            // max-connection-per-server (aria2 hard cap 16)
            splitPerDownload: 5,                    // split
            minSplitSizeMiB: 20,                    // min-split-size (new downloads)
            maxPeersPerTorrent: 55,                 // bt-max-peers
            downloadLimitKiB: 0,                    // max-overall-download-limit (0 = unlimited)
            uploadLimitKiB: 0,                      // max-overall-upload-limit
            seedRatio: 1.0,                         // seed-ratio (per torrent)
            seedTimeMin: 0                          // seed-time minutes (0 = disabled)
        },
        update: { repo: 'ismetozalp/manifest', checkOnStartup: true }
    };

    function mergeOne(defaults, loaded) {
        return Object.assign({}, defaults, loaded || {});
    }

    function mergeSettings(loaded) {
        loaded = loaded || {};
        return {
            theme: loaded.theme != null ? loaded.theme : DEFAULT_SETTINGS.theme,
            rpc: mergeOne(DEFAULT_SETTINGS.rpc, loaded.rpc),
            pollIntervalMs: loaded.pollIntervalMs != null ? loaded.pollIntervalMs : DEFAULT_SETTINGS.pollIntervalMs,
            destinations: mergeOne(DEFAULT_SETTINGS.destinations, loaded.destinations),
            limits: mergeOne(DEFAULT_SETTINGS.limits, loaded.limits),
            update: mergeOne(DEFAULT_SETTINGS.update, loaded.update)
        };
    }

    function speedOpt(kib) {
        kib = Number(kib) || 0;
        return kib <= 0 ? '0' : kib + 'K';
    }

    function toAria2GlobalOptions(settings) {
        const limits = (settings && settings.limits) || DEFAULT_SETTINGS.limits;
        const maxConn = Math.max(1, Math.min(16, Number(limits.maxConnectionsPerServer) || 0));
        return {
            'max-concurrent-downloads': String(limits.maxConcurrentDownloads),
            'max-connection-per-server': String(maxConn),
            'split': String(limits.splitPerDownload),
            'min-split-size': limits.minSplitSizeMiB + 'M',
            'bt-max-peers': String(limits.maxPeersPerTorrent),
            'max-overall-download-limit': speedOpt(limits.downloadLimitKiB),
            'max-overall-upload-limit': speedOpt(limits.uploadLimitKiB),
            'seed-ratio': String(limits.seedRatio),
            'seed-time': String(limits.seedTimeMin)
        };
    }

    const ManifestDefaults = { DEFAULT_SETTINGS, mergeSettings, toAria2GlobalOptions };
    root.ManifestDefaults = ManifestDefaults;
    if (typeof module !== 'undefined' && module.exports) module.exports = ManifestDefaults;
})(typeof window !== 'undefined' ? window : globalThis);
