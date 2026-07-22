// app.js — the single Alpine component. Modules (window.ManifestXxx) are spread
// in here as later phases add them; state and init() live here.
'use strict';

document.addEventListener('alpine:init', () => {
    Alpine.data('manifest', () => ({
        // ── State ──
        ready: false,
        pluginVersion: '',
        home: '',

        // ── Modules spread in ──
        ...window.ManifestSettings,

        // ── Lifecycle ──
        async init() {
            try { this.pluginVersion = (await this._readVersion()) || ''; } catch (e) {}
            try { this.home = await FS.homeDir(); } catch (e) {}
            try { await this._loadSettings(); } catch (e) {}
            this.ready = true;
        },

        async _readVersion() {
            // VERSION ships next to index.html; fetch same-origin under CSP 'self'.
            try {
                const r = await fetch('VERSION', { cache: 'no-cache' });
                return r.ok ? (await r.text()).trim() : '';
            } catch (e) { return ''; }
        },
    }));
});
