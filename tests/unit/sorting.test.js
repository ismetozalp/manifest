'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const S = require('../../js/core/sorting.js');

test('nextSort: new key → asc; same key flips; back to asc', () => {
    assert.deepEqual(S.nextSort(null, 'name'), { key: 'name', dir: 'asc' });
    assert.deepEqual(S.nextSort({ key: 'name', dir: 'asc' }, 'name'), { key: 'name', dir: 'desc' });
    assert.deepEqual(S.nextSort({ key: 'name', dir: 'desc' }, 'name'), { key: 'name', dir: 'asc' });
    assert.deepEqual(S.nextSort({ key: 'name', dir: 'desc' }, 'size'), { key: 'size', dir: 'asc' });
});

const keyFns = { n: (x) => x.n, s: (x) => x.s };

test('sortRows: ascending and descending by a numeric key', () => {
    const rows = [{ n: 3 }, { n: 1 }, { n: 2 }];
    assert.deepEqual(S.sortRows(rows, { key: 'n', dir: 'asc' }, keyFns).map((r) => r.n), [1, 2, 3]);
    assert.deepEqual(S.sortRows(rows, { key: 'n', dir: 'desc' }, keyFns).map((r) => r.n), [3, 2, 1]);
});

test('sortRows: stable — equal keys keep original order', () => {
    const rows = [{ n: 1, id: 'a' }, { n: 1, id: 'b' }, { n: 0, id: 'c' }, { n: 1, id: 'd' }];
    assert.deepEqual(S.sortRows(rows, { key: 'n', dir: 'asc' }, keyFns).map((r) => r.id), ['c', 'a', 'b', 'd']);
    // descending is also stable among equals (a,b,d keep order)
    assert.deepEqual(S.sortRows(rows, { key: 'n', dir: 'desc' }, keyFns).map((r) => r.id), ['a', 'b', 'd', 'c']);
});

test('sortRows: does not mutate the input array', () => {
    const rows = [{ n: 2 }, { n: 1 }];
    const copy = rows.slice();
    S.sortRows(rows, { key: 'n', dir: 'asc' }, keyFns);
    assert.deepEqual(rows, copy);
});

test('sortRows: no/unknown state or non-array → original order / empty', () => {
    const rows = [{ n: 2 }, { n: 1 }];
    assert.deepEqual(S.sortRows(rows, null, keyFns).map((r) => r.n), [2, 1]);
    assert.deepEqual(S.sortRows(rows, { key: 'zzz', dir: 'asc' }, keyFns).map((r) => r.n), [2, 1]);
    assert.deepEqual(S.sortRows(rows, { key: 'n', dir: 'asc' }, null), [{ n: 2 }, { n: 1 }]);
    assert.deepEqual(S.sortRows(null, { key: 'n', dir: 'asc' }, keyFns), []);
});

test('sortRows: string key sorts lexically', () => {
    const rows = [{ s: 'banana' }, { s: 'apple' }, { s: 'cherry' }];
    assert.deepEqual(S.sortRows(rows, { key: 's', dir: 'asc' }, keyFns).map((r) => r.s), ['apple', 'banana', 'cherry']);
});

test('indicator: arrow only for the active column/direction', () => {
    assert.equal(S.indicator({ key: 'n', dir: 'asc' }, 'n'), ' ▲');
    assert.equal(S.indicator({ key: 'n', dir: 'desc' }, 'n'), ' ▼');
    assert.equal(S.indicator({ key: 'n', dir: 'asc' }, 's'), '');
    assert.equal(S.indicator(null, 'n'), '');
});
