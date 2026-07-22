'use strict';
(function (root) {
    function classify(s) {
        const v = String(s || '').trim();
        if (!v) return { type: 'unknown', value: v };
        if (/^magnet:\?/i.test(v)) return { type: 'magnet', value: v };
        const isUrl = /^(https?|ftp|sftp):\/\//i.test(v);
        if (isUrl) {
            if (/\.(metalink|meta4)(\?.*)?$/i.test(v)) return { type: 'metalink', value: v };
            return { type: 'http', value: v };   // incl. remote .torrent — aria2 fetches the URL
        }
        if (/\.torrent$/i.test(v)) return { type: 'torrent', value: v };  // local file → base64 upload
        if (/\.(metalink|meta4)$/i.test(v)) return { type: 'metalink', value: v };
        return { type: 'unknown', value: v };
    }
    function parseLines(text) {
        return String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
            .map(l => { const c = classify(l); return { raw: l, type: c.type, value: c.value }; });
    }
    function dedupe(items) {
        const seen = new Set(), out = [];
        for (const it of items) { if (seen.has(it.value)) continue; seen.add(it.value); out.push(it); }
        return out;
    }
    const ManifestDetect = { classify, parseLines, dedupe };
    root.ManifestDetect = ManifestDetect;
    if (typeof module !== 'undefined' && module.exports) module.exports = ManifestDetect;
})(typeof window !== 'undefined' ? window : globalThis);
