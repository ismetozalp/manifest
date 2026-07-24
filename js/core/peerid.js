// core/peerid.js — decode a BitTorrent peer id into a human client string.
// aria2 returns peerId percent-encoded (raw 20 bytes, NOT UTF-8 text), so it's
// decoded byte-wise here: decodeURIComponent would throw on a byte like %97 and
// leave the whole thing percent-encoded (the "%2DBT..%97%B8" gibberish bug).
'use strict';
(function (root) {
    const CLIENT_CODES = {
        UT: 'µTorrent', TR: 'Transmission', DE: 'Deluge', LT: 'libtorrent',
        qB: 'qBittorrent', AZ: 'Vuze/Azureus', BC: 'BitComet', KT: 'KTorrent',
        RS: 'Rufus', WW: 'WebTorrent', A2: 'aria2', LP: 'libtorrent (Rasterbar)',
        BT: 'BitTorrent', SD: 'Xunlei', XL: 'Xunlei', TS: 'TorrentStorm',
    };

    // Percent-decode to a raw byte string. Each %XX becomes one byte; other
    // characters pass through. Never throws (unlike decodeURIComponent).
    function pctDecodeBytes(s) {
        return String(s == null ? '' : s)
            .replace(/%([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    }

    function decodePeerId(peerId) {
        if (!peerId) return '';
        const raw = pctDecodeBytes(peerId);
        // Azureus style: -CCVVVV- (2-char client code, 4-char version), then
        // random bytes. Version chars may be alphanumeric (base62), not just
        // digits — the old \d{4} missed those and fell through to raw output.
        const az = /^-([A-Za-z\d]{2})([A-Za-z\d]{4})-/.exec(raw);
        if (az) {
            const name = CLIENT_CODES[az[1]] || az[1];
            const ver = /^\d{4}$/.test(az[2]) ? az[2].split('').join('.') : az[2];
            return name + ' ' + ver;
        }
        // Fallback: the readable ASCII prefix (many clients tag the id in plain
        // text), non-printable bytes dropped. Never surface percent-escapes.
        const printable = raw.replace(/[^\x20-\x7e]/g, '').trim();
        return printable ? printable.slice(0, 20) : 'Unknown';
    }

    const ManifestPeerId = { decodePeerId, pctDecodeBytes, CLIENT_CODES };
    root.ManifestPeerId = ManifestPeerId;
    if (typeof module !== 'undefined' && module.exports) module.exports = ManifestPeerId;
})(typeof window !== 'undefined' ? window : globalThis);
