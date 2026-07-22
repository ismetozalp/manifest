// app.js — the single Alpine component. Modules (window.ManifestXxx) are spread
// in here as later phases add them; state and init() live here.
'use strict';

document.addEventListener('alpine:init', () => {
    Alpine.data('manifest', () => ({
        // ── Modules spread in ──
        ...window.ManifestSettings,   // core/settings.js
        ...window.ManifestFsPicker,   // core/fspicker.js
        ...window.ManifestServiceUI,  // features/serviceui.js
        ...window.ManifestDownloads,  // features/downloads.js
        // features spread in later phases: quickadd, actions, queue, detail, update

        // ── State ──
        ready: false,
        pluginVersion: '',
        home: '',
        settings: window.ManifestDefaults.mergeSettings({}),
        svc: { setup: false, active: false, state: 'unknown', busy: false, log: '' },
        rpc: null,                    // ManifestRpc instance once port+secret known
        toasts: [],

        // ── Table/filter state (live data + behavior come from the spread
        // ...window.ManifestDownloads module above: counts/visibleDownloads/
        // agg are getters there, sortBy() is a method there) ──
        activeFilter: 'all',
        filterPills: [
            { key: 'all', label: 'All' },
            { key: 'active', label: 'Active' },
            { key: 'waiting', label: 'Waiting' },
            { key: 'paused', label: 'Paused' },
            { key: 'complete', label: 'Complete' },
            { key: 'error', label: 'Error' },
            { key: 'queue', label: 'Queue' },
        ],
        downloads: {},        // gid-keyed map, kept stable across polls
        sortKey: 'name',
        sortDir: 'asc',

        // ── Not-yet-built handlers (Phase 4.2/4.3/5/6 replace these stubs) ──
        // Defined here so the `identifier && identifier()` guards in index.html
        // never throw a ReferenceError — with Alpine's `with(scope){...}`
        // evaluation, an *undeclared* identifier throws even when guarded by
        // `&&`; only an already-defined-but-falsy value short-circuits safely.
        openQuickAdd() {},
        openPaste() {},
        openSettings() {},
        openRowMenu() {}, // Phase 4.3 (actions.js) replaces this with the real context menu.
        onKey() {},

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

        // ── Lifecycle ──
        async init() {
            try { this.pluginVersion = (await this._readVersion()) || ''; } catch (e) {}
            try { this.home = await FS.homeDir(); } catch (e) {}
            try { await this._loadSettings(); } catch (e) {}
            try { await this._refreshServiceState(); } catch (e) { console.error('[manifest] initial service state check failed:', e); }
            this._startServicePoll();
            // Download polling tracks svc.active reactively (turnkey setup,
            // manual Start/Stop, and the 5s health poll all flow through
            // _refreshServiceState) — it must never start while aria2 isn't
            // confirmed up (so the no-aria2 smoke stays clean).
            this.$watch('svc.active', (active) => {
                if (active) this.startPolling(); else this.stopPolling();
            });
            if (this.svc.active) this.startPolling();
            this.ready = true;
        },

        async _readVersion() {
            // VERSION ships next to index.html; fetch same-origin under CSP 'self'.
            try {
                const r = await fetch('VERSION', { cache: 'no-cache' });
                return r.ok ? (await r.text()).trim() : '';
            } catch (e) { return ''; }
        },

        toast(msg, kind = 'info') {
            const id = Date.now() + Math.random();
            this.toasts.push({ id, msg, kind });
            setTimeout(() => { this.toasts = this.toasts.filter((t) => t.id !== id); }, 6000);
        },
    }));
});
