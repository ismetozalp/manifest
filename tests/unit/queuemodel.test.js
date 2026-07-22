'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const Q = require('../../js/core/queuemodel.js');

test('fromPaste dedupes + classifies', () => {
    const l = Q.fromPaste('magnet:?a\nmagnet:?a\nhttp://x/y\nnonsense');
    assert.equal(l.length, 3);
    assert.equal(l.find(i => i.type === 'unknown').raw, 'nonsense');
});
test('validate rejects unknown', () => {
    assert.equal(Q.validate({ type: 'unknown' }), false);
    assert.equal(Q.validate({ type: 'magnet' }), true);
});
test('addAll keeps existing, dedupes incoming', () => {
    const merged = Q.addAll([{value:'a'}], [{value:'a'},{value:'b'}]);
    assert.deepEqual(merged.map(i => i.value), ['a', 'b']);
});
test('serialize/deserialize round-trips; bad json → []', () => {
    const l = Q.fromPaste('http://x/y');
    assert.deepEqual(Q.deserialize(Q.serialize(l)).map(i => i.value), ['http://x/y']);
    assert.deepEqual(Q.deserialize('{bad'), []);
});
test('makeItem shape', () => {
    const it = Q.makeItem('magnet:?a');
    assert.equal(it.type, 'magnet');
    assert.equal(it.value, 'magnet:?a');
    assert.equal(it.raw, 'magnet:?a');
    assert.equal(it.status, 'staged');
    assert.equal(it.addedAt, null);
    assert.equal(it.id, 'magnet:magnet:?a');
});
test('removeById drops matching id', () => {
    const list = [{ id: 'a' }, { id: 'b' }];
    assert.deepEqual(Q.removeById(list, 'a').map(i => i.id), ['b']);
});
test('deserialize non-array json → []', () => {
    assert.deepEqual(Q.deserialize('{"a":1}'), []);
    assert.deepEqual(Q.deserialize(''), []);
    assert.deepEqual(Q.deserialize(null), []);
});
