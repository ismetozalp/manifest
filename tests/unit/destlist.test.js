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

test('pushRecent: item already at the front is a no-op reorder', () => {
    assert.deepEqual(R.pushRecent(['a', 'b', 'c'], 'a', 5), ['a', 'b', 'c']);
});

test('pushRecent: re-adding an existing non-front entry moves it to front without dropping others', () => {
    assert.deepEqual(R.pushRecent(['x', 'a', 'y'], 'a', 5), ['a', 'x', 'y']);
});

test('pushRecent: cap boundary — list already at cap, new distinct entry evicts the oldest', () => {
    assert.deepEqual(R.pushRecent(['a', 'b', 'c'], 'd', 3), ['d', 'a', 'b']);
});

test('pushRecent: cap === list length after re-adding an existing entry keeps the same set, reordered', () => {
    assert.deepEqual(R.pushRecent(['a', 'b', 'c'], 'b', 3), ['b', 'a', 'c']);
});

test('pushRecent: cap of 0 is falsy, so per Number(cap)||0 the list is NOT capped (cap>0 is false)', () => {
    // NOTE: this may be a surprising edge case — a caller passing cap=0 probably
    // expects zero items kept, but `cap > 0 ? slice(...) : next` treats 0 like
    // "no cap requested" and returns the full uncapped list. Asserting actual behavior.
    assert.deepEqual(R.pushRecent(['a', 'b'], 'c', 0), ['c', 'a', 'b']);
});

test('pushRecent: non-numeric cap coerces to 0 via Number(cap)||0 → uncapped, same as cap=0', () => {
    assert.deepEqual(R.pushRecent(['a', 'b'], 'c', 'not-a-number'), ['c', 'a', 'b']);
});

test('pushRecent: negative cap is truthy (not 0/NaN) but still fails the cap>0 check → uncapped', () => {
    assert.deepEqual(R.pushRecent(['a', 'b'], 'c', -1), ['c', 'a', 'b']);
});

test('pushRecent: null/undefined path is pushed like any other value and dedupes against itself', () => {
    assert.deepEqual(R.pushRecent(['a', null, 'b'], null, 5), [null, 'a', 'b']);
    assert.deepEqual(R.pushRecent(['a', 'b'], undefined, 5), [undefined, 'a', 'b']);
});

test('pushRecent: non-array list is treated as empty', () => {
    assert.deepEqual(R.pushRecent(null, 'a', 5), ['a']);
    assert.deepEqual(R.pushRecent(undefined, 'a', 5), ['a']);
});
