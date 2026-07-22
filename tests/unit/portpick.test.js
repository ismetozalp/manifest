'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const P = require('../../js/core/portpick.js');

const SS = `State  Recv-Q Send-Q Local Address:Port  Peer Address:Port
LISTEN 0      128    0.0.0.0:22         0.0.0.0:*
LISTEN 0      128    127.0.0.1:16800    0.0.0.0:*
LISTEN 0      128    [::]:9090          [::]:*
LISTEN 0      128    *:6800             *:*`;

test('listeningPorts parses all forms', () => {
    const s = P.listeningPorts(SS);
    assert.ok(s.has(22) && s.has(16800) && s.has(9090) && s.has(6800));
});
test('firstFree skips taken ports', () => {
    assert.equal(P.firstFree(SS, 16800, 16803), 16801);   // 16800 taken → 16801
});
test('firstFree returns null when all taken', () => {
    const full = 'LISTEN 0 0 127.0.0.1:16800 *:*\nLISTEN 0 0 127.0.0.1:16801 *:*';
    assert.equal(P.firstFree(full, 16800, 16801), null);
});
