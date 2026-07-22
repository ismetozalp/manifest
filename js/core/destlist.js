// core/destlist.js — pure list logic for the destinations "recents" list.
// Dedupe + cap, most-recent-first. Consumed by core/settings.js (pushRecent).
'use strict';
(function (root) {
    function pushRecent(list, path, cap) {
        list = Array.isArray(list) ? list : [];
        cap = Number(cap) || 0;
        const rest = list.filter((p) => p !== path);
        const next = [path].concat(rest);
        return cap > 0 ? next.slice(0, cap) : next;
    }

    const ManifestDestList = { pushRecent };
    root.ManifestDestList = ManifestDestList;
    if (typeof module !== 'undefined' && module.exports) module.exports = ManifestDestList;
})(typeof window !== 'undefined' ? window : globalThis);
