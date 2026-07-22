// features/settings-ui.js — the Settings modal: Appearance (theme picker),
// Destinations (default/bookmarks/recents), Limits & connections
// (aria2 concurrency/connection tuning, live-applied), RPC (port re-verify,
// poll interval), Updates (repo + check-on-startup). Spread-in Alpine
// state/methods driving #mfSettings markup in html/modals/settings.html.
//
// Consumes: ManifestSettings (saveSettings/addBookmark/removeBookmark/
// setDefaultDest, spread in alongside this module — not duplicated here),
// ManifestDefaults.toAria2GlobalOptions, this.rpc.changeGlobalOption,
// ManifestFsPicker.openFolderPicker, ManifestThemes (theme registry/resolve,
// consumed via window.ManifestThemes so settings.html can render it without
// this module needing to depend on load order), ManifestService
// (pickPort/detect/writeConfig/restart — port re-verify + aria2.conf
// rewrite + offer-to-restart), ManifestRpc.create (rebuild this.rpc after a
// port change/restart), this.confirmDialog (generic confirm modal, defined
// in app.js).
'use strict';
(function (root) {
    // Debounce window for live-applying limits while the user is still
    // typing/spinning a number input (mirrors ManifestSettings.saveSettings'
    // own 400ms debounce so a Save button isn't required for every keystroke).
    const APPLY_LIMITS_DEBOUNCE_MS = 400;

    const ManifestSettingsUI = {
        settingsModalEl: null,
        _applyLimitsTimer: null,
        _applyPortBusy: false,

        openSettings() {
            bootstrap.Modal.getOrCreateInstance(this.settingsModalEl).show();
        },

        // Live preview immediately, then persist — matches the plan's
        // "on change: call applyTheme() immediately then saveSettings()".
        setTheme(id) {
            this.settings.theme = id;
            if (typeof this.applyTheme === 'function') this.applyTheme();
            this.saveSettings();
        },

        // Debounced live-apply of the aria2-global-option-mapped limits
        // (max-concurrent-downloads, max-connection-per-server [clamped to
        // 16 by toAria2GlobalOptions], split, bt-max-peers, overall
        // download/upload limits, seed-ratio/seed-time — the rest take
        // effect on new downloads only, per the plan). Always persists via
        // saveSettings() regardless of whether the RPC call succeeds so a
        // momentarily-down aria2 doesn't lose the user's edit.
        applyLimits() {
            this.saveSettings();
            if (this._applyLimitsTimer) clearTimeout(this._applyLimitsTimer);
            this._applyLimitsTimer = setTimeout(() => {
                this._applyLimitsTimer = null;
                this._applyLimitsNow();
            }, APPLY_LIMITS_DEBOUNCE_MS);
        },

        async _applyLimitsNow() {
            if (!this.rpc) return;
            // Clamp in the model too so the input reflects what actually
            // gets sent (toAria2GlobalOptions() also clamps defensively).
            const maxConn = Math.max(1, Math.min(16, Number(this.settings.limits.maxConnectionsPerServer) || 0));
            if (this.settings.limits.maxConnectionsPerServer !== maxConn) {
                this.settings.limits.maxConnectionsPerServer = maxConn;
            }
            try {
                await this.rpc.changeGlobalOption(ManifestDefaults.toAria2GlobalOptions(this.settings));
                this.toast('Limits applied.', 'success');
            } catch (e) {
                this.toast('Could not apply limits live: ' + ((e && e.message) || e), 'danger');
            }
        },

        // Port changed in the RPC section: re-verify it's actually free
        // before persisting/using it (spec: "auto-picked at setup,
        // re-verified on start"). If taken, re-pick and warn instead of
        // silently keeping an unusable port. Then — per the plan's
        // interface for this method — rewrite aria2.conf via
        // ManifestService.writeConfig (so the *service* actually knows
        // about the new port, not just settings.yml/this.settings) and
        // offer to restart aria2 so the new config takes effect; if the
        // user accepts, restart it and rebuild this.rpc against the new
        // port so the running session isn't left talking to the old one.
        async applyPort() {
            if (this._applyPortBusy) return;
            this._applyPortBusy = true;
            try {
                const requested = Number(this.settings.rpc.port);
                const verified = await ManifestService.pickPort(requested);
                if (verified !== requested) {
                    this.settings.rpc.port = verified;
                    this.toast('Port ' + requested + ' is in use; using ' + verified + ' instead.', 'warning');
                }
                this.saveSettings();

                const secret = this.settings.rpc.secret;
                if (!secret) {
                    // aria2 hasn't been set up yet (no secret minted) —
                    // nothing to rewrite/restart; the picked port will be
                    // used the next time runSetup() runs.
                    this.toast('Port ' + verified + ' is free. It will be used next time aria2 is set up.', 'info');
                    return;
                }

                const home = this.home || await FS.homeDir();
                const d = await ManifestService.detect(home);
                if (!d.installed) {
                    this.toast('Port ' + verified + ' is free, but aria2 is not installed to rewrite its config.', 'warning');
                    return;
                }

                const dir = (this.settings.destinations && this.settings.destinations.default) || home;
                await ManifestService.writeConfig({
                    home,
                    port: verified,
                    secret,
                    dir,
                    settings: this.settings,
                    aria2Path: d.aria2Path,
                });

                const ok = await this.confirmDialog(
                    'Restart aria2?',
                    'aria2.conf has been rewritten for port ' + verified + '. Restart the aria2 service now to apply it?'
                );
                if (!ok) {
                    this.toast('aria2.conf updated for port ' + verified + '. Restart aria2 to apply.', 'info');
                    return;
                }

                await ManifestService.restart();
                this.rpc = ManifestRpc.create(this.settings.rpc);
                if (typeof this._refreshServiceState === 'function') await this._refreshServiceState();
                this.toast('aria2 restarted on port ' + verified + '.', 'success');
            } catch (e) {
                this.toast('Could not apply port: ' + ((e && e.message) || e), 'danger');
            } finally {
                this._applyPortBusy = false;
            }
        },

        saveSettingsNow() {
            if (this._applyLimitsTimer) { clearTimeout(this._applyLimitsTimer); this._applyLimitsTimer = null; }
            this.saveSettings();
            this._applyLimitsNow();
            this.toast('Settings saved.', 'success');
            bootstrap.Modal.getOrCreateInstance(this.settingsModalEl).hide();
        },

        // Keeps rpc secret/port (a fresh mergeSettings({}) would blank
        // them), resets everything else — destinations, limits, update prefs,
        // theme — back to ManifestDefaults.
        resetSettingsToDefaults() {
            const rpc = this.settings.rpc;
            this.settings = ManifestDefaults.mergeSettings({});
            this.settings.rpc = rpc;
            if (typeof this.applyTheme === 'function') this.applyTheme();
            this.saveSettings();
            this.toast('Settings reset to defaults.', 'info');
        },

        async _setDefaultDestBrowse() {
            const p = await this.openFolderPicker(this.settings.destinations.default || this.home || '/');
            if (p) this.setDefaultDest(p);
        },

        async _addBookmarkBrowse() {
            const p = await this.openFolderPicker(this.settings.destinations.default || this.home || '/');
            if (!p) return;
            const label = (window.prompt && window.prompt('Bookmark label:', ManifestUtil.basename(p))) || ManifestUtil.basename(p);
            this.addBookmark(label, p);
        },

        clearRecents() {
            this.settings.destinations.recents = [];
            this.saveSettings();
        },
    };

    root.ManifestSettingsUI = ManifestSettingsUI;
})(typeof window !== 'undefined' ? window : globalThis);
