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
