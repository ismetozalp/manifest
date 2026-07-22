'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

test('harness runs and can require a dual-exported module later', () => {
    assert.strictEqual(1 + 1, 2);
});
