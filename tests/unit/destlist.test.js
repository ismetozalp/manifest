'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const R = require('../../js/core/destlist.js');

test('pushRecent dedupes and moves existing entry to front', () => {
    assert.deepEqual(R.pushRecent(['b', 'a'], 'a', 3), ['a', 'b']);
});

test('pushRecent caps at the given size', () => {
    assert.equal(R.pushRecent(['1', '2', '3'], '4', 3).length, 3);
    assert.deepEqual(R.pushRecent(['1', '2', '3'], '4', 3), ['4', '1', '2']);
});

test('pushRecent adds a brand new path to the front', () => {
    assert.deepEqual(R.pushRecent(['a'], 'b', 5), ['b', 'a']);
});

test('pushRecent handles an empty list', () => {
    assert.deepEqual(R.pushRecent([], 'a', 3), ['a']);
});

test('pushRecent does not mutate the input array', () => {
    const input = ['a', 'b'];
    R.pushRecent(input, 'c', 5);
    assert.deepEqual(input, ['a', 'b']);
});
