'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const P = require('../../js/core/peerid.js');

test('decodePeerId: Azureus-style qBittorrent with numeric version dot-joins', () => {
    // -qB5140- percent-encoded (the second, correctly-shown peer from the report)
    assert.equal(P.decodePeerId('%2DqB5140%2Dabcdef'), 'qBittorrent 5.1.4.0');
});

test('decodePeerId: the reported gibberish peer decodes cleanly (no %-escapes)', () => {
    // -BT7b0W- then non-UTF-8 bytes %97 %B8 — decodeURIComponent would throw and
    // leave "%2DBT7b0W%2D%97%B8..." on screen. Byte-wise decode + alphanumeric
    // version → a clean client string.
    const out = P.decodePeerId('%2DBT7b0W%2D%97%B8j%2Dxyz');
    assert.equal(out, 'BitTorrent 7b0W');
    assert.ok(!/%/.test(out), 'must not contain percent-escapes');
});

test('decodePeerId: known 2-letter codes map to client names', () => {
    assert.equal(P.decodePeerId('-TR4050-xxxxxxxxxxxx'), 'Transmission 4.0.5.0');
    assert.equal(P.decodePeerId('-UT3550-xxxxxxxxxxxx'), 'µTorrent 3.5.5.0');
    assert.equal(P.decodePeerId('-DE2040-xxxxxxxxxxxx'), 'Deluge 2.0.4.0');
});

test('decodePeerId: unknown 2-letter code shows the code + version', () => {
    assert.equal(P.decodePeerId('-ZZ1234-xxxxxxxxxxxx'), 'ZZ 1.2.3.4');
});

test('decodePeerId: alphanumeric (base62) version is shown verbatim, not dot-joined', () => {
    assert.equal(P.decodePeerId('-qBAbCd-xxxxxxxxxxxx'), 'qBittorrent AbCd');
});

test('decodePeerId: non-Azureus id falls back to its printable ASCII prefix', () => {
    // Shadow-style / mainline-ish ids that don't match -CCVVVV-
    assert.equal(P.decodePeerId('M7-1-1--xxxxxxxxxxxx'), 'M7-1-1--xxxxxxxxxxxx'.slice(0, 20));
});

test('decodePeerId: all-non-printable id → Unknown, never percent gibberish', () => {
    assert.equal(P.decodePeerId('%00%01%02%97%B8%FF'), 'Unknown');
});

test('decodePeerId: empty/nullish input → empty string', () => {
    assert.equal(P.decodePeerId(''), '');
    assert.equal(P.decodePeerId(null), '');
    assert.equal(P.decodePeerId(undefined), '');
});

test('pctDecodeBytes: decodes %XX byte-wise and never throws on non-UTF-8', () => {
    assert.equal(P.pctDecodeBytes('%2Dabc%2D'), '-abc-');
    // %97 is invalid UTF-8; decodeURIComponent would throw, this must not
    assert.doesNotThrow(() => P.pctDecodeBytes('%97%B8'));
    assert.equal(P.pctDecodeBytes('%97').charCodeAt(0), 0x97);
    assert.equal(P.pctDecodeBytes(null), '');
});
