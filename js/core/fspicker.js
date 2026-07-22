// core/fspicker.js — server-side folder-browser dialog (dirs-only,
// destination picker). Spread-in Alpine methods driving the
// #mfFolderPicker markup in html/modals/confirm.html.
//
// Lists the server filesystem AS THE LOGGED-IN COCKPIT USER via
// FS.spawn (cockpit.spawn under the hood, unprivileged) — never as root.
// No sidebar: breadcrumb + a single folder list + New-folder + Choose/Cancel.
'use strict';
(function (root) {
    const Util = root.ManifestUtil;

    const ManifestFsPicker = {
        // Captured by html/modals/confirm.html's x-init on #mfFolderPicker.
        // Visibility is driven via bootstrap.Modal, not x-show.
        fsPickerEl: null,

        fsPicker: {
            open: false,
            cwd: '/',
            entries: [],
            selected: null,
            newFolderName: '',
            error: '',
            resolve: null,
        },

        openFolderPicker(startPath) {
            return new Promise((resolve) => {
                this.fsPicker.open = true;
                this.fsPicker.selected = null;
                this.fsPicker.newFolderName = '';
                this.fsPicker.error = '';
                this.fsPicker.resolve = resolve;
                bootstrap.Modal.getOrCreateInstance(this.fsPickerEl).show();
                this._fpList(startPath || '/');
            });
        },

        async _fpList(path) {
            this.fsPicker.error = '';
            try {
                const out = await FS.spawn(['find', path, '-mindepth', '1', '-maxdepth', '1', '-type', 'd', '-printf', '%f\\n']);
                const names = String(out).split('\n').filter(Boolean).sort((a, b) => a.localeCompare(b));
                this.fsPicker.cwd = path;
                this.fsPicker.entries = names;
                this.fsPicker.selected = null;
            } catch (e) {
                this.fsPicker.cwd = path;
                this.fsPicker.entries = [];
                this.fsPicker.error = /permission denied/i.test(String(e.message || e))
                    ? 'Permission denied reading this folder.'
                    : String(e.message || e);
            }
        },

        _fpBreadcrumb() {
            const cwd = this.fsPicker.cwd || '/';
            const parts = cwd.split('/').filter(Boolean);
            const segs = [{ label: '/', path: '/' }];
            let acc = '';
            for (const p of parts) {
                acc += '/' + p;
                segs.push({ label: p, path: acc });
            }
            return segs;
        },

        _fpGoto(idx) {
            const segs = this._fpBreadcrumb();
            const seg = segs[idx];
            if (seg) this._fpList(seg.path);
        },

        _fpEnter(name) {
            this._fpList(Util.joinPath(this.fsPicker.cwd, name));
        },

        _fpUp() {
            this._fpList(Util.dirname(this.fsPicker.cwd));
        },

        async _fpNewFolder(name) {
            name = (name || '').trim();
            if (!name) return;
            try {
                await FS.mkdir(Util.joinPath(this.fsPicker.cwd, name));
                this.fsPicker.newFolderName = '';
                await this._fpList(this.fsPicker.cwd);
            } catch (e) {
                this.fsPicker.error = 'Could not create folder: ' + (e.message || e);
            }
        },

        async _fpChoose() {
            const cwd = this.fsPicker.cwd;
            try {
                await FS.spawn(['test', '-w', cwd]);
            } catch (e) {
                this.fsPicker.error = 'Destination not writable.';
                return;
            }
            this._fpFinish(cwd);
        },

        _fpCancel() {
            this._fpFinish(null);
        },

        _fpFinish(result) {
            const resolve = this.fsPicker.resolve;
            this.fsPicker.open = false;
            this.fsPicker.resolve = null;
            bootstrap.Modal.getOrCreateInstance(this.fsPickerEl).hide();
            if (resolve) resolve(result);
        },
    };

    root.ManifestFsPicker = ManifestFsPicker;
})(typeof window !== 'undefined' ? window : globalThis);
