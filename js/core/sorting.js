// core/sorting.js — pure, stable table sorting shared by the download table and
// the detail Peers/Trackers tables. State is { key, dir:'asc'|'desc' }; rows are
// sorted by a per-column key function. Sorting is what it is — small and pure so
// it can be unit-tested without a DOM.
'use strict';
(function (root) {
    // Click a header: same key flips direction, a new key starts ascending.
    function nextSort(cur, key) {
        if (cur && cur.key === key) return { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' };
        return { key, dir: 'asc' };
    }

    // Stable sort of `rows` by keyFns[state.key]. Returns a NEW array; with no
    // state (or an unknown key) the original order is preserved.
    function sortRows(rows, state, keyFns) {
        const list = Array.isArray(rows) ? rows.slice() : [];
        if (!state || !state.key || !keyFns || typeof keyFns[state.key] !== 'function') return list;
        const keyFn = keyFns[state.key];
        const sign = state.dir === 'desc' ? -1 : 1;
        return list
            .map((v, i) => [v, i, keyFn(v)])
            .sort((a, b) => {
                if (a[2] < b[2]) return -sign;
                if (a[2] > b[2]) return sign;
                return a[1] - b[1];           // stable: fall back to original index
            })
            .map((p) => p[0]);
    }

    // Header arrow for the currently-sorted column (empty otherwise).
    function indicator(state, key) {
        if (!state || state.key !== key) return '';
        return state.dir === 'asc' ? ' ▲' : ' ▼';
    }

    const ManifestSorting = { nextSort, sortRows, indicator };
    root.ManifestSorting = ManifestSorting;
    if (typeof module !== 'undefined' && module.exports) module.exports = ManifestSorting;
})(typeof window !== 'undefined' ? window : globalThis);
