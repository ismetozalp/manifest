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
