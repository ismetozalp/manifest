// core/optdiff.js — pure helpers for the aria2 option editors (global options
// editor + per-download options). Options are string→string maps; we only ever
// send aria2 the keys the user actually changed.
'use strict';
(function (root) {
    // Return { key: value } for every key in `edited` whose (stringified) value
    // differs from `orig`'s. Empty-string values ARE sent (aria2 treats "" as
    // reset-to-default for some options) as long as they differ from orig.
    function changedOptions(orig, edited) {
        orig = orig || {};
        edited = edited || {};
        const out = {};
        for (const k of Object.keys(edited)) {
            const a = orig[k] == null ? '' : String(orig[k]);
            const b = edited[k] == null ? '' : String(edited[k]);
            if (a !== b) out[k] = b;
        }
        return out;
    }

    // Build an aria2 options object from a spec [{key, value}], dropping
    // blank/undefined values so we never send an empty option aria2 rejects.
    function buildOptions(fields) {
        const out = {};
        for (const f of (fields || [])) {
            if (!f || !f.key) continue;
            const v = f.value;
            if (v == null || String(v).trim() === '') continue;
            out[f.key] = String(v);
        }
        return out;
    }

    // KiB/s number → aria2 speed-limit string ("0" = unlimited, else "<n>K").
    function speedLimit(kib) {
        const n = Number(kib) || 0;
        return n <= 0 ? '0' : n + 'K';
    }

    const ManifestOptDiff = { changedOptions, buildOptions, speedLimit };
    root.ManifestOptDiff = ManifestOptDiff;
    if (typeof module !== 'undefined' && module.exports) module.exports = ManifestOptDiff;
})(typeof window !== 'undefined' ? window : globalThis);
