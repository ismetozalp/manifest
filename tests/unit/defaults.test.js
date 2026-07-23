'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const D = require('../../js/core/defaults.js');

test('defaults present', () => {
    assert.equal(D.DEFAULT_SETTINGS.limits.maxConcurrentDownloads, 5);
    assert.equal(D.DEFAULT_SETTINGS.limits.maxPeersPerTorrent, 55);
    assert.equal(D.DEFAULT_SETTINGS.update.repo, 'ismetozalp/manifest');
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
test('columns: default widths present and merged; a valid saved layout round-trips', () => {
    assert.equal(D.DEFAULT_SETTINGS.columns.widths.length, 10);
    // empty settings → default widths
    assert.deepEqual(D.mergeSettings({}).columns.widths, D.DEFAULT_SETTINGS.columns.widths);
    // a user-resized layout persists verbatim
    const saved = [5, 3, 20, 8, 18, 12, 12, 6, 8, 8];
    assert.deepEqual(D.mergeSettings({ columns: { widths: saved } }).columns.widths, saved);
});
test('columns: a corrupt/old saved layout falls back to defaults (never breaks the table)', () => {
    assert.deepEqual(D.mergeSettings({ columns: { widths: [1, 2, 3] } }).columns.widths, D.DEFAULT_SETTINGS.columns.widths);
    assert.deepEqual(D.mergeSettings({ columns: { widths: 'bogus' } }).columns.widths, D.DEFAULT_SETTINGS.columns.widths);
    assert.deepEqual(D.mergeSettings({ columns: {} }).columns.widths, D.DEFAULT_SETTINGS.columns.widths);
    assert.deepEqual(D.mergeSettings({ columns: null }).columns.widths, D.DEFAULT_SETTINGS.columns.widths);
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

// ---------------------------------------------------------------------------
// mergeSettings: partial nested objects
// ---------------------------------------------------------------------------

test('mergeSettings with only limits provided keeps all other top-level sections default', () => {
    const m = D.mergeSettings({ limits: { seedRatio: 3.5 } });
    assert.equal(m.limits.seedRatio, 3.5);
    assert.equal(m.limits.maxConcurrentDownloads, 5);
    assert.deepEqual(m.rpc, { port: null, secret: null });
    assert.deepEqual(m.destinations, { default: null, bookmarks: [], recents: [] });
    assert.equal(m.pollIntervalMs, 1500);
    assert.deepEqual(m.update, { repo: 'ismetozalp/manifest', checkOnStartup: true });
    assert.equal(m.theme, 'system');
});

test('mergeSettings with only destinations provided keeps limits/rpc/update default', () => {
    const m = D.mergeSettings({ destinations: { default: '/mnt/dl' } });
    assert.equal(m.destinations.default, '/mnt/dl');
    assert.deepEqual(m.destinations.bookmarks, []);
    assert.deepEqual(m.destinations.recents, []);
    assert.deepEqual(m.limits, D.DEFAULT_SETTINGS.limits);
    assert.deepEqual(m.rpc, D.DEFAULT_SETTINGS.rpc);
    assert.deepEqual(m.update, D.DEFAULT_SETTINGS.update);
});

test('mergeSettings with only rpc provided fills only given rpc key', () => {
    const m = D.mergeSettings({ rpc: { port: 6800 } });
    assert.equal(m.rpc.port, 6800);
    assert.equal(m.rpc.secret, null); // preserved from default
    assert.deepEqual(m.limits, D.DEFAULT_SETTINGS.limits);
});

test('mergeSettings with only update provided keeps repo default, overrides checkOnStartup', () => {
    const m = D.mergeSettings({ update: { checkOnStartup: false } });
    assert.equal(m.update.repo, 'ismetozalp/manifest');
    assert.equal(m.update.checkOnStartup, false);
});

test('mergeSettings deeply partial: single limit key among many overridden individually', () => {
    ['maxConcurrentDownloads', 'maxConnectionsPerServer', 'splitPerDownload', 'minSplitSizeMiB',
        'maxPeersPerTorrent', 'downloadLimitKiB', 'uploadLimitKiB', 'seedRatio', 'seedTimeMin'
    ].forEach((key) => {
        const override = {};
        override[key] = 999;
        const m = D.mergeSettings({ limits: override });
        assert.equal(m.limits[key], 999, `expected ${key} to be overridden`);
        Object.keys(D.DEFAULT_SETTINGS.limits).forEach((otherKey) => {
            if (otherKey !== key) {
                assert.equal(m.limits[otherKey], D.DEFAULT_SETTINGS.limits[otherKey],
                    `expected ${otherKey} to remain default while overriding ${key}`);
            }
        });
    });
});

test('mergeSettings preserves unknown extra keys within nested objects', () => {
    const m = D.mergeSettings({ limits: { customKnob: 'x' }, update: { extra: true } });
    assert.equal(m.limits.customKnob, 'x');
    assert.equal(m.update.extra, true);
    // known defaults still present alongside the unknown key
    assert.equal(m.limits.maxConcurrentDownloads, 5);
    assert.equal(m.update.repo, 'ismetozalp/manifest');
});

test('mergeSettings drops unknown top-level keys (only known sections are copied out)', () => {
    const m = D.mergeSettings({ someRandomTopLevelThing: 'z', theme: 'dark' });
    assert.equal(m.theme, 'dark');
    assert.equal(m.someRandomTopLevelThing, undefined);
    assert.equal('someRandomTopLevelThing' in m, false);
});

test('mergeSettings with empty object returns full default-equivalent structure', () => {
    const m = D.mergeSettings({});
    assert.deepEqual(m, D.DEFAULT_SETTINGS);
    assert.notEqual(m, D.DEFAULT_SETTINGS); // must be a fresh object, not the same reference
    assert.notEqual(m.limits, D.DEFAULT_SETTINGS.limits);
    assert.notEqual(m.rpc, D.DEFAULT_SETTINGS.rpc);
    assert.notEqual(m.destinations, D.DEFAULT_SETTINGS.destinations);
    assert.notEqual(m.update, D.DEFAULT_SETTINGS.update);
});

test('mergeSettings with null input behaves like empty object', () => {
    const m = D.mergeSettings(null);
    assert.deepEqual(m, D.DEFAULT_SETTINGS);
});

test('mergeSettings with undefined input behaves like empty object', () => {
    const m = D.mergeSettings(undefined);
    assert.deepEqual(m, D.DEFAULT_SETTINGS);
});

test('mergeSettings called with no argument at all behaves like empty object', () => {
    const m = D.mergeSettings();
    assert.deepEqual(m, D.DEFAULT_SETTINGS);
});

test('mergeSettings treats empty-string theme as an explicit (non-null) override', () => {
    // theme uses `!= null`, so '' is NOT replaced by the default.
    const m = D.mergeSettings({ theme: '' });
    assert.equal(m.theme, '');
});

test('mergeSettings treats 0 as an explicit (non-null) pollIntervalMs override', () => {
    const m = D.mergeSettings({ pollIntervalMs: 0 });
    assert.equal(m.pollIntervalMs, 0);
});

test('mergeSettings does NOT mutate DEFAULT_SETTINGS across many varied merges', () => {
    const snapshot = JSON.parse(JSON.stringify(D.DEFAULT_SETTINGS));
    D.mergeSettings({ limits: { maxConcurrentDownloads: 2 } });
    D.mergeSettings({ destinations: { bookmarks: ['/a', '/b'], recents: ['/c'] } });
    D.mergeSettings({ rpc: { port: 6800, secret: 'abc' } });
    D.mergeSettings({ update: { repo: 'someone/fork', checkOnStartup: false } });
    D.mergeSettings({ theme: 'aqua', pollIntervalMs: 999 });
    D.mergeSettings(null);
    D.mergeSettings({});
    D.mergeSettings({ limits: { customKnob: 'z' } });
    assert.deepEqual(D.DEFAULT_SETTINGS, snapshot);
    // arrays on the shared default objects must still be their original (empty) instances
    assert.deepEqual(D.DEFAULT_SETTINGS.destinations.bookmarks, []);
    assert.deepEqual(D.DEFAULT_SETTINGS.destinations.recents, []);
});

test('mergeSettings replaces arrays wholesale rather than merging/concatenating them', () => {
    const m1 = D.mergeSettings({ destinations: { bookmarks: ['/one'] } });
    assert.deepEqual(m1.destinations.bookmarks, ['/one']);
    const m2 = D.mergeSettings({ destinations: { bookmarks: ['/two', '/three'] } });
    // m2 is NOT ['/one', '/two', '/three'] -- the whole array was replaced, independent of m1
    assert.deepEqual(m2.destinations.bookmarks, ['/two', '/three']);
    assert.deepEqual(m1.destinations.bookmarks, ['/one']); // m1 unaffected by later merge
});

test('mergeSettings recents array is likewise replaced wholesale, not merged', () => {
    const m1 = D.mergeSettings({ destinations: { recents: ['/x'] } });
    const m2 = D.mergeSettings({ destinations: { recents: ['/y', '/z'] } });
    assert.deepEqual(m1.destinations.recents, ['/x']);
    assert.deepEqual(m2.destinations.recents, ['/y', '/z']);
});

// ---------------------------------------------------------------------------
// toAria2GlobalOptions: exhaustive per-knob coverage
// ---------------------------------------------------------------------------

test('toAria2GlobalOptions: maxConcurrentDownloads is stringified without clamping', () => {
    const o = D.toAria2GlobalOptions(D.mergeSettings({ limits: { maxConcurrentDownloads: 123 } }));
    assert.equal(o['max-concurrent-downloads'], '123');
});

test('toAria2GlobalOptions: maxConnectionsPerServer clamps into [1,16] for every boundary case', () => {
    const cases = [
        [0, '1'],
        [-5, '1'],
        [1, '1'],
        [16, '16'],
        [99, '16']
    ];
    cases.forEach(([input, expected]) => {
        const o = D.toAria2GlobalOptions(D.mergeSettings({ limits: { maxConnectionsPerServer: input } }));
        assert.equal(o['max-connection-per-server'], expected, `input ${input}`);
    });
});

test('toAria2GlobalOptions: splitPerDownload is stringified as-is', () => {
    const o = D.toAria2GlobalOptions(D.mergeSettings({ limits: { splitPerDownload: 8 } }));
    assert.equal(o['split'], '8');
});

test('toAria2GlobalOptions: minSplitSizeMiB becomes "<n>M" (uppercase M, no clamp)', () => {
    assert.equal(D.toAria2GlobalOptions(D.mergeSettings({ limits: { minSplitSizeMiB: 20 } }))['min-split-size'], '20M');
    assert.equal(D.toAria2GlobalOptions(D.mergeSettings({ limits: { minSplitSizeMiB: 0 } }))['min-split-size'], '0M');
    assert.equal(D.toAria2GlobalOptions(D.mergeSettings({ limits: { minSplitSizeMiB: 1 } }))['min-split-size'], '1M');
});

test('toAria2GlobalOptions: maxPeersPerTorrent is stringified as-is', () => {
    const o = D.toAria2GlobalOptions(D.mergeSettings({ limits: { maxPeersPerTorrent: 200 } }));
    assert.equal(o['bt-max-peers'], '200');
});

test('toAria2GlobalOptions: downloadLimitKiB 0 means unlimited ("0"), >0 becomes "<n>K"', () => {
    assert.equal(D.toAria2GlobalOptions(D.mergeSettings({ limits: { downloadLimitKiB: 0 } }))['max-overall-download-limit'], '0');
    assert.equal(D.toAria2GlobalOptions(D.mergeSettings({ limits: { downloadLimitKiB: 500 } }))['max-overall-download-limit'], '500K');
    assert.equal(D.toAria2GlobalOptions(D.mergeSettings({ limits: { downloadLimitKiB: 1 } }))['max-overall-download-limit'], '1K');
    // negative values are truthy but <=0, so speedOpt still yields '0'
    assert.equal(D.toAria2GlobalOptions(D.mergeSettings({ limits: { downloadLimitKiB: -10 } }))['max-overall-download-limit'], '0');
});

test('toAria2GlobalOptions: uploadLimitKiB 0 means unlimited ("0"), >0 becomes "<n>K"', () => {
    assert.equal(D.toAria2GlobalOptions(D.mergeSettings({ limits: { uploadLimitKiB: 0 } }))['max-overall-upload-limit'], '0');
    assert.equal(D.toAria2GlobalOptions(D.mergeSettings({ limits: { uploadLimitKiB: 250 } }))['max-overall-upload-limit'], '250K');
    assert.equal(D.toAria2GlobalOptions(D.mergeSettings({ limits: { uploadLimitKiB: -1 } }))['max-overall-upload-limit'], '0');
});

test('toAria2GlobalOptions: seedRatio is stringified via Number->String coercion', () => {
    assert.equal(D.toAria2GlobalOptions(D.mergeSettings({ limits: { seedRatio: 1.0 } }))['seed-ratio'], '1');
    assert.equal(D.toAria2GlobalOptions(D.mergeSettings({ limits: { seedRatio: 2.5 } }))['seed-ratio'], '2.5');
    assert.equal(D.toAria2GlobalOptions(D.mergeSettings({ limits: { seedRatio: 0 } }))['seed-ratio'], '0');
});

test('toAria2GlobalOptions: seedTimeMin is stringified as-is, 0 means disabled', () => {
    assert.equal(D.toAria2GlobalOptions(D.mergeSettings({ limits: { seedTimeMin: 0 } }))['seed-time'], '0');
    assert.equal(D.toAria2GlobalOptions(D.mergeSettings({ limits: { seedTimeMin: 120 } }))['seed-time'], '120');
});

test('toAria2GlobalOptions falls back to DEFAULT_SETTINGS.limits when settings/limits missing', () => {
    const fromUndefined = D.toAria2GlobalOptions(undefined);
    const fromEmpty = D.toAria2GlobalOptions({});
    const expected = {
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
    assert.deepEqual(fromUndefined, expected);
    assert.deepEqual(fromEmpty, expected);
});

test('toAria2GlobalOptions produces exactly the nine documented keys', () => {
    const o = D.toAria2GlobalOptions(D.mergeSettings({}));
    assert.deepEqual(Object.keys(o).sort(), [
        'bt-max-peers', 'max-concurrent-downloads', 'max-connection-per-server',
        'max-overall-download-limit', 'max-overall-upload-limit', 'min-split-size',
        'seed-ratio', 'seed-time', 'split'
    ].sort());
});

test('theme default is "system" and survives round-trip through mergeSettings with no override', () => {
    assert.equal(D.mergeSettings({}).theme, 'system');
    assert.equal(D.mergeSettings(null).theme, 'system');
});
