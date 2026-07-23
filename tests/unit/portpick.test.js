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

// --- RANGE constant ---------------------------------------------------

test('RANGE has expected default lo/hi', () => {
    assert.deepEqual(P.RANGE, { lo: 16800, hi: 26800 });
});

// --- listeningPorts: header handling -----------------------------------

test('listeningPorts ignores the ss header line', () => {
    const s = P.listeningPorts('State  Recv-Q Send-Q Local Address:Port  Peer Address:Port');
    assert.equal(s.size, 0);
});

test('listeningPorts ignores header even with leading whitespace', () => {
    const s = P.listeningPorts('   State  Recv-Q Send-Q Local Address:Port  Peer Address:Port\nLISTEN 0 128 127.0.0.1:5000 0.0.0.0:*');
    assert.deepEqual([...s], [5000]);
});

// --- listeningPorts: address form variants -----------------------------

test('listeningPorts parses 127.0.0.1:PORT', () => {
    const s = P.listeningPorts('LISTEN 0 128 127.0.0.1:16800 0.0.0.0:*');
    assert.deepEqual([...s], [16800]);
});

test('listeningPorts parses 0.0.0.0:PORT', () => {
    const s = P.listeningPorts('LISTEN 0 128 0.0.0.0:22 0.0.0.0:*');
    assert.deepEqual([...s], [22]);
});

test('listeningPorts parses [::]:PORT (IPv6 wildcard)', () => {
    const s = P.listeningPorts('LISTEN 0 128 [::]:9090 [::]:*');
    assert.deepEqual([...s], [9090]);
});

test('listeningPorts parses [::1]:PORT (IPv6 loopback)', () => {
    const s = P.listeningPorts('LISTEN 0 128 [::1]:8081 [::1]:*');
    assert.deepEqual([...s], [8081]);
});

test('listeningPorts parses *:PORT', () => {
    const s = P.listeningPorts('LISTEN 0 128 *:6800 *:*');
    assert.deepEqual([...s], [6800]);
});

test('listeningPorts handles extra columns and irregular whitespace/tabs', () => {
    // Local Address:Port stays at column index 3 even with irregular
    // whitespace and trailing process-info columns appended by `ss -ltnp`.
    const line = 'LISTEN\t0    128\t\t  0.0.0.0:5000   0.0.0.0:*   users:(("proc",pid=1,fd=3))';
    const s = P.listeningPorts(line);
    assert.deepEqual([...s], [5000]);
});

test('listeningPorts dedupes repeated ports across lines', () => {
    const dump = 'LISTEN 0 128 0.0.0.0:5000 0.0.0.0:*\nLISTEN 0 128 [::]:5000 [::]:*';
    const s = P.listeningPorts(dump);
    assert.deepEqual([...s], [5000]);
});

// --- listeningPorts: empty / malformed input ----------------------------

test('listeningPorts returns empty set for empty string', () => {
    const s = P.listeningPorts('');
    assert.equal(s.size, 0);
});

test('listeningPorts returns empty set for undefined/null input', () => {
    assert.equal(P.listeningPorts(undefined).size, 0);
    assert.equal(P.listeningPorts(null).size, 0);
});

test('listeningPorts ignores malformed lines: too few columns, no colon, non-numeric port', () => {
    const malformed = [
        'garbage',
        'LISTEN 0 128',
        'LISTEN 0 128 badcolumn nopeer',
        'LISTEN 0 128 127.0.0.1 0.0.0.0:*',
        'LISTEN 0 128 127.0.0.1:abc 0.0.0.0:*',
        '',
        'LISTEN 0 128 127.0.0.1:9999 0.0.0.0:*'
    ].join('\n');
    const s = P.listeningPorts(malformed);
    assert.deepEqual([...s], [9999]);
});

// --- firstFree ------------------------------------------------------------

test('firstFree finds the first gap in a range with scattered taken ports', () => {
    const ss = [
        'LISTEN 0 128 127.0.0.1:16800 0.0.0.0:*',
        'LISTEN 0 128 127.0.0.1:16801 0.0.0.0:*',
        'LISTEN 0 128 127.0.0.1:16803 0.0.0.0:*'
    ].join('\n');
    assert.equal(P.firstFree(ss, 16800, 16805), 16802);
});

test('firstFree returns null when lo > hi', () => {
    assert.equal(P.firstFree('', 100, 50), null);
});

test('firstFree with single-port range: taken -> null', () => {
    const ss = 'LISTEN 0 128 127.0.0.1:16800 0.0.0.0:*';
    assert.equal(P.firstFree(ss, 16800, 16800), null);
});

test('firstFree with single-port range: free -> that port', () => {
    const ss = 'LISTEN 0 128 127.0.0.1:16801 0.0.0.0:*';
    assert.equal(P.firstFree(ss, 16800, 16800), 16800);
});

test('firstFree over RANGE defaults returns lo when nothing is listening', () => {
    assert.equal(P.firstFree('', P.RANGE.lo, P.RANGE.hi), P.RANGE.lo);
});

test('firstFree realistic multi-line ss dump with header, IPv4/IPv6/wildcard mix', () => {
    const dump = [
        'State  Recv-Q Send-Q  Local Address:Port    Peer Address:Port',
        'LISTEN 0      128            0.0.0.0:22          0.0.0.0:*',
        'LISTEN 0      128          127.0.0.1:16800        0.0.0.0:*',
        'LISTEN 0      128               [::]:16801             [::]:*',
        'LISTEN 0      128              [::1]:16802             [::1]:*',
        'LISTEN 0      128                *:16804                *:*'
    ].join('\n');
    // 16800,16801,16802 taken; 16803 free (gap); 16804 taken
    assert.equal(P.firstFree(dump, 16800, 16806), 16803);
    const taken = P.listeningPorts(dump);
    assert.deepEqual([...taken].sort((a, b) => a - b), [22, 16800, 16801, 16802, 16804]);
});
