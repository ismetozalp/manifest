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

// --- parseShow: realistic systemctl --user show dumps -------------------

test('parseShow parses a realistic active-unit dump (ActiveState/SubState/LoadState + extras)', () => {
    const text = [
        'Type=simple',
        'LoadState=loaded',
        'ActiveState=active',
        'SubState=running',
        'Result=success',
        'ExecMainPID=12345',
        'FragmentPath=/home/u/.config/systemd/user/manifest.service'
    ].join('\n');
    const parsed = S.parseShow(text);
    assert.deepEqual(parsed, {
        Type: 'simple',
        LoadState: 'loaded',
        ActiveState: 'active',
        SubState: 'running',
        Result: 'success',
        ExecMainPID: '12345',
        FragmentPath: '/home/u/.config/systemd/user/manifest.service'
    });
    assert.equal(S.isActive(parsed), true);
});

test('parseShow parses an inactive-unit dump', () => {
    const text = 'LoadState=loaded\nActiveState=inactive\nSubState=dead\nResult=success';
    const parsed = S.parseShow(text);
    assert.equal(parsed.ActiveState, 'inactive');
    assert.equal(parsed.SubState, 'dead');
    assert.equal(S.isActive(parsed), false);
});

test('parseShow parses a failed-unit dump', () => {
    const text = 'LoadState=loaded\nActiveState=failed\nSubState=failed\nResult=exit-code\nExecMainStatus=1';
    const parsed = S.parseShow(text);
    assert.equal(parsed.ActiveState, 'failed');
    assert.equal(parsed.SubState, 'failed');
    assert.equal(parsed.ExecMainStatus, '1');
    assert.equal(S.isActive(parsed), false);
});

test('parseShow returns an empty object for empty input', () => {
    assert.deepEqual(S.parseShow(''), {});
    assert.deepEqual(S.parseShow(undefined), {});
    assert.deepEqual(S.parseShow(null), {});
});

test('parseShow preserves unrecognized/extra keys verbatim', () => {
    const parsed = S.parseShow('SomeFutureField=weird-value\nAnotherOne=123');
    assert.deepEqual(parsed, { SomeFutureField: 'weird-value', AnotherOne: '123' });
});

test('parseShow ignores malformed lines: no "=", empty key before "="', () => {
    const text = [
        'not-a-kv-line',
        '=value-with-no-key',
        '   =also-no-key',
        'ActiveState=active',
        '   ',
        ''
    ].join('\n');
    assert.deepEqual(S.parseShow(text), { ActiveState: 'active' });
});

test('parseShow trims whitespace around both key and value', () => {
    const parsed = S.parseShow('  ActiveState \t=\t active  \nSubState=  running\t');
    assert.deepEqual(parsed, { ActiveState: 'active', SubState: 'running' });
});

test('parseShow handles Windows-style CRLF line endings', () => {
    const parsed = S.parseShow('ActiveState=active\r\nSubState=running\r\nLoadState=loaded\r\n');
    assert.deepEqual(parsed, { ActiveState: 'active', SubState: 'running', LoadState: 'loaded' });
});

test('parseShow: later duplicate keys overwrite earlier ones', () => {
    const parsed = S.parseShow('ActiveState=activating\nActiveState=active');
    assert.deepEqual(parsed, { ActiveState: 'active' });
});

test('parseShow: value can itself be empty after "="', () => {
    const parsed = S.parseShow('Description=\nActiveState=active');
    assert.deepEqual(parsed, { Description: '', ActiveState: 'active' });
});

// --- isActive: additional edge cases -------------------------------------

test('isActive is case-sensitive on ActiveState', () => {
    assert.equal(S.isActive({ ActiveState: 'Active' }), false);
    assert.equal(S.isActive({ ActiveState: 'ACTIVE' }), false);
});

test('isActive is false when ActiveState is missing or unit object is falsy', () => {
    assert.equal(S.isActive({}), false);
    assert.equal(S.isActive({ SubState: 'running' }), false);
    assert.equal(S.isActive(0), false);
    assert.equal(S.isActive(''), false);
    assert.equal(S.isActive(false), false);
});

test('isActive works directly on parseShow output round-trip', () => {
    assert.equal(S.isActive(S.parseShow('ActiveState=active')), true);
    assert.equal(S.isActive(S.parseShow('ActiveState=failed')), false);
    assert.equal(S.isActive(S.parseShow('')), false);
});
