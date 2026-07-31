// core/notify.js — pure detection of downloads that just finished, for desktop
// notifications. Given the previous and current gid→status maps, return the
// downloads that transitioned INTO a terminal state (complete/error) this poll.
'use strict';
(function (root) {
    const TERMINAL = { complete: 1, error: 1 };

    // prev/next are { gid: { status, name } }. Returns [{ gid, name, status }]
    // for gids whose status became complete/error and wasn't terminal before.
    // A gid absent from prev (first sighting) does NOT fire — we only notify on
    // an actual transition, so a page reload doesn't announce old completions.
    function newlyFinished(prev, next) {
        prev = prev || {};
        next = next || {};
        const out = [];
        for (const gid of Object.keys(next)) {
            const before = prev[gid];
            if (!before) continue;                       // first time we've seen it → no transition
            const cur = next[gid] || {};
            if (TERMINAL[cur.status] && !TERMINAL[before.status]) {
                out.push({ gid, name: cur.name || gid, status: cur.status });
            }
        }
        return out;
    }

    // Reduce a gid-keyed downloads map to the { gid: {status, name} } snapshot
    // newlyFinished compares against (keeps snapshots tiny).
    function snapshot(downloads, nameOf) {
        const out = {};
        for (const gid of Object.keys(downloads || {})) {
            const d = downloads[gid] || {};
            out[gid] = { status: d.status, name: (typeof nameOf === 'function' ? nameOf(d) : null) || gid };
        }
        return out;
    }

    const ManifestNotify = { newlyFinished, snapshot };
    root.ManifestNotify = ManifestNotify;
    if (typeof module !== 'undefined' && module.exports) module.exports = ManifestNotify;
})(typeof window !== 'undefined' ? window : globalThis);
