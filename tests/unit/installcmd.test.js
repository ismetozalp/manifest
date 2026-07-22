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
