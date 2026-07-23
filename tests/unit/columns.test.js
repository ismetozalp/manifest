'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const C = require('../../js/core/columns.js');

test('DEFAULT_WIDTHS: nine columns that sum to 100', () => {
    assert.equal(C.DEFAULT_WIDTHS.length, 9);
    assert.equal(C.COLUMN_COUNT, 9);
    const sum = C.DEFAULT_WIDTHS.reduce((a, b) => a + b, 0);
    assert.equal(sum, 100);
    assert.ok(C.DEFAULT_WIDTHS.every((x) => x >= C.MIN_PCT));
});

test('normalizeWidths: valid array passes through as a copy', () => {
    const w = [3, 23, 9, 18, 11, 11, 8, 9, 8];
    const out = C.normalizeWidths(w);
    assert.deepEqual(out, w);
    assert.notEqual(out, w); // fresh array, not the same reference
});

test('normalizeWidths: bad shapes fall back to defaults', () => {
    assert.deepEqual(C.normalizeWidths(null), C.DEFAULT_WIDTHS);
    assert.deepEqual(C.normalizeWidths(undefined), C.DEFAULT_WIDTHS);
    assert.deepEqual(C.normalizeWidths([1, 2, 3]), C.DEFAULT_WIDTHS);            // wrong length
    assert.deepEqual(C.normalizeWidths('nope'), C.DEFAULT_WIDTHS);              // not an array
    assert.deepEqual(C.normalizeWidths([3, 23, 9, 18, 11, 11, 8, 9, '8']), C.DEFAULT_WIDTHS); // non-numeric
    assert.deepEqual(C.normalizeWidths([3, 23, 9, 18, 11, 11, 8, 9, 0]), C.DEFAULT_WIDTHS);   // non-positive
    assert.deepEqual(C.normalizeWidths([3, 23, 9, 18, 11, 11, 8, 9, NaN]), C.DEFAULT_WIDTHS); // NaN
    assert.deepEqual(C.normalizeWidths([3, 23, 9, 18, 11, 11, 8, 9, Infinity]), C.DEFAULT_WIDTHS);
});

test('applyResize: positive delta grows col i, shrinks col i+1, pair sum preserved', () => {
    const w = [10, 20, 10, 10, 10, 10, 10, 10, 10];
    const out = C.applyResize(w, 0, 5);
    assert.equal(out[0], 15);
    assert.equal(out[1], 15);
    assert.equal(out[0] + out[1], w[0] + w[1]); // pair sum unchanged
    assert.deepEqual(out.slice(2), w.slice(2));  // other columns untouched
});

test('applyResize: negative delta shrinks col i, grows col i+1', () => {
    const out = C.applyResize([10, 20, 10, 10, 10, 10, 10, 10, 10], 0, -4);
    assert.equal(out[0], 6);
    assert.equal(out[1], 24);
});

test('applyResize: does not mutate the input array', () => {
    const w = [10, 20, 10, 10, 10, 10, 10, 10, 10];
    const copy = w.slice();
    C.applyResize(w, 0, 5);
    assert.deepEqual(w, copy);
});

test('applyResize: clamps so the shrinking (right) column never goes below MIN_PCT', () => {
    const out = C.applyResize([10, 5, 15, 10, 10, 10, 10, 10, 20], 1, 100); // huge grab from col 2
    assert.ok(out[2] >= C.MIN_PCT, `right col ${out[2]} < min`);
    assert.equal(out[1] + out[2], 5 + 15); // pair sum still preserved
});

test('applyResize: clamps so the shrinking (left) column never goes below MIN_PCT', () => {
    const out = C.applyResize([5, 15, 10, 10, 10, 10, 10, 10, 20], 0, -100); // drag left col to nothing
    assert.ok(out[0] >= C.MIN_PCT, `left col ${out[0]} < min`);
    assert.equal(out[0] + out[1], 5 + 15);
});

test('applyResize: a pair too small to satisfy both mins does not move', () => {
    // left+right = 4, both mins = 3 → impossible; leave as-is
    const out = C.applyResize([2, 2, 96, 10, 10, 10, 10, 10, 10].slice(0, 9), 0, 5, 3);
    assert.equal(out[0], 2);
    assert.equal(out[1], 2);
});

test('applyResize: last-boundary / out-of-range index is a no-op', () => {
    const w = [3, 23, 9, 18, 11, 11, 8, 9, 8];
    assert.deepEqual(C.applyResize(w, 8, 5), w);   // no column to the right of the last
    assert.deepEqual(C.applyResize(w, -1, 5), w);
    assert.deepEqual(C.applyResize(w, 99, 5), w);
});

test('applyResize: non-numeric delta is treated as zero', () => {
    const w = [10, 20, 10, 10, 10, 10, 10, 10, 10];
    assert.deepEqual(C.applyResize(w, 0, NaN), w);
    assert.deepEqual(C.applyResize(w, 0, undefined), w);
});

test('applyResize: fractional delta rounds to 2 decimals and keeps the pair sum', () => {
    const out = C.applyResize([10, 20, 10, 10, 10, 10, 10, 10, 10], 0, 3.333);
    assert.equal(out[0], 13.33);
    assert.equal(out[1], 16.67);
    assert.equal(out[0] + out[1], 30);
});
