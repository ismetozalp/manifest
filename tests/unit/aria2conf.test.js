'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const C = require('../../js/core/aria2conf.js');

const conf = C.confText({ home: '/home/u', port: 17123, secret: 'S3',
    dir: '/mnt/dl', limits: { 'max-concurrent-downloads': '5', 'bt-max-peers': '55' } });

test('conf has rpc + isolation + session + tuning', () => {
    assert.match(conf, /enable-rpc=true/);
    assert.match(conf, /rpc-listen-all=false/);
    assert.match(conf, /rpc-listen-port=17123/);
    assert.match(conf, /rpc-secret=S3/);
    assert.match(conf, /^dir=\/mnt\/dl$/m);
    assert.match(conf, /save-session=\/home\/u\/\.config\/cockpit\/manifest\/aria2\.session/);
    assert.match(conf, /input-file=\/home\/u\/\.config\/cockpit\/manifest\/aria2\.session/);
    assert.match(conf, /max-concurrent-downloads=5/);
    assert.match(conf, /bt-max-peers=55/);
});
test('unit runs aria2 with conf path as user service', () => {
    const u = C.unitText({ home: '/home/u', aria2Path: '/usr/bin/aria2c' });
    assert.match(u, /ExecStart=\/usr\/bin\/aria2c --conf-path=\/home\/u\/\.config\/cockpit\/manifest\/aria2\.conf/);
    assert.match(u, /WantedBy=default\.target/);
});

// ---------------------------------------------------------------------------
// confText: deeper coverage
// ---------------------------------------------------------------------------

test('confText: dir override is used verbatim and independent of home', () => {
    const c = C.confText({ home: '/home/u', port: 1, secret: 's', dir: '/totally/different/download-dir' });
    assert.match(c, /^dir=\/totally\/different\/download-dir$/m);
});

test('confText: session/input-file paths are always derived from home, never from dir', () => {
    const c = C.confText({ home: '/home/alice', port: 1, secret: 's', dir: '/mnt/somewhere-else' });
    assert.match(c, /^save-session=\/home\/alice\/\.config\/cockpit\/manifest\/aria2\.session$/m);
    assert.match(c, /^input-file=\/home\/alice\/\.config\/cockpit\/manifest\/aria2\.session$/m);
});

test('confText: numeric port is interpolated without quoting', () => {
    const c = C.confText({ home: '/h', port: 6800, secret: 's', dir: '/d' });
    assert.match(c, /^rpc-listen-port=6800$/m);
});

test('confText: secret is interpolated verbatim, including special characters', () => {
    const c = C.confText({ home: '/h', port: 1, secret: 'p@ss=word&123', dir: '/d' });
    assert.match(c, /^rpc-secret=p@ss=word&123$/m);
});

test('confText: fixed rpc/session/isolation lines are always present regardless of limits', () => {
    const c = C.confText({ home: '/h', port: 1, secret: 's', dir: '/d' }); // no limits key at all
    ['enable-rpc=true', 'rpc-listen-all=false', 'continue=true',
        'save-session-interval=30', 'rpc-save-upload-metadata=true',
        'bt-save-metadata=true', 'force-save=false'
    ].forEach((line) => {
        assert.ok(c.split('\n').includes(line), `expected line "${line}" to be present`);
    });
});

test('confText: empty limits object appends no extra lines beyond the fixed set', () => {
    const withEmptyLimits = C.confText({ home: '/h', port: 1, secret: 's', dir: '/d', limits: {} });
    const withNoLimitsKey = C.confText({ home: '/h', port: 1, secret: 's', dir: '/d' });
    assert.equal(withEmptyLimits, withNoLimitsKey);
    // exactly the 12 fixed config lines when no limits entries are present
    assert.equal(withEmptyLimits.split('\n').filter(Boolean).length, 12);
});

test('confText: limits map entries are emitted for every provided key, one per line', () => {
    const limits = {
        'max-concurrent-downloads': '5',
        'max-connection-per-server': '16',
        'split': '5',
        'min-split-size': '20M',
        'bt-max-peers': '55',
        'max-overall-download-limit': '0',
        'max-overall-upload-limit': '0',
        'seed-ratio': '1',
        'seed-time': '0'
    };
    const c = C.confText({ home: '/h', port: 1, secret: 's', dir: '/d', limits });
    Object.keys(limits).forEach((k) => {
        assert.match(c, new RegExp('^' + k + '=' + limits[k].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'm'));
    });
});

test('confText: limits key order in output matches Object.keys(limits) insertion order (deterministic)', () => {
    const limits = { zeta: '1', alpha: '2', mid: '3' };
    const c = C.confText({ home: '/h', port: 1, secret: 's', dir: '/d', limits });
    const lines = c.split('\n');
    const idxZeta = lines.indexOf('zeta=1');
    const idxAlpha = lines.indexOf('alpha=2');
    const idxMid = lines.indexOf('mid=3');
    assert.ok(idxZeta > -1 && idxAlpha > -1 && idxMid > -1);
    // Preserves insertion order, NOT alphabetical (zeta before alpha before mid)
    assert.ok(idxZeta < idxAlpha, 'zeta should come before alpha (insertion order)');
    assert.ok(idxAlpha < idxMid, 'alpha should come before mid (insertion order)');
});

test('confText: repeated calls with same limits object produce identical, stable key order', () => {
    const limits = { c: '3', a: '1', b: '2' };
    const first = C.confText({ home: '/h', port: 1, secret: 's', dir: '/d', limits });
    const second = C.confText({ home: '/h', port: 1, secret: 's', dir: '/d', limits });
    assert.equal(first, second);
});

test('confText: special characters (spaces, unicode) in home and dir pass through unescaped', () => {
    const c = C.confText({
        home: '/home/john doe', port: 1, secret: 's',
        dir: '/mnt/İndirilenler Klasörü'
    });
    assert.match(c, /^dir=\/mnt\/İndirilenler Klasörü$/m);
    assert.match(c, /^save-session=\/home\/john doe\/\.config\/cockpit\/manifest\/aria2\.session$/m);
    assert.match(c, /^input-file=\/home\/john doe\/\.config\/cockpit\/manifest\/aria2\.session$/m);
});

test('confText: trailing slash on home is not normalized (double slash appears verbatim)', () => {
    const c = C.confText({ home: '/home/u/', port: 1, secret: 's', dir: '/d' });
    assert.match(c, /^save-session=\/home\/u\/\/\.config\/cockpit\/manifest\/aria2\.session$/m);
});

test('confText: result always ends with a single trailing newline', () => {
    const c = C.confText({ home: '/h', port: 1, secret: 's', dir: '/d' });
    assert.ok(c.endsWith('\n'));
    assert.ok(!c.endsWith('\n\n'));
});

test('confText: called with no opts at all still produces a string with "undefined" placeholders', () => {
    const c = C.confText();
    assert.match(c, /^rpc-listen-port=undefined$/m);
    assert.match(c, /^rpc-secret=undefined$/m);
    assert.match(c, /^dir=undefined$/m);
    assert.match(c, /^save-session=undefined\/\.config\/cockpit\/manifest\/aria2\.session$/m);
    assert.match(c, /^input-file=undefined\/\.config\/cockpit\/manifest\/aria2\.session$/m);
});

test('confText: fixed section lines appear in the documented order', () => {
    const c = C.confText({ home: '/h', port: 1, secret: 's', dir: '/d' });
    const lines = c.split('\n');
    const order = ['enable-rpc=true', 'rpc-listen-all=false', 'rpc-listen-port=1', 'rpc-secret=s',
        'dir=/d', 'continue=true', 'save-session=/h/.config/cockpit/manifest/aria2.session',
        'input-file=/h/.config/cockpit/manifest/aria2.session', 'save-session-interval=30',
        'rpc-save-upload-metadata=true', 'bt-save-metadata=true', 'force-save=false'];
    let lastIdx = -1;
    order.forEach((line) => {
        const idx = lines.indexOf(line);
        assert.ok(idx > lastIdx, `expected "${line}" to appear in order`);
        lastIdx = idx;
    });
});

// ---------------------------------------------------------------------------
// unitText: deeper coverage
// ---------------------------------------------------------------------------

test('unitText: ExecStart interpolates a differing aria2Path exactly', () => {
    const u = C.unitText({ home: '/home/u', aria2Path: '/opt/custom/aria2c-bin' });
    assert.match(u, /^ExecStart=\/opt\/custom\/aria2c-bin --conf-path=\/home\/u\/\.config\/cockpit\/manifest\/aria2\.conf$/m);
});

test('unitText: Restart=on-failure is present verbatim', () => {
    const u = C.unitText({ home: '/home/u', aria2Path: '/usr/bin/aria2c' });
    assert.ok(u.split('\n').includes('Restart=on-failure'));
});

test('unitText: WantedBy=default.target is present verbatim under [Install]', () => {
    const u = C.unitText({ home: '/home/u', aria2Path: '/usr/bin/aria2c' });
    const lines = u.split('\n');
    const installIdx = lines.indexOf('[Install]');
    const wantedIdx = lines.indexOf('WantedBy=default.target');
    assert.ok(installIdx > -1 && wantedIdx > -1);
    assert.ok(wantedIdx > installIdx);
});

test('unitText: section headers and blank separators appear in the documented order', () => {
    const u = C.unitText({ home: '/home/u', aria2Path: '/usr/bin/aria2c' });
    const lines = u.split('\n');
    assert.deepEqual(lines, [
        '[Unit]',
        'Description=Manifest aria2 daemon',
        '',
        '[Service]',
        'ExecStart=/usr/bin/aria2c --conf-path=/home/u/.config/cockpit/manifest/aria2.conf',
        'Restart=on-failure',
        '',
        '[Install]',
        'WantedBy=default.target',
        '' // trailing newline produces a final empty element after split
    ]);
});

test('unitText: result always ends with a single trailing newline', () => {
    const u = C.unitText({ home: '/home/u', aria2Path: '/usr/bin/aria2c' });
    assert.ok(u.endsWith('\n'));
    assert.ok(!u.endsWith('\n\n'));
});

test('unitText: called with no opts at all still produces "undefined" placeholders', () => {
    const u = C.unitText();
    assert.match(u, /^ExecStart=undefined --conf-path=undefined\/\.config\/cockpit\/manifest\/aria2\.conf$/m);
});

test('unitText: special characters in home and aria2Path pass through unescaped', () => {
    const u = C.unitText({ home: '/home/john doe', aria2Path: '/opt/tools with spaces/aria2c' });
    assert.match(u, /^ExecStart=\/opt\/tools with spaces\/aria2c --conf-path=\/home\/john doe\/\.config\/cockpit\/manifest\/aria2\.conf$/m);
});
