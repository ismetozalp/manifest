'use strict';
(function (root) {
    const Columns = root.ManifestColumns
        || (typeof require !== 'undefined' ? require('./columns.js') : null);

    const DEFAULT_SETTINGS = {
        theme: 'system',                           // ManifestThemes id
        rpc: { port: null, secret: null },        // filled at setup
        pollIntervalMs: 1500,
        columns: { widths: Columns.DEFAULT_WIDTHS.slice() },  // download-table column widths (%)
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
        update: { repo: 'ismetozalp/manifest', checkOnStartup: true },
        // Detail dialogs the user minimized to the bottom taskbar, persisted so
        // they survive a re-login. Each is { gid, name }; entries whose download
        // no longer exists are pruned once downloads are polled (removing is OK).
        minimizedDetails: [],
        detailHeight: 50   // docked detail-panel height, in vh
    };

    function mergeOne(defaults, loaded) {
        return Object.assign({}, defaults, loaded || {});
    }

    // Keep only well-formed { gid, name } entries (a hand-edited or partially
    // written settings.yml shouldn't put junk in the taskbar).
    function mergeMinimized(loaded) {
        if (!Array.isArray(loaded)) return [];
        return loaded
            .filter((m) => m && typeof m.gid === 'string' && m.gid)
            .map((m) => ({ gid: m.gid, name: typeof m.name === 'string' && m.name ? m.name : m.gid }));
    }

    function mergeSettings(loaded) {
        loaded = loaded || {};
        return {
            theme: loaded.theme != null ? loaded.theme : DEFAULT_SETTINGS.theme,
            rpc: mergeOne(DEFAULT_SETTINGS.rpc, loaded.rpc),
            pollIntervalMs: loaded.pollIntervalMs != null ? loaded.pollIntervalMs : DEFAULT_SETTINGS.pollIntervalMs,
            columns: { widths: Columns.normalizeWidths(loaded.columns && loaded.columns.widths) },
            destinations: mergeOne(DEFAULT_SETTINGS.destinations, loaded.destinations),
            limits: mergeOne(DEFAULT_SETTINGS.limits, loaded.limits),
            update: mergeOne(DEFAULT_SETTINGS.update, loaded.update),
            minimizedDetails: mergeMinimized(loaded.minimizedDetails),
            detailHeight: (Number.isFinite(Number(loaded.detailHeight)) && Number(loaded.detailHeight) > 0)
                ? Number(loaded.detailHeight) : DEFAULT_SETTINGS.detailHeight
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
