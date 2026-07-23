// core/columns.js — download-table column widths (pure). Widths are stored as
// percentages so the layout is resolution-independent and persists cleanly to
// settings.yml. The table uses `table-layout: fixed` with these widths, so a
// column's width never depends on its content — that's what stops rows from
// shaking left/right when a speed value flips between one and two digits.
'use strict';
(function (root) {
    // type, Name, Size, Progress, ↓, ↑, ETA, Status, actions — sums to 100.
    const DEFAULT_WIDTHS = [3, 23, 9, 18, 11, 11, 8, 9, 8];
    const COLUMN_COUNT = DEFAULT_WIDTHS.length;
    const MIN_PCT = 3;   // a column can't be dragged narrower than this

    function isValidWidths(w) {
        return Array.isArray(w) && w.length === COLUMN_COUNT
            && w.every((x) => typeof x === 'number' && isFinite(x) && x > 0);
    }

    // Coerce a loaded widths array to a valid one; fall back to defaults when
    // the shape is wrong (missing, wrong length, non-numeric, non-positive).
    function normalizeWidths(w) {
        return isValidWidths(w) ? w.slice() : DEFAULT_WIDTHS.slice();
    }

    function round2(n) {
        return Math.round(n * 100) / 100;
    }

    // Transfer width across the boundary between column `i` and column `i+1` by
    // `deltaPct` (positive = column i grows, i+1 shrinks), clamped so neither
    // side drops below `minPct`. The pair's combined width is preserved exactly,
    // so the table total never drifts. Pure: returns a new array, never mutates.
    function applyResize(widths, i, deltaPct, minPct) {
        const out = normalizeWidths(widths);
        const min = (typeof minPct === 'number' && minPct >= 0) ? minPct : MIN_PCT;
        // No boundary to the right of the last column (or a bogus index).
        if (!(i >= 0 && i < out.length - 1)) return out;
        const left = out[i], right = out[i + 1];
        const sum = left + right;
        const lo = min - left;        // most-negative delta that keeps `left` >= min
        const hi = right - min;       // most-positive delta that keeps `right` >= min
        let d = Number(deltaPct) || 0;
        d = Math.max(lo, Math.min(hi, d));
        if (lo > hi) d = 0;           // pair too small to satisfy both mins — don't move
        const newLeft = round2(left + d);
        out[i] = newLeft;
        out[i + 1] = round2(sum - newLeft);   // keep the pair sum exact
        return out;
    }

    const ManifestColumns = { DEFAULT_WIDTHS, COLUMN_COUNT, MIN_PCT, isValidWidths, normalizeWidths, applyResize };
    root.ManifestColumns = ManifestColumns;
    if (typeof module !== 'undefined' && module.exports) module.exports = ManifestColumns;
})(typeof window !== 'undefined' ? window : globalThis);
