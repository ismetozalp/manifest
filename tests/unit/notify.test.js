'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../../js/core/notify.js');

test('newlyFinished: fires when a download transitions active → complete', () => {
    const prev = { a: { status: 'active', name: 'A' } };
    const next = { a: { status: 'complete', name: 'A' } };
    assert.deepEqual(N.newlyFinished(prev, next), [{ gid: 'a', name: 'A', status: 'complete' }]);
});

test('newlyFinished: fires on active → error', () => {
    const prev = { a: { status: 'active', name: 'A' } };
    const next = { a: { status: 'error', name: 'A' } };
    assert.deepEqual(N.newlyFinished(prev, next), [{ gid: 'a', name: 'A', status: 'error' }]);
});

test('newlyFinished: does NOT fire for a gid unseen before (first sighting / reload)', () => {
    assert.deepEqual(N.newlyFinished({}, { a: { status: 'complete', name: 'A' } }), []);
});

test('newlyFinished: does NOT re-fire when already terminal', () => {
    const prev = { a: { status: 'complete', name: 'A' } };
    const next = { a: { status: 'complete', name: 'A' } };
    assert.deepEqual(N.newlyFinished(prev, next), []);
});

test('newlyFinished: still active → no fire', () => {
    assert.deepEqual(N.newlyFinished({ a: { status: 'active' } }, { a: { status: 'active' } }), []);
});

test('newlyFinished: multiple, only the transitioned ones; name falls back to gid', () => {
    const prev = { a: { status: 'active', name: 'A' }, b: { status: 'active' }, c: { status: 'complete' } };
    const next = { a: { status: 'complete', name: 'A' }, b: { status: 'active' }, c: { status: 'complete' } };
    assert.deepEqual(N.newlyFinished(prev, next), [{ gid: 'a', name: 'A', status: 'complete' }]);
    // name fallback
    const r = N.newlyFinished({ z: { status: 'active' } }, { z: { status: 'error' } });
    assert.deepEqual(r, [{ gid: 'z', name: 'z', status: 'error' }]);
});

test('snapshot: reduces to {gid:{status,name}} using nameOf', () => {
    const dls = { a: { status: 'active', totalLength: '9' }, b: { status: 'complete' } };
    const snap = N.snapshot(dls, (d) => (d.status === 'active' ? 'ACT' : null));
    assert.deepEqual(snap, { a: { status: 'active', name: 'ACT' }, b: { status: 'complete', name: 'b' } });
});

test('snapshot: empty/absent → {}', () => {
    assert.deepEqual(N.snapshot(null), {});
    assert.deepEqual(N.snapshot({}), {});
});
