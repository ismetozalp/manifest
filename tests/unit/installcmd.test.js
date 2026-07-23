'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const I = require('../../js/core/installcmd.js');

test('probes are binary-based and ordered', () => {
    assert.deepEqual(I.PROBES.map(p => p.bin), ['dnf', 'apt-get', 'pacman', 'zypper']);
});
test('dnf plan is EPEL-aware', () => {
    const steps = I.planFor('dnf');
    assert.deepEqual(steps[0], ['dnf', 'install', '-y', 'aria2']);
    assert.ok(steps.some(s => s.join(' ') === 'dnf install -y epel-release'));
});
test('apt plan updates then installs', () => {
    const steps = I.planFor('apt-get');
    assert.deepEqual(steps[0], ['apt-get', 'update']);
    assert.deepEqual(steps[1], ['apt-get', 'install', '-y', 'aria2']);
});
test('static fallback targets ~/.local/bin', () => {
    const p = I.staticFallbackPlan('/home/u');
    assert.equal(p.binPath, '/home/u/.local/bin/aria2c');
    assert.ok(Array.isArray(p.steps) && p.steps.length >= 1);
});

// --- PROBES -----------------------------------------------------------

test('PROBES full shape: manager/bin pairs in order', () => {
    assert.deepEqual(I.PROBES, [
        { manager: 'dnf', bin: 'dnf' },
        { manager: 'apt', bin: 'apt-get' },
        { manager: 'pacman', bin: 'pacman' },
        { manager: 'zypper', bin: 'zypper' }
    ]);
});

// --- STATIC_ARIA2_URL ---------------------------------------------------

test('STATIC_ARIA2_URL points at the pinned aria2 static build release', () => {
    assert.equal(
        I.STATIC_ARIA2_URL,
        'https://github.com/q3aql/aria2-static-builds/releases/latest/download/aria2-x86_64-linux-gnu-static.tar.gz'
    );
});

// --- planFor: full argv sequences per manager --------------------------

test('planFor(dnf) returns full 3-step EPEL-retry sequence', () => {
    assert.deepEqual(I.planFor('dnf'), [
        ['dnf', 'install', '-y', 'aria2'],
        ['dnf', 'install', '-y', 'epel-release'],
        ['dnf', 'install', '-y', 'aria2']
    ]);
});

test('planFor(apt-get) returns full update+install sequence', () => {
    assert.deepEqual(I.planFor('apt-get'), [
        ['apt-get', 'update'],
        ['apt-get', 'install', '-y', 'aria2']
    ]);
});

test('planFor(pacman) returns single -Sy --noconfirm step', () => {
    assert.deepEqual(I.planFor('pacman'), [
        ['pacman', '-Sy', '--noconfirm', 'aria2']
    ]);
});

test('planFor(zypper) returns single non-interactive install step', () => {
    assert.deepEqual(I.planFor('zypper'), [
        ['zypper', '--non-interactive', 'install', 'aria2']
    ]);
});

test('planFor unknown manager binary returns empty plan', () => {
    assert.deepEqual(I.planFor('yum'), []);
    assert.deepEqual(I.planFor('unknown-thing'), []);
});

test('planFor with empty/undefined/null input returns empty plan', () => {
    assert.deepEqual(I.planFor(''), []);
    assert.deepEqual(I.planFor(undefined), []);
    assert.deepEqual(I.planFor(null), []);
});

test('planFor is keyed by binary name, not manager label (apt manager label misses)', () => {
    // PROBES.manager for apt is 'apt' but planFor switches on the bin 'apt-get'.
    // Passing the manager label instead of the bin falls through to the default [].
    assert.deepEqual(I.planFor('apt'), []);
});

// --- staticFallbackPlan: full structure ---------------------------------

test('staticFallbackPlan full step sequence for a plain home dir', () => {
    const home = '/home/u';
    const p = I.staticFallbackPlan(home);
    const dir = '/home/u/.local/bin';
    const archivePath = dir + '/aria2-static.tar.gz';
    assert.equal(p.dir, dir);
    assert.equal(p.binPath, dir + '/aria2c');
    assert.deepEqual(p.steps, [
        ['mkdir', '-p', dir],
        ['curl', '-fsSL', '-o', archivePath, I.STATIC_ARIA2_URL],
        ['tar', '-xzf', archivePath, '-C', dir, '--strip-components=1'],
        ['chmod', '+x', dir + '/aria2c']
    ]);
});

test('staticFallbackPlan steps include curl download and chmod +x on the binary', () => {
    const p = I.staticFallbackPlan('/home/u');
    const curlStep = p.steps.find(s => s[0] === 'curl');
    const chmodStep = p.steps.find(s => s[0] === 'chmod');
    assert.ok(curlStep, 'expected a curl step');
    assert.ok(chmodStep, 'expected a chmod step');
    assert.deepEqual(chmodStep, ['chmod', '+x', p.binPath]);
    assert.equal(curlStep[curlStep.length - 1], I.STATIC_ARIA2_URL);
});

test('staticFallbackPlan with trailing slash in home does not normalize the double slash', () => {
    // Documents actual (naive string-concat) behavior: no path normalization,
    // so a trailing slash on `home` produces a doubled slash in dir/binPath.
    const p = I.staticFallbackPlan('/home/u/');
    assert.equal(p.dir, '/home/u//.local/bin');
    assert.equal(p.binPath, '/home/u//.local/bin/aria2c');
});

test('staticFallbackPlan with special characters (spaces, parens) in home', () => {
    const home = '/home/user name (test)';
    const p = I.staticFallbackPlan(home);
    assert.equal(p.dir, '/home/user name (test)/.local/bin');
    assert.equal(p.binPath, '/home/user name (test)/.local/bin/aria2c');
    assert.equal(p.steps[0][2], p.dir);
});

test('staticFallbackPlan with empty-string home', () => {
    const p = I.staticFallbackPlan('');
    assert.equal(p.dir, '/.local/bin');
    assert.equal(p.binPath, '/.local/bin/aria2c');
});
