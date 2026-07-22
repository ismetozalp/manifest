// core/systemctl.js — pure parser for `systemctl --user show ... -p k,k,k` output.
// Extracted from core/service.js per Phase 2 Task 2.3 Step 2 (non-trivial pure
// helper gets its own dual-export module + unit test).
'use strict';
(function (root) {
    function parseShow(text) {
        const out = {};
        String(text || '').split(/\r?\n/).forEach((line) => {
            const i = line.indexOf('=');
            if (i < 0) return;
            const k = line.slice(0, i).trim();
            if (!k) return;
            out[k] = line.slice(i + 1).trim();
        });
        return out;
    }

    function isActive(parsed) {
        return !!parsed && parsed.ActiveState === 'active';
    }

    const ManifestSystemctl = { parseShow, isActive };
    root.ManifestSystemctl = ManifestSystemctl;
    if (typeof module !== 'undefined' && module.exports) module.exports = ManifestSystemctl;
})(typeof window !== 'undefined' ? window : globalThis);
