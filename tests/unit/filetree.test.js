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

test('commonDirPrefix: various boundary cases', () => {
    assert.equal(T.commonDirPrefix(['/dl/T/a.txt', '/dl/T/sub/b.txt']), '/dl/T/');
    assert.equal(T.commonDirPrefix(['/dl/T/movie.mkv']), '/dl/T/'); // single path: dir of that one file
    assert.equal(T.commonDirPrefix(['/a/x.txt', '/b/y.txt']), '/'); // nothing beyond root shared
    // 'bb' vs 'b' must not be treated as sharing '/a/b' — only up to the last '/' boundary
    assert.equal(T.commonDirPrefix(['/a/bb/x.txt', '/a/b/y.txt']), '/a/');
    assert.equal(T.commonDirPrefix([]), '');
});

test('build: multi-file flat torrent (no subfolders), files sorted A→Z', () => {
    const { nodes, base } = T.build([
        { index: '1', path: '/dl/T/b.txt', length: '10', completedLength: '0', selected: 'true' },
        { index: '2', path: '/dl/T/a.txt', length: '20', completedLength: '0', selected: 'false' },
    ]);
    assert.equal(base, '/dl/T/');
    assert.deepEqual(nodes.map((n) => n.name), ['a.txt', 'b.txt']);
    assert.ok(nodes.every((n) => n.dir === false));
});

test('build: deeply nested folders (3+ levels) propagate indices up the chain', () => {
    const { nodes, base } = T.build([
        { index: '1', path: '/dl/T/a/b/c/one.txt', length: '1', completedLength: '0', selected: 'true' },
        { index: '2', path: '/dl/T/a/b/c/two.txt', length: '1', completedLength: '0', selected: 'false' },
        { index: '3', path: '/dl/T/root-other.txt', length: '1', completedLength: '0', selected: 'true' },
    ]);
    assert.equal(base, '/dl/T/');
    const a = nodes.find((n) => n.name === 'a');
    assert.equal(a.dir, true);
    assert.deepEqual(a.indices.sort(), [1, 2]);
    const b = a.children.find((n) => n.name === 'b');
    assert.deepEqual(b.indices.sort(), [1, 2]);
    const c = b.children.find((n) => n.name === 'c');
    assert.deepEqual(c.indices.sort(), [1, 2]);
    assert.equal(c.children.length, 2);
    assert.deepEqual(c.children.map((n) => n.name), ['one.txt', 'two.txt']);
    const rootOther = nodes.find((n) => n.name === 'root-other.txt');
    assert.equal(rootOther.dir, false);
    assert.equal(rootOther.index, 3);
});

test('build: folders sort before files at the same level, each group A→Z', () => {
    const { nodes } = T.build([
        { index: '1', path: '/dl/T/zeta.txt', length: '1', completedLength: '0', selected: 'true' },
        { index: '2', path: '/dl/T/Zsub/x.txt', length: '1', completedLength: '0', selected: 'true' },
        { index: '3', path: '/dl/T/alpha.txt', length: '1', completedLength: '0', selected: 'true' },
    ]);
    assert.deepEqual(nodes.map((n) => n.name), ['Zsub', 'alpha.txt', 'zeta.txt']);
    assert.equal(nodes[0].dir, true);
});

test('build: index/length/completed/selected are parsed from aria2\'s string fields', () => {
    const { nodes } = T.build([
        { index: '7', path: '/dl/T/f.bin', length: '12345', completedLength: '999', selected: 'false' },
    ]);
    const f = nodes[0];
    assert.equal(f.index, 7);
    assert.equal(f.length, 12345);
    assert.equal(f.completed, 999);
    assert.equal(f.selected, false);
});

test('build: empty/null/undefined input → {nodes:[], base:""}', () => {
    assert.deepEqual(T.build([]), { nodes: [], base: '' });
    assert.deepEqual(T.build(null), { nodes: [], base: '' });
    assert.deepEqual(T.build(undefined), { nodes: [], base: '' });
});

test('build: a file path equal to the common base falls back to a synthetic "file-<index>" name', () => {
    const { nodes } = T.build([
        { index: '1', path: '/dl/T/a.txt', length: '1', completedLength: '0', selected: 'true' },
        { index: '2', path: '/dl/T/', length: '0', completedLength: '0', selected: 'false' },
    ]);
    const names = nodes.map((n) => n.name).sort();
    assert.deepEqual(names, ['a.txt', 'file-2']);
});

test('folderState: nested folder tri-state reflects only its own subtree', () => {
    const { nodes } = T.build([
        { index: '1', path: '/dl/T/a/b/c/one.txt', length: '1', completedLength: '0', selected: 'true' },
        { index: '2', path: '/dl/T/a/b/c/two.txt', length: '1', completedLength: '0', selected: 'true' },
        { index: '3', path: '/dl/T/root-other.txt', length: '1', completedLength: '0', selected: 'true' },
    ]);
    const a = nodes.find((n) => n.name === 'a');
    const b = a.children.find((n) => n.name === 'b');
    const c = b.children.find((n) => n.name === 'c');
    assert.equal(T.folderState(c, new Set([1, 2])), 'all');
    assert.equal(T.folderState(c, new Set([1])), 'some');
    assert.equal(T.folderState(c, new Set()), 'none');
    assert.equal(T.folderState(b, new Set([1, 2])), 'all'); // rolls up through nested levels
    assert.equal(T.folderState(a, new Set([1])), 'some');
    assert.equal(T.folderState(a, new Set([1, 2])), 'all');
    assert.equal(T.folderState(a, new Set([3])), 'none'); // sibling leaf outside this subtree doesn't count
    assert.equal(T.folderState({ dir: false }, new Set([1])), 'none'); // non-folder node
    assert.equal(T.folderState(null, new Set()), 'none');
});

test('allIndices: whole forest, a single subtree, and a lone leaf', () => {
    const { nodes } = T.build([
        { index: '1', path: '/dl/T/a/b/c/one.txt', length: '1', completedLength: '0', selected: 'true' },
        { index: '2', path: '/dl/T/a/b/c/two.txt', length: '1', completedLength: '0', selected: 'true' },
        { index: '3', path: '/dl/T/root-other.txt', length: '1', completedLength: '0', selected: 'true' },
    ]);
    assert.deepEqual(T.allIndices(nodes).sort(), [1, 2, 3]);
    const a = nodes.find((n) => n.name === 'a');
    assert.deepEqual(T.allIndices(a).sort(), [1, 2]); // subtree given as a single node, not wrapped in an array
    const rootOther = nodes.find((n) => n.name === 'root-other.txt');
    assert.deepEqual(T.allIndices(rootOther), [3]); // single leaf
});
