'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const E = require('../../js/core/rpcenvelope.js');

test('TOKEN', () => assert.equal(E.TOKEN('S'), 'token:S'));
test('call prepends secret token', () => {
    const o = E.call('aria2.remove', ['gid1'], 'S', 3);
    assert.deepEqual(o, { jsonrpc: '2.0', id: 3, method: 'aria2.remove', params: ['token:S', 'gid1'] });
});
test('call without secret omits token', () => {
    const o = E.call('aria2.getVersion', [], '', 1);
    assert.deepEqual(o.params, []);
});
test('multicall wraps methodName + token', () => {
    const o = E.multicall([{ method: 'aria2.tellActive', params: [['gid']] }], 'S');
    assert.equal(o.method, 'system.multicall');
    assert.deepEqual(o.params[0][0], { methodName: 'aria2.tellActive', params: ['token:S', ['gid']] });
});

// ---------------------------------------------------------------------------
// TOKEN
// ---------------------------------------------------------------------------

test('TOKEN formats arbitrary secrets, including empty string and numeric coercion', () => {
    assert.equal(E.TOKEN('abc'), 'token:abc');
    assert.equal(E.TOKEN(''), 'token:');
    assert.equal(E.TOKEN(123), 'token:123');
});

// ---------------------------------------------------------------------------
// call: secret handling
// ---------------------------------------------------------------------------

test('call: secret prepends exactly one token, ahead of existing params', () => {
    const o = E.call('aria2.addUri', [['http://x']], 'sek', 7);
    assert.deepEqual(o.params, ['token:sek', ['http://x']]);
});

test('call: falsy secrets (undefined, null, "", 0, false) all omit the token', () => {
    [undefined, null, '', 0, false].forEach((secret) => {
        const o = E.call('aria2.getVersion', ['a'], secret, 1);
        assert.deepEqual(o.params, ['a'], `secret=${JSON.stringify(secret)}`);
    });
});

test('call: params defaults to [] when omitted entirely', () => {
    const withSecret = E.call('aria2.getVersion', undefined, 'S', 1);
    assert.deepEqual(withSecret.params, ['token:S']);
    const withoutSecret = E.call('aria2.getVersion', undefined, '', 2);
    assert.deepEqual(withoutSecret.params, []);
});

test('call: original params array is not mutated by the secret-prefixing path', () => {
    const original = ['gidA', 'gidB'];
    const o = E.call('aria2.remove', original, 'S', 9);
    assert.deepEqual(original, ['gidA', 'gidB']); // untouched
    assert.notEqual(o.params, original); // fresh array
    o.params.push('mutated');
    assert.deepEqual(original, ['gidA', 'gidB']); // still untouched after mutating the result
});

test('call: original params array is copied (not the same reference) even without a secret', () => {
    const original = ['x', 'y'];
    const o = E.call('aria2.remove', original, '', 10);
    assert.deepEqual(o.params, original);
    assert.notEqual(o.params, original); // .slice() copy, not the same array
    o.params.push('z');
    assert.deepEqual(original, ['x', 'y']); // original still untouched
});

// ---------------------------------------------------------------------------
// call: id handling
// ---------------------------------------------------------------------------

test('call: explicit id of 0 is honored (0 is not treated as null/absent)', () => {
    const o = E.call('aria2.tellStatus', ['gid'], 'S', 0);
    assert.equal(o.id, 0);
});

test('call: explicit negative id is honored as-is', () => {
    const o = E.call('aria2.tellStatus', [], '', -5);
    assert.equal(o.id, -5);
});

test('call: omitted id auto-increments the shared module counter, monotonically', () => {
    const a = E.call('aria2.getVersion', [], '');
    const b = E.call('aria2.getVersion', [], '');
    assert.equal(typeof a.id, 'number');
    assert.equal(typeof b.id, 'number');
    assert.equal(b.id, a.id + 1);
});

test('call: explicit id=null also triggers auto-increment (same as omitted)', () => {
    const a = E.call('aria2.getVersion', [], '');
    const b = E.call('aria2.getVersion', [], '', null);
    assert.equal(b.id, a.id + 1);
});

test('call: jsonrpc version is always the literal string "2.0"', () => {
    assert.equal(E.call('any.method', [], '', 1).jsonrpc, '2.0');
});

test('call: method name is preserved verbatim, including unusual method strings', () => {
    assert.equal(E.call('aria2.forceRemove', [], '', 1).method, 'aria2.forceRemove');
    assert.equal(E.call('', [], '', 1).method, '');
});

// ---------------------------------------------------------------------------
// multicall
// ---------------------------------------------------------------------------

test('multicall: multiple calls each get their own methodName + independently token-prefixed params', () => {
    const o = E.multicall([
        { method: 'aria2.pause', params: ['gid1'] },
        { method: 'aria2.unpause', params: ['gid2'] },
        { method: 'aria2.remove', params: ['gid3'] }
    ], 'topsecret');
    assert.equal(o.jsonrpc, '2.0');
    assert.equal(o.method, 'system.multicall');
    assert.equal(o.params.length, 1); // single outer array wrapping the list
    assert.deepEqual(o.params[0], [
        { methodName: 'aria2.pause', params: ['token:topsecret', 'gid1'] },
        { methodName: 'aria2.unpause', params: ['token:topsecret', 'gid2'] },
        { methodName: 'aria2.remove', params: ['token:topsecret', 'gid3'] }
    ]);
});

test('multicall: empty calls list produces an empty inner array but a valid envelope', () => {
    const o = E.multicall([], 'S');
    assert.equal(o.method, 'system.multicall');
    assert.deepEqual(o.params, [[]]);
    assert.equal(typeof o.id, 'number');
});

test('multicall: omitted calls argument defaults to an empty list', () => {
    const o = E.multicall(undefined, 'S');
    assert.deepEqual(o.params, [[]]);
});

test('multicall: no secret means no token is prepended to any inner call params', () => {
    const o = E.multicall([
        { method: 'aria2.tellActive', params: [] },
        { method: 'aria2.tellWaiting', params: [0, 10] }
    ], '');
    assert.deepEqual(o.params[0], [
        { methodName: 'aria2.tellActive', params: [] },
        { methodName: 'aria2.tellWaiting', params: [0, 10] }
    ]);
});

test('multicall: falsy secret (undefined) also omits the token', () => {
    const o = E.multicall([{ method: 'aria2.tellActive', params: ['x'] }], undefined);
    assert.deepEqual(o.params[0][0], { methodName: 'aria2.tellActive', params: ['x'] });
});

test('multicall: id auto-increments across successive calls, distinct from call()\'s own ids', () => {
    const a = E.multicall([], 'S');
    const b = E.multicall([], 'S');
    assert.equal(b.id, a.id + 1);
});

test('multicall: original inner params arrays are not mutated', () => {
    const gidParams = ['gidX'];
    E.multicall([{ method: 'aria2.remove', params: gidParams }], 'S');
    assert.deepEqual(gidParams, ['gidX']);
});

test('multicall: each inner call entry omits an "id" or "jsonrpc" field (only methodName + params)', () => {
    const o = E.multicall([{ method: 'aria2.pause', params: [] }], 'S');
    assert.deepEqual(Object.keys(o.params[0][0]).sort(), ['methodName', 'params']);
});
