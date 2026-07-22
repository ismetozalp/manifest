// features/update.js — version badge state + GitHub-release self-update.
// Spread-in Alpine state/methods.
//
// Consumes: FS (bridge cockpit.spawn wrapper — curl/unzip/make run through
// the bridge, NEVER browser fetch to github.com, since CSP is connect-src
// 'self'), this.settings.update.{repo,checkOnStartup}, this.pluginVersion
// (read from VERSION by app.js), ManifestUtil.semverGt (pure semver
// compare), this.toast() (app.js), this._settingsDir() (core/settings.js —
// used only for the optional "reset settings" wipe).
//
// The confirm-with-optional-reset-toggle + streamed progress log live in a
// dedicated modal (#mfUpdateModal, html/modals/update.html) rather than the
// generic confirmDialog() — confirmDialog's title+message signature has no
// room for a checkbox, so the reset-settings toggle needs its own markup.
// openUpdateModal() (called from the badge in index.html) shows it;
// startSelfUpdate() below IS the modal's "Install update" button handler —
// it reads the checkbox straight off this.updateResetSettings rather than
// taking a parameter, and drives this.updatePhase through
// 'running' -> 'done'/'error' so the modal body can switch from the confirm
// prompt to the live updateLog pane (mirrors the #mf-banner setup log /
// .mf-setup-log styling in index.html + features/serviceui.js).
//
// Two privilege scopes (spec §9): (1) FS.spawn(['make','-C',dir,'install'],
// {admin:true}) installs the plugin system-wide under
// /usr/share/cockpit/manifest — root, same scope as the aria2 package
// install in core/service.js. (2) the aria2 runtime itself stays per-user,
// untouched by self-update. The detached `systemd-run --no-block` Cockpit
// restart also runs admin — it operates on the *system* cockpit.service, not
// the per-user aria2 unit.
'use strict';
(function (root) {
    const Util = root.ManifestUtil;

    function blankUpdateState() {
        return { checking: false, available: false, error: '', latestVersion: '', latestTag: '', assetUrl: '' };
    }

    const ManifestUpdate = {
        updateState: blankUpdateState(),
        updateLog: [],
        _updateInFlight: false,

        // #mfUpdateModal state (html/modals/update.html). updateModalEl is
        // captured by that partial's x-init, same pattern as
        // confirmModalEl/fsPickerEl in app.js/core/fspicker.js.
        updateModalEl: null,
        updatePhase: 'confirm',   // 'confirm' | 'running' | 'done' | 'error'
        updateResetSettings: false,

        // 'owner/repo' or a full github.com URL, either works.
        _releasesApiUrl() {
            const raw = (this.settings && this.settings.update && this.settings.update.repo) || '';
            const repo = String(raw).trim()
                .replace(/^https?:\/\/github\.com\//i, '')
                .replace(/\.git$/i, '')
                .replace(/\/+$/, '');
            if (!repo || !repo.includes('/')) return '';
            return 'https://api.github.com/repos/' + repo + '/releases/latest';
        },

        // Called once from app.js init() when settings.update.checkOnStartup.
        async _maybeCheckUpdateOnStartup() {
            if (this.settings && this.settings.update && this.settings.update.checkOnStartup) {
                await this.checkForUpdate(false);
            }
        },

        // manual=true surfaces a toast either way (used/expected/up-to-date);
        // manual=false (startup check) stays silent unless an update exists.
        async checkForUpdate(manual) {
            const api = this._releasesApiUrl();
            if (!api) {
                if (manual) this.toast('Set a GitHub repo (owner/name) in Settings → Updates first', 'danger');
                return;
            }
            this.updateState = Object.assign(blankUpdateState(), { checking: true });
            try {
                // Bridge Lesson: browser fetch() to github.com is blocked by
                // CSP connect-src 'self' — the release check must go through
                // cockpit.spawn (FS.spawn), never fetch().
                const out = await FS.spawn(['curl', '-fsSL', '-H', 'Accept: application/vnd.github+json', api]);
                const rel = JSON.parse(out);
                const tag = (rel && rel.tag_name) || '';
                const version = tag.replace(/^v/i, '');
                const asset = (rel.assets || []).find((a) => /\.zip$/i.test((a && a.name) || ''));
                const isNewer = !!(tag && Util.semverGt(tag, this.pluginVersion || '0.0.0'));
                this.updateState = {
                    checking: false,
                    available: isNewer,
                    error: '',
                    latestVersion: version,
                    latestTag: tag,
                    assetUrl: asset ? asset.browser_download_url : ((rel && rel.zipball_url) || '')
                };
                if (manual) {
                    this.toast(isNewer ? ('Update available: v' + version) : 'Manifest is up to date', isNewer ? 'success' : 'info');
                }
            } catch (e) {
                this.updateState = Object.assign(blankUpdateState(), { error: e.message || String(e) });
                if (manual) this.toast('Update check failed: ' + this.updateState.error, 'danger');
            }
        },

        // Opens #mfUpdateModal on its confirm phase (message + the
        // reset-settings checkbox). This is the ONLY entry point the badge
        // (index.html) calls — it never invokes startSelfUpdate() directly,
        // so the modal (and its checkbox) is never bypassed.
        openUpdateModal() {
            if (!this.updateState || !this.updateState.assetUrl) {
                this.toast('No update package available — run a check first', 'danger');
                return;
            }
            this.updateResetSettings = false;
            this.updatePhase = 'confirm';
            this.updateLog = [];
            bootstrap.Modal.getOrCreateInstance(this.updateModalEl).show();
        },

        // Cancel (confirm phase) or Close (done/error phase). Guarded
        // against dismissal while _updateInFlight — same reasoning as the
        // static backdrop/keyboard on the modal itself: an in-flight
        // superuser `make install` must not be walked away from mid-step.
        closeUpdateModal() {
            if (this._updateInFlight) return;
            bootstrap.Modal.getOrCreateInstance(this.updateModalEl).hide();
        },

        // Install-update button handler (#mfUpdateModal confirm phase).
        // Download release zip -> unzip -> `make install` (superuser) ->
        // detached Cockpit restart. A failed install leaves the previous
        // version in place (spec §13) — nothing here touches
        // /usr/share/cockpit/manifest until the `make install` step itself.
        // resetSettings is read from this.updateResetSettings (the modal's
        // checkbox) rather than taken as a parameter, since this is now
        // always invoked directly by the modal's own button, never from a
        // generic confirmDialog.
        async startSelfUpdate() {
            if (this._updateInFlight) return;
            if (!this.updateState || !this.updateState.assetUrl) {
                this.toast('No update package available — run a check first', 'danger');
                return;
            }
            const resetSettings = this.updateResetSettings;

            this._updateInFlight = true;
            this.updatePhase = 'running';
            this.updateLog = [];
            const log = (line) => { this.updateLog.push(String(line)); };
            let tmpDir = '';
            try {
                log('Downloading ' + this.updateState.assetUrl);
                tmpDir = String(await FS.spawn(['mktemp', '-d'])).trim();
                const zipPath = Util.joinPath(tmpDir, 'update.zip');
                await FS.spawn(['curl', '-fsSL', '-o', zipPath, this.updateState.assetUrl]);

                log('Unzipping');
                await FS.spawn(['unzip', '-oq', zipPath, '-d', tmpDir]);

                // `make zip` produces manifest-X.Y.Z.zip with a top-level
                // manifest/ dir (Makefile FILES) — that's the `make install`
                // working dir; fall back to tmpDir itself for other layouts
                // (e.g. GitHub's auto zipball_url, which also nests one dir).
                const entries = String(await FS.spawn(['sh', '-c', 'ls -1 ' + Util.shq(tmpDir)]))
                    .trim().split('\n').filter(Boolean).filter((n) => n !== 'update.zip');
                const srcDir = entries.length === 1 ? Util.joinPath(tmpDir, entries[0]) : tmpDir;

                log('Installing via superuser: make -C ' + srcDir + ' install');
                const installOut = await FS.spawn(['make', '-C', srcDir, 'install'], { admin: true });
                if (installOut) log(installOut);

                if (resetSettings) {
                    log('Resetting Manifest settings');
                    this._suppressSettingsSave = true;
                    await FS.spawn(['rm', '-rf', '--', this._settingsDir()]);
                }

                log('Scheduling detached Cockpit restart (systemd-run --no-block — survives this page disconnecting)');
                await FS.spawn(['systemd-run', '--no-block', '--', 'systemctl', 'try-restart', 'cockpit'], { admin: true });

                log('Done — hard-reload this page in a few seconds.');
                this.updatePhase = 'done';
                this.toast('Update installed — hard-reload this page shortly', 'success');
            } catch (e) {
                log('FAILED: ' + (e.message || String(e)));
                this.updatePhase = 'error';
                this.toast('Self-update failed (previous version left in place): ' + (e.message || String(e)), 'danger');
            } finally {
                this._updateInFlight = false;
                if (tmpDir) { try { await FS.spawn(['rm', '-rf', '--', tmpDir]); } catch (e) { /* best-effort cleanup */ } }
            }
        },
    };

    root.ManifestUpdate = ManifestUpdate;
})(typeof window !== 'undefined' ? window : globalThis);
