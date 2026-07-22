// features/serviceui.js — service status banner state + turnkey setup
// orchestration. Spread-in Alpine methods driving `svc`/`rpc` (declared in
// app.js's state block) via #mf-banner markup in index.html.
//
// Consumes: ManifestService (detect/setup/start/stop/status), ManifestRpc
// (create/ping), ManifestSettings (saveSettings, spread in alongside this
// module — not called directly here beyond that).
'use strict';
(function (root) {
    const ManifestServiceUI = {
        _svcPollTimer: null,

        // Re-derives svc.setup / svc.active / svc.state from the live
        // system: is aria2 installed, does settings.rpc have a port+secret
        // (so we can build/rebuild this.rpc), does the RPC actually answer,
        // and what does the systemd unit report.
        async _refreshServiceState() {
            const d = await ManifestService.detect();
            const rpcCfg = this.settings && this.settings.rpc;
            if (rpcCfg && rpcCfg.port && rpcCfg.secret) {
                this.rpc = ManifestRpc.create(rpcCfg);
                this.svc.active = await this.rpc.ping();
            } else {
                this.rpc = null;
                this.svc.active = false;
            }
            this.svc.setup = !!(d.installed && rpcCfg && rpcCfg.port);
            try {
                const st = await ManifestService.status();
                this.svc.state = st.state;
            } catch (e) {
                this.svc.state = 'unknown';
            }
        },

        // Turnkey: detect -> install if missing -> pick port -> configure ->
        // start -> wait for RPC. Streams progress into svc.log. On success,
        // persists settings.rpc and re-derives banner state. On failure,
        // the manual-install command (from ManifestService's thrown Error,
        // spec §13) lands in both the toast and svc.log so it's visible
        // either way.
        async runSetup() {
            if (this.svc.busy) return;
            this.svc.busy = true;
            this.svc.log = '';
            try {
                const result = await ManifestService.setup({
                    home: this.home,
                    settings: this.settings,
                    onLog: (line) => { this.svc.log += line + '\n'; },
                });
                this.settings.rpc = { port: result.port, secret: result.secret };
                this.saveSettings();
                this.rpc = ManifestRpc.create(this.settings.rpc);
                await this._refreshServiceState();
                this.toast('aria2 is set up and running.', 'success');
            } catch (e) {
                const msg = (e && e.message) || String(e);
                this.svc.log += msg + '\n';
                this.toast('Setup failed: ' + msg, 'danger');
            } finally {
                this.svc.busy = false;
            }
        },

        async startService() {
            try {
                await ManifestService.start();
            } catch (e) {
                this.toast('Failed to start aria2: ' + ((e && e.message) || e), 'danger');
            }
            await this._refreshServiceState();
        },

        async stopService() {
            try {
                await ManifestService.stop();
            } catch (e) {
                this.toast('Failed to stop aria2: ' + ((e && e.message) || e), 'danger');
            }
            await this._refreshServiceState();
        },

        // Health poll for the banner: every ~5s while the tab is visible.
        // Skips (rather than tears down) the tick when document.hidden so
        // it resumes immediately on refocus with no re-setup needed.
        _startServicePoll() {
            if (this._svcPollTimer) return;
            this._svcPollTimer = setInterval(() => {
                if (document.hidden) return;
                this._refreshServiceState().catch((e) => {
                    console.error('[manifest] service poll failed:', e);
                });
            }, 5000);
        },

        _stopServicePoll() {
            if (this._svcPollTimer) {
                clearInterval(this._svcPollTimer);
                this._svcPollTimer = null;
            }
        },
    };

    root.ManifestServiceUI = ManifestServiceUI;
})(typeof window !== 'undefined' ? window : globalThis);
