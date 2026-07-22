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
