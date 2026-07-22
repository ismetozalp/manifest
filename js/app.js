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
        // Visibility is driven via bootstrap.Modal (see html/modals/confirm.html),
        // not x-show. confirmModalEl is captured by that partial's x-init.
        confirmModalEl: null,
        confirm: { open: false, title: '', message: '', result: undefined, resolve: null },

        confirmDialog(title, message) {
            return new Promise((resolve) => {
                this.confirm = { open: true, title: title || 'Confirm', message: message || '', result: undefined, resolve };
                bootstrap.Modal.getOrCreateInstance(this.confirmModalEl).show();
            });
        },

        // Resolution happens in the 'hidden.bs.modal' listener (see
        // html/modals/confirm.html) once the modal has actually finished
        // closing — resolving here instead would race the next dialog if a
        // caller immediately opens another one reusing this same modal.
        _confirmOk() {
            this.confirm.result = true;
            bootstrap.Modal.getOrCreateInstance(this.confirmModalEl).hide();
        },

        _confirmCancel() {
            this.confirm.result = false;
            bootstrap.Modal.getOrCreateInstance(this.confirmModalEl).hide();
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
