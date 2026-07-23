// core/selection.js — pure Set algebra for multi-row selection. Every function
// takes a Set of ids (+ ids to act on) and returns a NEW Set (or a boolean),
// never mutating the input — so Alpine sees a fresh reference and re-renders.
// The download-table checkboxes (features/actions.js) are the only caller.
'use strict';
(function (root) {
    // Toggle one id in/out of the selection.
    function toggle(sel, id) {
        const out = new Set(sel);
        if (out.has(id)) out.delete(id); else out.add(id);
        return out;
    }

    // Add every id to the selection.
    function add(sel, ids) {
        const out = new Set(sel);
        for (const id of ids || []) out.add(id);
        return out;
    }

    // Remove every id from the selection.
    function remove(sel, ids) {
        const out = new Set(sel);
        for (const id of ids || []) out.delete(id);
        return out;
    }

    // True when `ids` is non-empty and every id is selected (drives the
    // header "select all" checkbox's checked state).
    function allSelected(sel, ids) {
        return (ids || []).length > 0 && ids.every((id) => sel.has(id));
    }

    // True when at least one of `ids` is selected (drives the header
    // checkbox's indeterminate state, together with !allSelected).
    function anySelected(sel, ids) {
        return (ids || []).some((id) => sel.has(id));
    }

    // Drop selected ids that are no longer present (rows removed/purged between
    // polls) so the selection count can't drift above what's on screen.
    function prune(sel, presentIds) {
        const present = new Set(presentIds || []);
        const out = new Set();
        for (const id of sel) if (present.has(id)) out.add(id);
        return out;
    }

    const ManifestSelection = { toggle, add, remove, allSelected, anySelected, prune };
    root.ManifestSelection = ManifestSelection;
    if (typeof module !== 'undefined' && module.exports) module.exports = ManifestSelection;
})(typeof window !== 'undefined' ? window : globalThis);
