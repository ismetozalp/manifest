'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const U = require('../../js/util.js');

test('humanSize', () => {
    assert.equal(U.humanSize(0), '0 B');
    assert.equal(U.humanSize(1024), '1.0 KiB');
    assert.equal(U.humanSize(1536), '1.5 KiB');
    assert.equal(U.humanSize(1048576), '1.0 MiB');
});
test('humanSpeed', () => {
    assert.equal(U.humanSpeed(0), '0 B/s');
    assert.equal(U.humanSpeed(1024), '1.0 KiB/s');
});
test('eta', () => {
    assert.equal(U.eta(0, 100), '∞');       // nothing remaining
    assert.equal(U.eta(100, 0), '∞');        // no speed
    assert.equal(U.eta(45, 1), '45s');
    assert.equal(U.eta(65, 1), '1m 05s');
    assert.equal(U.eta(7380, 1), '2h 03m');
});
test('percent', () => {
    assert.equal(U.percent(0, 0), 0);
    assert.equal(U.percent(1, 2), 50);
    assert.equal(U.percent(3, 2), 100);
});
test('shq', () => {
    assert.equal(U.shq('a b'), "'a b'");
    assert.equal(U.shq("a'b"), "'a'\\''b'");
});
test('paths', () => {
    assert.equal(U.joinPath('/a', 'b'), '/a/b');
    assert.equal(U.joinPath('/a/', 'b'), '/a/b');
    assert.equal(U.dirname('/a/b'), '/a');
    assert.equal(U.dirname('/a'), '/');
    assert.equal(U.basename('/a/b'), 'b');
});
test('stripDataUrl', () => {
    assert.equal(U.stripDataUrl('data:application/x-bittorrent;base64,QUJD'), 'QUJD');
    assert.equal(U.stripDataUrl('QUJD'), 'QUJD'); // already bare
});
test('semverGt', () => {
    assert.equal(U.semverGt('1.2.0', '1.1.9'), true);
    assert.equal(U.semverGt('1.10.0', '1.2.0'), true);
    assert.equal(U.semverGt('1.0.0', '1.0.0'), false);
    assert.equal(U.semverGt('1.0.0', '1.0.1'), false);
    assert.equal(U.semverGt('v1.2.0', 'v1.1.9'), true); // tolerates leading 'v'
});

test('selectFileCsv', () => {
    assert.equal(U.selectFileCsv(new Set([1, 3]), 5), '1,3');
    assert.equal(U.selectFileCsv(new Set(), 5), '');   // caller must prevent empty-submit
    assert.equal(U.selectFileCsv(new Set([3, 1, 2]), 5), '1,2,3'); // sorted ascending
    assert.equal(U.selectFileCsv(new Set([1, 1, 2]), 5), '1,2');   // Set already dedupes
});

// --- humanSize: unit boundaries, rounding, non-numeric ---
test('humanSize exact unit boundaries', () => {
    assert.equal(U.humanSize(1023), '1023 B');       // just under KiB threshold, no conversion
    assert.equal(U.humanSize(1024), '1.0 KiB');       // exact KiB
    assert.equal(U.humanSize(1024 ** 2), '1.0 MiB');  // exact MiB
    assert.equal(U.humanSize(1024 ** 3), '1.0 GiB');  // exact GiB
    assert.equal(U.humanSize(1024 ** 4), '1.0 TiB');  // exact TiB
});
test('humanSize zero, negative, huge, non-numeric', () => {
    assert.equal(U.humanSize(0), '0 B');
    assert.equal(U.humanSize(-5), '-5 B');            // negative < 1024 -> no unit conversion at all
    assert.equal(U.humanSize(-2000), '-2000 B');      // still just raw bytes, no negative-KiB handling
    // beyond PiB the unit stops advancing (no EiB in UNITS table) -> value keeps growing in PiB
    assert.equal(U.humanSize(1024 ** 6), '1024.0 PiB');
    assert.equal(U.humanSize('abc'), '0 B');          // Number('abc') -> NaN -> || 0
    assert.equal(U.humanSize(undefined), '0 B');
    assert.equal(U.humanSize(null), '0 B');
});
test('humanSize rounding to one decimal', () => {
    assert.equal(U.humanSize(1500), '1.5 KiB');
    assert.equal(U.humanSize(1536), '1.5 KiB');
});

// --- humanSpeed: thin wrapper over humanSize + '/s' ---
test('humanSpeed edge cases', () => {
    assert.equal(U.humanSpeed(0), '0 B/s');
    assert.equal(U.humanSpeed(1024), '1.0 KiB/s');
    assert.equal(U.humanSpeed(1024 ** 2), '1.0 MiB/s');
    assert.equal(U.humanSpeed(-5), '-5 B/s');
    assert.equal(U.humanSpeed('abc'), '0 B/s');
});

// --- eta: zero speed/remaining, negatives, sub-second, hours/days scale, NaN ---
test('eta zero and negative inputs return infinity symbol', () => {
    assert.equal(U.eta(0, 100), '∞');   // nothing left
    assert.equal(U.eta(100, 0), '∞');   // stalled
    assert.equal(U.eta(-5, 10), '∞');   // negative remaining treated as done/invalid
    assert.equal(U.eta(10, -5), '∞');   // negative speed treated as invalid
    assert.equal(U.eta(0, 0), '∞');
});
test('eta NaN inputs coerce to 0 and return infinity symbol', () => {
    assert.equal(U.eta(NaN, 10), '∞');
    assert.equal(U.eta(10, NaN), '∞');
    assert.equal(U.eta(NaN, NaN), '∞');
});
test('eta sub-second remaining rounds down to 0s (not infinity)', () => {
    assert.equal(U.eta(0.4, 1), '0s');
});
test('eta single-digit seconds are NOT zero-padded outside m/h branches', () => {
    assert.equal(U.eta(5, 1), '5s');
    assert.equal(U.eta(45, 1), '45s');
});
test('eta minutes branch pads seconds', () => {
    assert.equal(U.eta(65, 1), '1m 05s');
});
test('eta hours-scale', () => {
    assert.equal(U.eta(7200, 1), '2h 00m');  // exact hours, padded minutes
    assert.equal(U.eta(7380, 1), '2h 03m');
});
test('eta days-scale keeps accumulating hours (no day unit)', () => {
    assert.equal(U.eta(90000, 1), '25h 00m'); // 25 hours, well past a day
});

// --- percent: 0/0, done>total, negatives, NaN, floor ---
test('percent 0/0 and done greater than total', () => {
    assert.equal(U.percent(0, 0), 0);
    assert.equal(U.percent(3, 2), 100); // capped at 100
});
test('percent clamps a negative result to 0', () => {
    assert.equal(U.percent(-1, 10), 0);
    assert.equal(U.percent(-100, 10), 0);
});
test('percent negative or zero total returns 0', () => {
    assert.equal(U.percent(10, -5), 0);
    assert.equal(U.percent(10, 0), 0);
});
test('percent NaN inputs coerce via || 0', () => {
    assert.equal(U.percent(NaN, 10), 0);
    assert.equal(U.percent(10, NaN), 0);
});
test('percent floors fractional results', () => {
    assert.equal(U.percent(1, 3), 33);
});

// --- shq: spaces, quotes, empty, special shell chars, newlines ---
test('shq wraps plain and space-containing strings in single quotes', () => {
    assert.equal(U.shq('a b'), "'a b'");
    assert.equal(U.shq(''), "''");
});
test('shq escapes embedded single quotes', () => {
    assert.equal(U.shq("a'b"), "'a'\\''b'");
    assert.equal(U.shq("it's a 'test'"), "'it'\\''s a '\\''test'\\'''");
});
test('shq leaves $, `, backslash, newlines unescaped (safe inside single quotes)', () => {
    assert.equal(U.shq('$HOME `cmd` \\n'), "'$HOME `cmd` \\n'");
    assert.equal(U.shq('a\nb'), "'a\nb'");
});

// --- joinPath/dirname/basename: root, trailing slashes, no slash, nested, empty, dotfiles ---
test('joinPath with root base and empty base', () => {
    assert.equal(U.joinPath('/', 'b'), '/b');   // base already ends in '/' -> no double slash
    assert.equal(U.joinPath('', 'b'), '/b');    // empty base treated as having no trailing slash
});
test('joinPath with nested name containing a slash', () => {
    assert.equal(U.joinPath('/a', 'b/c'), '/a/b/c');
});
test('dirname of root and trailing slashes', () => {
    assert.equal(U.dirname('/'), '/');
    assert.equal(U.dirname('/a/b/'), '/a');
});
test('dirname with no slash, empty string, nested, dotfile', () => {
    assert.equal(U.dirname('a'), '/');
    assert.equal(U.dirname(''), '/');
    assert.equal(U.dirname('/a/b/c'), '/a/b');
    assert.equal(U.dirname('/a/.hidden'), '/a');
});
test('basename with root, trailing slash, no slash, empty, dotfile', () => {
    assert.equal(U.basename('/'), '');
    assert.equal(U.basename('/a/b/'), 'b');
    assert.equal(U.basename('/a'), 'a');
    assert.equal(U.basename('a'), 'a');
    assert.equal(U.basename(''), '');
    assert.equal(U.basename('/a/.hidden'), '.hidden');
});

// --- stripDataUrl: mime, base64 marker, bare, empty, multiple commas ---
test('stripDataUrl on empty string', () => {
    assert.equal(U.stripDataUrl(''), '');
});
test('stripDataUrl only strips up to the first comma', () => {
    assert.equal(U.stripDataUrl('data:text/plain,a,b,c'), 'a,b,c');
    assert.equal(U.stripDataUrl('data:text/plain,hello'), 'hello');
});
test('stripDataUrl with base64 marker and empty mime', () => {
    assert.equal(U.stripDataUrl('data:;base64,QUJD'), 'QUJD');
});
test('stripDataUrl leaves malformed data URL (no comma) unchanged', () => {
    assert.equal(U.stripDataUrl('data:text/plain'), 'data:text/plain');
});

// --- selectFileCsv: empty set, single, sorted, out-of-range, 1-based ---
test('selectFileCsv single index', () => {
    assert.equal(U.selectFileCsv(new Set([1]), 1), '1');
});
test('selectFileCsv excludes indices beyond total', () => {
    assert.equal(U.selectFileCsv(new Set([1, 5, 10]), 5), '1,5');
});
test('selectFileCsv is 1-based: index 0 is excluded', () => {
    assert.equal(U.selectFileCsv(new Set([0, 1, 2]), 5), '1,2');
});
test('selectFileCsv excludes non-integers and negatives', () => {
    assert.equal(U.selectFileCsv(new Set([1.5, 2]), 5), '2');
    assert.equal(U.selectFileCsv(new Set([-1, 1]), 5), '1');
});
test('selectFileCsv with total=0 rejects all indices (no valid files)', () => {
    assert.equal(U.selectFileCsv(new Set([1, 100]), 0), '');
});
test('selectFileCsv with an absent/NaN total stays lenient (no upper bound)', () => {
    assert.equal(U.selectFileCsv(new Set([1, 100]), undefined), '1,100');
    assert.equal(U.selectFileCsv(new Set([2, 5]), NaN), '2,5');
});

// --- semverGt: equal, patch/minor/major, 1.10 vs 1.2, lengths, leading zeros, non-numeric ---
test('semverGt equal versions', () => {
    assert.equal(U.semverGt('1.0.0', '1.0.0'), false);
});
test('semverGt patch/minor/major differences', () => {
    assert.equal(U.semverGt('1.0.1', '1.0.0'), true);
    assert.equal(U.semverGt('1.1.0', '1.0.9'), true);
    assert.equal(U.semverGt('2.0.0', '1.9.9'), true);
});
test('semverGt compares numerically, not lexically (1.10 > 1.2)', () => {
    assert.equal(U.semverGt('1.10.0', '1.2.0'), true);
    assert.equal(U.semverGt('1.2.0', '1.10.0'), false);
});
test('semverGt with different segment lengths pads missing with 0', () => {
    assert.equal(U.semverGt('1.2', '1.2.0'), false);
    assert.equal(U.semverGt('1.2.1', '1.2'), true);
});
test('semverGt tolerates leading zeros in segments', () => {
    assert.equal(U.semverGt('1.02.0', '1.1.9'), true); // '02' parses to 2
});
test('semverGt treats non-numeric segments as 0', () => {
    assert.equal(U.semverGt('1.abc.0', '1.0.0'), false); // 'abc' -> NaN -> 0, versions equal
    assert.equal(U.semverGt('1.x.5', '1.0.0'), true);    // 'x' -> 0, but segment 2 (5) wins
});
test('semverGt ignores pre-release/build suffixes after - or +', () => {
    assert.equal(U.semverGt('1.2.0-beta', '1.2.0'), false);
    assert.equal(U.semverGt('1.2.0+build5', '1.1.9'), true);
});
