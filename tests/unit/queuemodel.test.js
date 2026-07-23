'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const Q = require('../../js/core/queuemodel.js');

test('fromPaste dedupes + classifies', () => {
    const l = Q.fromPaste('magnet:?a\nmagnet:?a\nhttp://x/y\nnonsense');
    assert.equal(l.length, 3);
    assert.equal(l.find(i => i.type === 'unknown').raw, 'nonsense');
});
test('validate rejects unknown', () => {
    assert.equal(Q.validate({ type: 'unknown' }), false);
    assert.equal(Q.validate({ type: 'magnet' }), true);
});
test('addAll keeps existing, dedupes incoming', () => {
    const merged = Q.addAll([{value:'a'}], [{value:'a'},{value:'b'}]);
    assert.deepEqual(merged.map(i => i.value), ['a', 'b']);
});
test('serialize/deserialize round-trips; bad json → []', () => {
    const l = Q.fromPaste('http://x/y');
    assert.deepEqual(Q.deserialize(Q.serialize(l)).map(i => i.value), ['http://x/y']);
    assert.deepEqual(Q.deserialize('{bad'), []);
});
test('makeItem shape', () => {
    const it = Q.makeItem('magnet:?a');
    assert.equal(it.type, 'magnet');
    assert.equal(it.value, 'magnet:?a');
    assert.equal(it.raw, 'magnet:?a');
    assert.equal(it.status, 'staged');
    assert.equal(it.addedAt, null);
    assert.equal(it.id, 'magnet:magnet:?a');
});
test('removeById drops matching id', () => {
    const list = [{ id: 'a' }, { id: 'b' }];
    assert.deepEqual(Q.removeById(list, 'a').map(i => i.id), ['b']);
});
test('deserialize non-array json → []', () => {
    assert.deepEqual(Q.deserialize('{"a":1}'), []);
    assert.deepEqual(Q.deserialize(''), []);
    assert.deepEqual(Q.deserialize(null), []);
});
test('addAll: same-value .torrent FILE items (distinct b64) both survive; identical magnets still dedupe', () => {
    const a = Q.makeItem('download.torrent', 'AAAA');
    const b = Q.makeItem('download.torrent', 'BBBB'); // same filename, different payload
    const merged = Q.addAll([], [a, b]);
    assert.equal(merged.length, 2);
    assert.notEqual(merged[0].id, merged[1].id);
    assert.deepEqual(merged.map((i) => i.b64).sort(), ['AAAA', 'BBBB']);

    const m1 = Q.makeItem('magnet:?a');
    const m2 = Q.makeItem('magnet:?a');
    const mergedMagnets = Q.addAll([], [m1, m2]);
    assert.equal(mergedMagnets.length, 1);
});

test('fromPaste: mixed magnet/http/metalink/torrent/unknown lines + blanks + CRLF + dedupe', () => {
    const text = [
        '  ',
        'magnet:?xt=urn:btih:AAA',
        'http://example.com/file.torrent',
        '',
        'http://example.com/file.metalink',
        'http://example.com/file.metalink?x=1',
        'ftp://example.com/file.meta4',
        'not-a-real-line',
        'magnet:?xt=urn:btih:AAA', // duplicate of the first line
    ].join('\r\n');
    const items = Q.fromPaste(text);
    // blank/whitespace-only lines dropped; duplicate magnet collapsed
    assert.deepEqual(items.map((i) => i.type), ['magnet', 'http', 'metalink', 'metalink', 'metalink', 'unknown']);
    assert.equal(items.filter((i) => i.type === 'magnet').length, 1);
    // a remote .torrent URL classifies as 'http' (aria2 fetches the URL itself), not 'torrent'
    assert.equal(items[1].value, 'http://example.com/file.torrent');
    assert.equal(items[1].type, 'http');
    // metalink URL with a query string still matches via the optional (\?.*)? group
    assert.equal(items[3].value, 'http://example.com/file.metalink?x=1');
});

test('fromPaste: local .torrent/.metalink/.meta4 filenames (no URL scheme) classify by extension', () => {
    const items = Q.fromPaste('local.torrent\nlocal.metalink\nlocal.meta4');
    assert.deepEqual(items.map((i) => i.type), ['torrent', 'metalink', 'metalink']);
});

test('makeItem id is deterministic for identical input', () => {
    const a = Q.makeItem('magnet:?xt=urn:btih:AAA');
    const b = Q.makeItem('magnet:?xt=urn:btih:AAA');
    assert.equal(a.id, b.id);
});

test('makeItem: b64 payload folds into id (distinct from the plain value id); same raw+b64 reproduces the same id', () => {
    const plain = Q.makeItem('same.torrent');
    const withB64 = Q.makeItem('same.torrent', 'payload-bytes');
    assert.notEqual(plain.id, withB64.id);
    assert.ok(withB64.id.startsWith(plain.id + ':'));
    const withB64Again = Q.makeItem('same.torrent', 'payload-bytes');
    assert.equal(withB64.id, withB64Again.id);
    const withOtherB64 = Q.makeItem('same.torrent', 'other-bytes'); // different bytes, same filename
    assert.notEqual(withB64.id, withOtherB64.id);
});

test('makeItem: raw is preserved verbatim (untrimmed) while type/value derive from the trimmed classification', () => {
    const it = Q.makeItem('  magnet:?xt=urn:btih:AAA  ');
    assert.equal(it.raw, '  magnet:?xt=urn:btih:AAA  ');
    assert.equal(it.value, 'magnet:?xt=urn:btih:AAA');
    assert.equal(it.type, 'magnet');
});

test('addAll: preserves existing order ahead of incoming, dedupes incoming by value, keeps distinct b64 items', () => {
    const existing = [Q.makeItem('magnet:?xt=urn:btih:AAA'), Q.makeItem('http://x/a')];
    const incomingDup = Q.makeItem('http://x/a'); // duplicate of an existing value
    const incomingNew = Q.makeItem('http://x/b');
    const merged = Q.addAll(existing, [incomingDup, incomingNew]);
    assert.deepEqual(merged.map((i) => i.value), ['magnet:?xt=urn:btih:AAA', 'http://x/a', 'http://x/b']);

    const f1 = Q.makeItem('dup.torrent', 'p1');
    const f2 = Q.makeItem('dup.torrent', 'p2');
    const mergedFiles = Q.addAll([f1], [f2]);
    assert.equal(mergedFiles.length, 2);
});

test('addAll: non-array existing/incoming are treated as empty', () => {
    assert.deepEqual(Q.addAll(null, [{ value: 'a' }]).map((i) => i.value), ['a']);
    assert.deepEqual(Q.addAll([{ value: 'a' }], null).map((i) => i.value), ['a']);
    assert.deepEqual(Q.addAll(null, null), []);
});

test('removeById: present id removed, absent id is a no-op, empty list stays empty', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    assert.deepEqual(Q.removeById(list, 'b').map((i) => i.id), ['a', 'c']);
    assert.deepEqual(Q.removeById(list, 'zzz').map((i) => i.id), ['a', 'b', 'c']);
    assert.deepEqual(Q.removeById([], 'a'), []);
});

test('validate: every non-unknown type is valid, unknown/missing/no-type-field is not (or is — see note)', () => {
    assert.equal(Q.validate({ type: 'magnet' }), true);
    assert.equal(Q.validate({ type: 'http' }), true);
    assert.equal(Q.validate({ type: 'metalink' }), true);
    assert.equal(Q.validate({ type: 'torrent' }), true);
    assert.equal(Q.validate({ type: 'unknown' }), false);
    assert.equal(Q.validate(null), false);
    assert.equal(Q.validate(undefined), false);
    // NOTE (suspected bug): validate() only excludes the literal string 'unknown';
    // an item with no `type` at all (type === undefined) is NOT excluded, so this
    // returns true even though such an item is not one of the known valid types.
    assert.equal(Q.validate({}), true);
});

test('serialize/deserialize: full item round-trip; deserialize tolerates bad/non-array/null/undefined input', () => {
    const list = [Q.makeItem('magnet:?xt=urn:btih:AAA'), Q.makeItem('http://x/y')];
    const round = Q.deserialize(Q.serialize(list));
    assert.deepEqual(round, list);
    assert.deepEqual(Q.deserialize('not json'), []);
    assert.deepEqual(Q.deserialize('{"not":"an array"}'), []);
    assert.deepEqual(Q.deserialize('null'), []);
    assert.deepEqual(Q.deserialize(null), []);
    assert.deepEqual(Q.deserialize(undefined), []);
    assert.equal(Q.serialize(null), '[]');
    assert.equal(Q.serialize(undefined), '[]');
});
