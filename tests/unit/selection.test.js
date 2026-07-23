'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const S = require('../../js/core/selection.js');

const setOf = (...xs) => new Set(xs);

test('toggle: adds a missing id, removes a present one, returns a new Set', () => {
    const a = setOf('x');
    const added = S.toggle(a, 'y');
    assert.deepEqual([...added].sort(), ['x', 'y']);
    assert.notEqual(added, a);            // fresh reference
    assert.deepEqual([...a], ['x']);      // input untouched
    const removed = S.toggle(added, 'x');
    assert.deepEqual([...removed], ['y']);
});

test('add: unions ids in; already-present ids are no-ops; input not mutated', () => {
    const a = setOf('x');
    const out = S.add(a, ['x', 'y', 'z']);
    assert.deepEqual([...out].sort(), ['x', 'y', 'z']);
    assert.deepEqual([...a], ['x']);
    assert.deepEqual([...S.add(a, [])], ['x']);
    assert.deepEqual([...S.add(a, null)], ['x']);   // tolerant of null ids
});

test('remove: subtracts ids; absent ids are no-ops; input not mutated', () => {
    const a = setOf('x', 'y', 'z');
    const out = S.remove(a, ['y', 'nope']);
    assert.deepEqual([...out].sort(), ['x', 'z']);
    assert.deepEqual([...a].sort(), ['x', 'y', 'z']);
    assert.deepEqual([...S.remove(a, null)].sort(), ['x', 'y', 'z']);
});

test('allSelected: true only when non-empty and every id present', () => {
    const a = setOf('x', 'y');
    assert.equal(S.allSelected(a, ['x', 'y']), true);
    assert.equal(S.allSelected(a, ['x', 'y', 'z']), false); // z not selected
    assert.equal(S.allSelected(a, []), false);              // empty id list is never "all"
    assert.equal(S.allSelected(setOf(), []), false);
    assert.equal(S.allSelected(a, null), false);
});

test('anySelected: true when at least one id is selected', () => {
    const a = setOf('x');
    assert.equal(S.anySelected(a, ['x', 'y']), true);
    assert.equal(S.anySelected(a, ['y', 'z']), false);
    assert.equal(S.anySelected(a, []), false);
    assert.equal(S.anySelected(a, null), false);
});

test('indeterminate condition: some-but-not-all → any && !all', () => {
    const a = setOf('x');                 // one of two selected
    const ids = ['x', 'y'];
    const indeterminate = S.anySelected(a, ids) && !S.allSelected(a, ids);
    assert.equal(indeterminate, true);
    // none selected → not indeterminate
    assert.equal(S.anySelected(setOf(), ids) && !S.allSelected(setOf(), ids), false);
    // all selected → not indeterminate
    const all = setOf('x', 'y');
    assert.equal(S.anySelected(all, ids) && !S.allSelected(all, ids), false);
});

test('prune: keeps only ids still present; returns a new Set', () => {
    const a = setOf('x', 'y', 'z');
    const out = S.prune(a, ['x', 'z', 'w']);   // y gone, w irrelevant
    assert.deepEqual([...out].sort(), ['x', 'z']);
    assert.deepEqual([...a].sort(), ['x', 'y', 'z']);   // input untouched
    assert.deepEqual([...S.prune(a, [])], []);          // nothing present → empty
    assert.deepEqual([...S.prune(a, null)], []);
    assert.deepEqual([...S.prune(setOf(), ['x'])], []); // empty selection stays empty
});
