'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const O = require('../../js/core/optdiff.js');

test('changedOptions: only differing keys, stringified', () => {
    const orig = { split: '5', 'max-connection-per-server': '4', dir: '/a' };
    const edited = { split: '8', 'max-connection-per-server': '4', dir: '/a' };
    assert.deepEqual(O.changedOptions(orig, edited), { split: '8' });
});

test('changedOptions: new key present in edited only is included', () => {
    assert.deepEqual(O.changedOptions({}, { 'bt-max-peers': '55' }), { 'bt-max-peers': '55' });
});

test('changedOptions: numeric vs string equal values are NOT changed', () => {
    assert.deepEqual(O.changedOptions({ split: 5 }, { split: '5' }), {});
});

test('changedOptions: empty-string value that differs IS sent (reset semantics)', () => {
    assert.deepEqual(O.changedOptions({ 'max-download-limit': '100K' }, { 'max-download-limit': '' }), { 'max-download-limit': '' });
});

test('changedOptions: nullish inputs are treated as empty', () => {
    assert.deepEqual(O.changedOptions(null, null), {});
    assert.deepEqual(O.changedOptions(undefined, { a: '1' }), { a: '1' });
});

test('buildOptions: keeps non-blank fields, drops blanks/undefined, stringifies', () => {
    const fields = [
        { key: 'split', value: 8 },
        { key: 'max-connection-per-server', value: '' },
        { key: 'dir', value: '   ' },
        { key: 'bt-max-peers', value: 60 },
        { key: '', value: 'x' },
        null,
    ];
    assert.deepEqual(O.buildOptions(fields), { split: '8', 'bt-max-peers': '60' });
});

test('buildOptions: empty/absent input → {}', () => {
    assert.deepEqual(O.buildOptions([]), {});
    assert.deepEqual(O.buildOptions(null), {});
});

test('speedLimit: 0/blank → "0", positive → "<n>K"', () => {
    assert.equal(O.speedLimit(0), '0');
    assert.equal(O.speedLimit(''), '0');
    assert.equal(O.speedLimit(-5), '0');
    assert.equal(O.speedLimit(500), '500K');
    assert.equal(O.speedLimit('1024'), '1024K');
});
