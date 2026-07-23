'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const D = require('../../js/core/detect.js');

test('classify magnet', () => {
    assert.equal(D.classify('magnet:?xt=urn:btih:abc').type, 'magnet');
});
test('classify http/ftp', () => {
    assert.equal(D.classify('http://x/y.zip').type, 'http');
    assert.equal(D.classify('https://x/y.iso').type, 'http');
    assert.equal(D.classify('ftp://x/y').type, 'http');
});
test('classify remote .torrent is http (aria2 fetches url)', () => {
    assert.equal(D.classify('https://x/y.torrent').type, 'http');
});
test('classify local .torrent path needs upload', () => {
    assert.equal(D.classify('ubuntu.torrent').type, 'torrent');
    assert.equal(D.classify('/home/u/a.torrent').type, 'torrent');
});
test('classify metalink', () => {
    assert.equal(D.classify('https://x/y.metalink').type, 'metalink');
    assert.equal(D.classify('https://x/y.meta4').type, 'metalink');
});
test('classify unknown', () => {
    assert.equal(D.classify('just some words').type, 'unknown');
});
test('parseLines skips blanks', () => {
    const r = D.parseLines('magnet:?a\n\n  \nhttp://x/y');
    assert.equal(r.length, 2);
    assert.equal(r[0].type, 'magnet');
    assert.equal(r[1].type, 'http');
});
test('dedupe by value', () => {
    const r = D.dedupe([{value:'a'},{value:'a'},{value:'b'}]);
    assert.deepEqual(r.map(x => x.value), ['a', 'b']);
});

// --- classify: magnet case-insensitivity and param variations ---
test('classify magnet is case-insensitive on the scheme', () => {
    assert.equal(D.classify('MAGNET:?xt=urn:btih:ABC').type, 'magnet');
    assert.equal(D.classify('Magnet:?xt=urn:btih:abc').type, 'magnet');
});
test('classify magnet with no params after the ?', () => {
    assert.equal(D.classify('magnet:?').type, 'magnet');
});
test('classify near-miss magnet (no colon-question-mark) is unknown', () => {
    assert.equal(D.classify('magnet:xt=urn:btih:abc').type, 'unknown');
    assert.equal(D.classify('magnet').type, 'unknown');
});

// --- classify: http/https/ftp/sftp, case-insensitive scheme ---
test('classify recognizes http, https, ftp, sftp as http-type', () => {
    assert.equal(D.classify('http://x/y.zip').type, 'http');
    assert.equal(D.classify('https://x/y.iso').type, 'http');
    assert.equal(D.classify('ftp://x/y').type, 'http');
    assert.equal(D.classify('sftp://host/path').type, 'http'); // sftp also collapses to 'http'
});
test('classify URL scheme matching is case-insensitive', () => {
    assert.equal(D.classify('HTTP://X/Y.ZIP').type, 'http');
    assert.equal(D.classify('FTP://x/y').type, 'http');
});

// --- classify: remote vs local .torrent, with query strings ---
test('classify remote .torrent stays http even with a query string', () => {
    assert.equal(D.classify('https://x/y.torrent?foo=bar').type, 'http');
});
test('classify local .torrent path (relative and absolute)', () => {
    assert.equal(D.classify('ubuntu.torrent').type, 'torrent');
    assert.equal(D.classify('/home/u/a.torrent').type, 'torrent');
});
test('classify local .torrent extension match is case-insensitive', () => {
    assert.equal(D.classify('A.TORRENT').type, 'torrent');
});

// --- classify: remote vs local .metalink/.meta4, query strings ---
test('classify remote metalink/meta4 (with and without query string)', () => {
    assert.equal(D.classify('https://x/y.metalink').type, 'metalink');
    assert.equal(D.classify('https://x/y.meta4').type, 'metalink');
    assert.equal(D.classify('https://x/y.metalink?foo=bar').type, 'metalink');
    assert.equal(D.classify('https://x/y.META4').type, 'metalink'); // case-insensitive
});
test('classify local metalink/meta4 path (no query-string support)', () => {
    assert.equal(D.classify('file.metalink').type, 'metalink');
    // local (non-URL) path with a trailing query string doesn't end in the
    // extension anymore, so it falls through to unknown -- unlike the remote case.
    assert.equal(D.classify('y.metalink?foo=bar').type, 'unknown');
});

// --- classify: unknown (plain text, empty, whitespace-only) ---
test('classify unknown for plain text, empty, and whitespace-only input', () => {
    assert.equal(D.classify('just some words').type, 'unknown');
    assert.equal(D.classify('').type, 'unknown');
    assert.equal(D.classify('   ').type, 'unknown');
    assert.equal(D.classify('').value, '');
    assert.equal(D.classify('   ').value, ''); // whitespace trimmed away entirely
});

// --- parseLines: blank lines, CRLF, whitespace, mixed types & order ---
test('parseLines handles CRLF line endings', () => {
    const r = D.parseLines('magnet:?a\r\nhttp://x/y');
    assert.equal(r.length, 2);
    assert.equal(r[0].type, 'magnet');
    assert.equal(r[1].type, 'http');
});
test('parseLines trims leading/trailing whitespace per line', () => {
    const r = D.parseLines('  magnet:?a  \n http://x/y ');
    assert.equal(r[0].raw, 'magnet:?a');
    assert.equal(r[1].raw, 'http://x/y');
});
test('parseLines preserves input order across mixed types', () => {
    const r = D.parseLines('magnet:?a\nhttp://b\nunknown text\nftp://c');
    assert.deepEqual(r.map(x => x.type), ['magnet', 'http', 'unknown', 'http']);
    assert.deepEqual(r.map(x => x.raw), ['magnet:?a', 'http://b', 'unknown text', 'ftp://c']);
});
test('parseLines on empty/whitespace-only input yields no entries', () => {
    assert.deepEqual(D.parseLines(''), []);
    assert.deepEqual(D.parseLines('   \n  \n'), []);
});

// --- dedupe: case sensitivity, preserves first, empty list ---
test('dedupe is case-sensitive', () => {
    const r = D.dedupe([{value:'A'},{value:'a'}]);
    assert.deepEqual(r.map(x => x.value), ['A', 'a']); // distinct, both kept
});
test('dedupe keeps the first occurrence, not later ones', () => {
    const r = D.dedupe([{value:'a', extra:1}, {value:'a', extra:2}]);
    assert.equal(r.length, 1);
    assert.equal(r[0].extra, 1);
});
test('dedupe on empty list', () => {
    assert.deepEqual(D.dedupe([]), []);
});
