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
