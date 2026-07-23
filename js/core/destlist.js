// core/destlist.js — pure list logic for the destinations "recents" list.
// Dedupe + cap, most-recent-first. Consumed by core/settings.js (pushRecent).
'use strict';
(function (root) {
    function pushRecent(list, path, cap) {
        const rest = (Array.isArray(list) ? list : []).filter((p) => p !== path);
        // Don't record an empty/nullish path.
        const next = (path == null || path === '') ? rest : [path].concat(rest);
        const c = Number(cap);
        if (!Number.isFinite(c)) return next;   // absent/invalid cap → no capping
        if (c <= 0) return [];                   // explicit 0 (or negative) → empty
        return next.slice(0, c);
    }

    // Recents to show in the "Recent" destination group: drop any path that's
    // already a saved bookmark (it appears under "Saved"), then cap. Keeps the
    // two destination groups from listing the same path twice.
    function recentsExcluding(recents, bookmarkPaths, cap) {
        const excluded = new Set(Array.isArray(bookmarkPaths) ? bookmarkPaths : []);
        const list = (Array.isArray(recents) ? recents : []).filter((p) => p && !excluded.has(p));
        const c = Number(cap);
        if (!Number.isFinite(c) || c < 0) return list;
        return list.slice(0, c);
    }

    const ManifestDestList = { pushRecent, recentsExcluding };
    root.ManifestDestList = ManifestDestList;
    if (typeof module !== 'undefined' && module.exports) module.exports = ManifestDestList;
})(typeof window !== 'undefined' ? window : globalThis);
