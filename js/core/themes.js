// core/themes.js — theme registry + resolution. PURE (no DOM). Dual-export.
'use strict';
(function (root) {
    const THEMES = [
        { id: 'system',    label: 'System',    base: null },
        { id: 'light',     label: 'Light',     base: 'light' },
        { id: 'dark',      label: 'Dark',      base: 'dark' },
        { id: 'aqua',      label: 'Aqua',      base: 'dark' },
        { id: 'nord',      label: 'Nord',      base: 'dark' },
        { id: 'solarized', label: 'Solarized', base: 'dark' },
        { id: 'dracula',   label: 'Dracula',   base: 'dark' }
    ];

    const BY_ID = THEMES.reduce((m, t) => { m[t.id] = t; return m; }, {});

    function isValid(id) {
        return Object.prototype.hasOwnProperty.call(BY_ID, id);
    }

    function resolveSystem(prefersDark) {
        return prefersDark ? { attr: 'dark', base: 'dark' } : { attr: 'light', base: 'light' };
    }

    function resolve(id, prefersDark) {
        if (id === 'system' || !isValid(id)) return resolveSystem(prefersDark);
        const t = BY_ID[id];
        return { attr: t.id, base: t.base };
    }

    const ManifestThemes = { THEMES, isValid, resolve };
    root.ManifestThemes = ManifestThemes;
    if (typeof module !== 'undefined' && module.exports) module.exports = ManifestThemes;
})(typeof window !== 'undefined' ? window : globalThis);
