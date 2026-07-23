'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const T = require('../../js/core/themes.js');
test('registry includes required themes with a base', () => {
    const ids = T.THEMES.map(t => t.id);
    for (const id of ['system','light','dark','aqua','nord','solarized','dracula']) assert.ok(ids.includes(id), id);
    for (const t of T.THEMES) if (t.id !== 'system') assert.ok(t.base === 'light' || t.base === 'dark', t.id);
});
test('isValid', () => { assert.ok(T.isValid('dark')); assert.ok(!T.isValid('nope')); });
test('resolve system follows prefersDark', () => {
    assert.deepEqual(T.resolve('system', true),  { attr:'dark',  base:'dark'  });
    assert.deepEqual(T.resolve('system', false), { attr:'light', base:'light' });
});
test('resolve custom maps to its attr + base', () => {
    assert.deepEqual(T.resolve('aqua', false), { attr:'aqua', base:'dark' });
});
test('resolve invalid falls back to system', () => {
    assert.deepEqual(T.resolve('bogus', true), { attr:'dark', base:'dark' });
});

test('registry includes every documented theme id exactly once, each with a valid base', () => {
    const expectedIds = ['system', 'light', 'dark', 'aqua', 'nord', 'solarized', 'dracula',
        'gruvbox', 'catppuccin', 'tokyonight', 'rosepine', 'sunset', 'sepia'];
    const ids = T.THEMES.map((t) => t.id);
    assert.deepEqual(ids.slice().sort(), expectedIds.slice().sort());
    assert.equal(new Set(ids).size, ids.length); // no duplicate ids
    for (const t of T.THEMES) {
        if (t.id === 'system') { assert.equal(t.base, null); continue; }
        assert.ok(t.base === 'light' || t.base === 'dark', t.id);
    }
});

test('sepia is a light-based theme', () => {
    const sepia = T.THEMES.find((t) => t.id === 'sepia');
    assert.equal(sepia.base, 'light');
});

test('isValid: true for every registered id, false for unknown/empty/case-mismatched/nullish ids', () => {
    for (const t of T.THEMES) assert.ok(T.isValid(t.id), t.id);
    assert.equal(T.isValid('nope'), false);
    assert.equal(T.isValid(''), false);
    assert.equal(T.isValid('Dark'), false); // case-sensitive
    assert.equal(T.isValid(undefined), false);
    assert.equal(T.isValid(null), false);
});

test('resolve: every custom (non-system) theme id maps to {attr:id, base:its own base}, ignoring prefersDark', () => {
    for (const t of T.THEMES) {
        if (t.id === 'system') continue;
        assert.deepEqual(T.resolve(t.id, true), { attr: t.id, base: t.base });
        assert.deepEqual(T.resolve(t.id, false), { attr: t.id, base: t.base });
    }
});

test('resolve: invalid/empty/nullish id falls back to system resolution for either prefersDark value', () => {
    assert.deepEqual(T.resolve('bogus', false), { attr: 'light', base: 'light' });
    assert.deepEqual(T.resolve('', true), { attr: 'dark', base: 'dark' });
    assert.deepEqual(T.resolve(undefined, true), { attr: 'dark', base: 'dark' });
});
