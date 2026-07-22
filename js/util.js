'use strict';
(function (root) {
    const UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
    function humanSize(bytes) {
        bytes = Number(bytes) || 0;
        if (bytes < 1024) return bytes + ' B';
        let u = 0, v = bytes;
        while (v >= 1024 && u < UNITS.length - 1) { v /= 1024; u++; }
        return v.toFixed(1) + ' ' + UNITS[u];
    }
    function humanSpeed(bps) { return humanSize(bps) + '/s'; }
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    function eta(rem, sp) {
        rem = Number(rem) || 0; sp = Number(sp) || 0;
        if (sp <= 0 || rem <= 0) return '∞';
        let s = Math.round(rem / sp);
        const h = Math.floor(s / 3600); s -= h * 3600;
        const m = Math.floor(s / 60); s -= m * 60;
        if (h > 0) return h + 'h ' + pad2(m) + 'm';
        if (m > 0) return m + 'm ' + pad2(s) + 's';
        return s + 's';
    }
    function percent(done, total) {
        total = Number(total) || 0; done = Number(done) || 0;
        if (total <= 0) return 0;
        return Math.min(100, Math.floor(done / total * 100));
    }
    function shq(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }
    function joinPath(base, name) { return (base.endsWith('/') ? base : base + '/') + name; }
    function dirname(p) {
        const i = p.replace(/\/+$/, '').lastIndexOf('/');
        return i <= 0 ? '/' : p.slice(0, i);
    }
    function basename(p) { return p.replace(/\/+$/, '').split('/').pop(); }
    // Bridge Lesson #2 helper: FileReader.readAsDataURL() yields
    // "data:<mime>;base64,<payload>" — aria2.addTorrent/addMetalink want the
    // bare base64 payload. Already-bare input passes through unchanged.
    function stripDataUrl(dataUrl) { return String(dataUrl).replace(/^data:[^,]*,/, ''); }
    const ManifestUtil = { humanSize, humanSpeed, eta, percent, shq, joinPath, dirname, basename, stripDataUrl };
    root.ManifestUtil = ManifestUtil;
    if (typeof module !== 'undefined' && module.exports) module.exports = ManifestUtil;
})(typeof window !== 'undefined' ? window : globalThis);
