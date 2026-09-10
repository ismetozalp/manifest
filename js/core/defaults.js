'use strict';
(function (root) {
    const Columns = root.ManifestColumns
        || (typeof require !== 'undefined' ? require('./columns.js') : null);

    const DEFAULT_SETTINGS = {
        theme: 'system',                           // ManifestThemes id
        rpc: { port: null, secret: null, listenAll: false },   // port/secret filled at setup; listenAll = bind RPC to all interfaces
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
            seedTimeMin: 0,                         // seed-time minutes (0 = disabled)
            diskCacheMiB: 64                        // disk-cache (RAM write buffer; 0 = disabled, aria2 default 16M)
        },
        update: { repo: 'ismetozalp/manifest', checkOnStartup: true },
        // Detail dialogs the user minimized to the bottom taskbar, persisted so
        // they survive a re-login. Each is { gid, name }; entries whose download
        // no longer exists are pruned once downloads are polled (removing is OK).
        minimizedDetails: [],
        detailHeight: 50,  // docked detail-panel height, in vh
        notifications: false   // desktop notifications on download complete/error
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
            rpc: Object.assign(mergeOne(DEFAULT_SETTINGS.rpc, loaded.rpc), { listenAll: !!(loaded.rpc && loaded.rpc.listenAll) }),
            pollIntervalMs: loaded.pollIntervalMs != null ? loaded.pollIntervalMs : DEFAULT_SETTINGS.pollIntervalMs,
            columns: { widths: Columns.normalizeWidths(loaded.columns && loaded.columns.widths) },
            destinations: mergeOne(DEFAULT_SETTINGS.destinations, loaded.destinations),
            limits: mergeOne(DEFAULT_SETTINGS.limits, loaded.limits),
            update: mergeOne(DEFAULT_SETTINGS.update, loaded.update),
            minimizedDetails: mergeMinimized(loaded.minimizedDetails),
            detailHeight: (Number.isFinite(Number(loaded.detailHeight)) && Number(loaded.detailHeight) > 0)
                ? Number(loaded.detailHeight) : DEFAULT_SETTINGS.detailHeight,
            notifications: !!loaded.notifications
        };
    }

    function speedOpt(kib) {
        kib = Number(kib) || 0;
        return kib <= 0 ? '0' : kib + 'K';
    }

    function toAria2GlobalOptions(settings) {
        const limits = (settings && settings.limits) || DEFAULT_SETTINGS.limits;
        const maxConn = Math.max(1, Math.min(16, Number(limits.maxConnectionsPerServer) || 0));
        // disk-cache: a non-negative MiB buffer; 0 disables the cache. Fall back
        // to the 64M default when the value is missing/invalid rather than 0, so a
        // malformed setting doesn't silently turn the cache off. NB: this is a
        // STARTUP option — aria2 accepts it in changeGlobalOption (returns OK) but
        // ignores it on the running instance, so it only takes effect via the
        // written aria2.conf on the next aria2 start. It's emitted here anyway so
        // the conf carries it; the live payload it rides in ignores it harmlessly.
        const dcMiB = Number(limits.diskCacheMiB);
        const diskCache = Number.isFinite(dcMiB) && dcMiB >= 0
            ? (dcMiB > 0 ? dcMiB + 'M' : '0')
            : DEFAULT_SETTINGS.limits.diskCacheMiB + 'M';
        return {
            'max-concurrent-downloads': String(limits.maxConcurrentDownloads),
            'max-connection-per-server': String(maxConn),
            'split': String(limits.splitPerDownload),
            'min-split-size': limits.minSplitSizeMiB + 'M',
            'bt-max-peers': String(limits.maxPeersPerTorrent),
            'max-overall-download-limit': speedOpt(limits.downloadLimitKiB),
            'max-overall-upload-limit': speedOpt(limits.uploadLimitKiB),
            'seed-ratio': String(limits.seedRatio),
            'seed-time': String(limits.seedTimeMin),
            'disk-cache': diskCache
        };
    }

    const ManifestDefaults = { DEFAULT_SETTINGS, mergeSettings, toAria2GlobalOptions };
    root.ManifestDefaults = ManifestDefaults;
    if (typeof module !== 'undefined' && module.exports) module.exports = ManifestDefaults;
})(typeof window !== 'undefined' ? window : globalThis);
