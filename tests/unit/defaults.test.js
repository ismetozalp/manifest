'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const D = require('../../js/core/defaults.js');

test('defaults present', () => {
    assert.equal(D.DEFAULT_SETTINGS.limits.maxConcurrentDownloads, 5);
    assert.equal(D.DEFAULT_SETTINGS.limits.maxPeersPerTorrent, 55);
});
test('mergeSettings keeps new default fields and overrides given ones', () => {
    const m = D.mergeSettings({ limits: { maxConcurrentDownloads: 9 } });
    assert.equal(m.limits.maxConcurrentDownloads, 9);          // overridden
    assert.equal(m.limits.maxConnectionsPerServer, 16);        // default preserved
    assert.equal(m.pollIntervalMs, 1500);
});
test('mergeSettings does not mutate DEFAULT_SETTINGS', () => {
    D.mergeSettings({ limits: { maxConcurrentDownloads: 2 } });
    assert.equal(D.DEFAULT_SETTINGS.limits.maxConcurrentDownloads, 5);
});
test('theme defaults to system and merges', () => {
    assert.equal(D.DEFAULT_SETTINGS.theme, 'system');
    assert.equal(D.mergeSettings({ theme: 'aqua' }).theme, 'aqua');
});
test('toAria2GlobalOptions maps + clamps + formats speeds', () => {
    const o = D.toAria2GlobalOptions(D.mergeSettings({
        limits: { maxConnectionsPerServer: 99, downloadLimitKiB: 500, minSplitSizeMiB: 20 }
    }));
    assert.equal(o['max-connection-per-server'], '16');   // clamped
    assert.equal(o['max-overall-download-limit'], '500K');
    assert.equal(o['min-split-size'], '20M');
    assert.equal(o['bt-max-peers'], '55');
});
