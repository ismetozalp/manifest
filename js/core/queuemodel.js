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
    // id is derived deterministically from type+value (not a random/incrementing
    // counter) so tests stay reproducible and re-parsing the same paste is
    // naturally idempotent/dedupe-friendly by id too.
    function makeItem(raw) {
        const c = ManifestDetect.classify(raw);
        return {
            id: c.type + ':' + c.value,
            raw: String(raw || ''),
            type: c.type,
            value: c.value,
            status: 'staged',
            addedAt: null,
        };
    }

    function fromPaste(text) {
        const lines = ManifestDetect.parseLines(text);
        const items = lines.map((l) => makeItem(l.raw));
        return ManifestDetect.dedupe(items);
    }

    // Concat + dedupe by `value`, preserving existing entries (and their order)
    // ahead of any new incoming ones.
    function addAll(existing, incoming) {
        existing = Array.isArray(existing) ? existing : [];
        incoming = Array.isArray(incoming) ? incoming : [];
        return ManifestDetect.dedupe(existing.concat(incoming));
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
