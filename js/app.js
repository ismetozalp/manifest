// app.js — the single Alpine component. Modules (window.ManifestXxx) are spread
// in here as later phases add them; state and init() live here.
'use strict';

document.addEventListener('alpine:init', () => {
    Alpine.data('manifest', () => ({
        // ── State ──
        ready: false,
        pluginVersion: '',
        home: '',

        // ── Generic confirm dialog (drives #mfConfirmModal) ──
        confirm: { open: false, title: '', message: '', resolve: null },

        confirmDialog(title, message) {
            return new Promise((resolve) => {
                this.confirm = { open: true, title: title || 'Confirm', message: message || '', resolve };
            });
        },

        _confirmOk() {
            const resolve = this.confirm.resolve;
            this.confirm.open = false;
            if (resolve) resolve(true);
        },

        _confirmCancel() {
            const resolve = this.confirm.resolve;
            this.confirm.open = false;
            if (resolve) resolve(false);
        },

        // ── Modules spread in ──
        ...window.ManifestSettings,
        ...window.ManifestFsPicker,

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
