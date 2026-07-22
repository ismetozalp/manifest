'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const U = require('../../js/util.js');

test('humanSize', () => {
    assert.equal(U.humanSize(0), '0 B');
    assert.equal(U.humanSize(1024), '1.0 KiB');
    assert.equal(U.humanSize(1536), '1.5 KiB');
    assert.equal(U.humanSize(1048576), '1.0 MiB');
});
test('humanSpeed', () => {
    assert.equal(U.humanSpeed(0), '0 B/s');
    assert.equal(U.humanSpeed(1024), '1.0 KiB/s');
});
test('eta', () => {
    assert.equal(U.eta(0, 100), '∞');       // nothing remaining
    assert.equal(U.eta(100, 0), '∞');        // no speed
    assert.equal(U.eta(45, 1), '45s');
    assert.equal(U.eta(65, 1), '1m 05s');
    assert.equal(U.eta(7380, 1), '2h 03m');
});
test('percent', () => {
    assert.equal(U.percent(0, 0), 0);
    assert.equal(U.percent(1, 2), 50);
    assert.equal(U.percent(3, 2), 100);
});
test('shq', () => {
    assert.equal(U.shq('a b'), "'a b'");
    assert.equal(U.shq("a'b"), "'a'\\''b'");
});
test('paths', () => {
    assert.equal(U.joinPath('/a', 'b'), '/a/b');
    assert.equal(U.joinPath('/a/', 'b'), '/a/b');
    assert.equal(U.dirname('/a/b'), '/a');
    assert.equal(U.dirname('/a'), '/');
    assert.equal(U.basename('/a/b'), 'b');
});
test('stripDataUrl', () => {
    assert.equal(U.stripDataUrl('data:application/x-bittorrent;base64,QUJD'), 'QUJD');
    assert.equal(U.stripDataUrl('QUJD'), 'QUJD'); // already bare
});
test('selectFileCsv', () => {
    assert.equal(U.selectFileCsv(new Set([1, 3]), 5), '1,3');
    assert.equal(U.selectFileCsv(new Set(), 5), '');   // caller must prevent empty-submit
    assert.equal(U.selectFileCsv(new Set([3, 1, 2]), 5), '1,2,3'); // sorted ascending
    assert.equal(U.selectFileCsv(new Set([1, 1, 2]), 5), '1,2');   // Set already dedupes
});
