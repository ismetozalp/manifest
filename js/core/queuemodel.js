// core/queuemodel.js — pure staging-queue logic for Paste-to-Queue (spec §6.2).
// No DOM/RPC/FS access here — persistence (FS.readText/writeText) and RPC calls
// live in features/queue.js; this module only knows how to parse, dedupe,
// validate and (de)serialize plain item objects.
'use strict';
(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        // Node/CJS (unit tests): pull in the sibling pure module directly.
        module.exports = factory(require('./detect.js'));
    } else {
        // Browser: ManifestDetect is already a global (script order in index.html).
        root.ManifestQueueModel = factory(root.ManifestDetect);
    }
})(typeof window !== 'undefined' ? window : globalThis, function (ManifestDetect) {
    // Cheap deterministic string fingerprint (djb2 xor variant) — NOT a
    // cryptographic hash, just enough entropy so two different .torrent file
    // payloads attached under the same filename get distinct ids. Determinism
    // (vs. Math.random/Date.now) keeps this reproducible/testable like the
    // rest of the id scheme.
    function fingerprint(s) {
        s = String(s || '');
        let h = 5381;
        for (let i = 0; i < s.length; i++) {
            h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
        }
        return h.toString(36) + s.length.toString(36);
    }

    // id is derived deterministically from type+value (not a random/incrementing
    // counter) so tests stay reproducible and re-parsing the same paste is
    // naturally idempotent/dedupe-friendly by id too.
    //
    // b64 (optional): when a .torrent FILE's base64 payload is supplied, it's
    // folded into the id (and stored on the item) — two attached files that
    // happen to share a filename/value are DISTINCT items (different bytes),
    // and must never collapse into one via value-only identity/dedupe (that
    // silently discards the second file's data — see addAll below).
    function makeItem(raw, b64) {
        const c = ManifestDetect.classify(raw);
        const item = {
            id: c.type + ':' + c.value,
            raw: String(raw || ''),
            type: c.type,
            value: c.value,
            status: 'staged',
            addedAt: null,
        };
        if (b64) {
            item.b64 = b64;
            item.id += ':' + fingerprint(b64);
        }
        return item;
    }

    function fromPaste(text) {
        const lines = ManifestDetect.parseLines(text);
        const items = lines.map((l) => makeItem(l.raw));
        return ManifestDetect.dedupe(items);
    }

    // Concat + dedupe, preserving existing entries (and their order) ahead of
    // any new incoming ones. URL/magnet/metalink items dedupe by `value`
    // (same as before). Items carrying a `b64` payload (attached .torrent
    // FILES) are exempt from value-dedup entirely — a filename is not a
    // content identity, so two distinct files sharing a basename must both
    // survive rather than silently losing the second file's data.
    function dedupeQueueItems(items) {
        const seen = new Set();
        const out = [];
        for (const it of items) {
            if (it && it.b64) { out.push(it); continue; }
            const key = it && it.value;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(it);
        }
        return out;
    }

    function addAll(existing, incoming) {
        existing = Array.isArray(existing) ? existing : [];
        incoming = Array.isArray(incoming) ? incoming : [];
        return dedupeQueueItems(existing.concat(incoming));
    }

    function removeById(list, id) {
        list = Array.isArray(list) ? list : [];
        return list.filter((it) => it.id !== id);
    }

    function validate(item) {
        return !!item && item.type !== 'unknown';
    }

    function serialize(list) {
        return JSON.stringify(Array.isArray(list) ? list : []);
    }

    // Tolerant: malformed JSON or a non-array payload both yield [] rather than
    // throwing — a corrupted queue.json must never crash the shell on load.
    function deserialize(json) {
        try {
            const parsed = JSON.parse(json);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    return { makeItem, fromPaste, addAll, removeById, validate, serialize, deserialize };
});
