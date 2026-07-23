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

    const ManifestDestList = { pushRecent };
    root.ManifestDestList = ManifestDestList;
    if (typeof module !== 'undefined' && module.exports) module.exports = ManifestDestList;
})(typeof window !== 'undefined' ? window : globalThis);
