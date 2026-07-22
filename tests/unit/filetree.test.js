'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const T = require('../../js/core/filetree.js');

const FILES = [
    { index: '1', path: '/dl/Show S01/Sub/a.mkv', length: '100', completedLength: '0', selected: 'true' },
    { index: '2', path: '/dl/Show S01/Sub/b.mkv', length: '200', completedLength: '0', selected: 'false' },
    { index: '3', path: '/dl/Show S01/readme.txt', length: '10', completedLength: '10', selected: 'true' },
];

test('build strips common dir and nests folders', () => {
    const { nodes, base } = T.build(FILES);
    assert.equal(base, '/dl/Show S01/');
    // folders first: "Sub" folder then "readme.txt" file
    assert.equal(nodes[0].dir, true);
    assert.equal(nodes[0].name, 'Sub');
    assert.deepEqual(nodes[0].indices.sort(), [1, 2]);
    assert.equal(nodes[0].children.length, 2);
    assert.equal(nodes[1].dir, false);
    assert.equal(nodes[1].name, 'readme.txt');
    assert.equal(nodes[1].index, 3);
});

test('single-file torrent → one leaf, no folder', () => {
    const { nodes } = T.build([{ index: '1', path: '/dl/movie.mkv', length: '5', completedLength: '0', selected: 'true' }]);
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].dir, false);
    assert.equal(nodes[0].name, 'movie.mkv');
});

test('folderState tri-state', () => {
    const { nodes } = T.build(FILES);
    const sub = nodes[0];
    assert.equal(T.folderState(sub, new Set([1, 2])), 'all');
    assert.equal(T.folderState(sub, new Set([1])), 'some');
    assert.equal(T.folderState(sub, new Set()), 'none');
});

test('allIndices collects every leaf', () => {
    const { nodes } = T.build(FILES);
    assert.deepEqual(T.allIndices(nodes).sort(), [1, 2, 3]);
});

test('empty list is safe', () => {
    assert.deepEqual(T.build([]).nodes, []);
    assert.deepEqual(T.build(null).nodes, []);
});
