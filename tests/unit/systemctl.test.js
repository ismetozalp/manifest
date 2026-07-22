'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const S = require('../../js/core/systemctl.js');

test('parseShow parses key=value lines into an object', () => {
    const text = 'ActiveState=active\nSubState=running\nLoadState=loaded\n';
    assert.deepEqual(S.parseShow(text), { ActiveState: 'active', SubState: 'running', LoadState: 'loaded' });
});

test('parseShow ignores blank lines and lines without =', () => {
    assert.deepEqual(S.parseShow('\nfoo\nActiveState=inactive\n'), { ActiveState: 'inactive' });
});

test('parseShow keeps everything after the first = as the value', () => {
    assert.deepEqual(S.parseShow('ExecStart=/bin/sh -c a=b'), { ExecStart: '/bin/sh -c a=b' });
});

test('isActive is true only when ActiveState is exactly "active"', () => {
    assert.equal(S.isActive({ ActiveState: 'active' }), true);
    assert.equal(S.isActive({ ActiveState: 'inactive' }), false);
    assert.equal(S.isActive({ ActiveState: 'activating' }), false);
    assert.equal(S.isActive(null), false);
    assert.equal(S.isActive(undefined), false);
});
