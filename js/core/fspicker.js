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
            pathInput: '',   // editable path field (type/paste to jump anywhere)
            filter: '',      // client-side filter over the current folder's entries
        },

        openFolderPicker(startPath) {
            return new Promise((resolve) => {
                this.fsPicker.open = true;
                this.fsPicker.selected = null;
                this.fsPicker.newFolderName = '';
                this.fsPicker.error = '';
                this.fsPicker.filter = '';
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
                this.fsPicker.pathInput = path;   // keep the editable field in sync with where we are
                this.fsPicker.filter = '';        // a fresh listing starts unfiltered
                this.fsPicker.entries = names;
                this.fsPicker.selected = null;
            } catch (e) {
                this.fsPicker.cwd = path;
                this.fsPicker.pathInput = path;
                this.fsPicker.entries = [];
                this.fsPicker.error = /permission denied/i.test(String(e.message || e))
                    ? 'Permission denied reading this folder.'
                    : String(e.message || e);
            }
        },

        // Navigate to a hand-typed/pasted absolute path (Enter or the Go button).
        // A non-existent/unreadable path surfaces via _fpList's error, same as any
        // other unreadable folder — navigate-only, we never create it here.
        _fpGoPath(path) {
            const p = (path == null ? this.fsPicker.pathInput : path || '').trim();
            if (!p) return;
            this._fpList(p);
        },

        // Entries filtered by the search box (case-insensitive substring). The
        // filter narrows the CURRENT folder's list only — it is not a recursive
        // filesystem search (that would hammer a network mount with a deep find).
        _fpFilteredEntries() {
            const f = (this.fsPicker.filter || '').trim().toLowerCase();
            if (!f) return this.fsPicker.entries;
            return this.fsPicker.entries.filter((n) => n.toLowerCase().indexOf(f) !== -1);
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
            // Real write probe. `test -w` uses access(2), which gives false
            // negatives on network mounts (NFS/CIFS frequently can't answer it
            // client-side even when the server permits the write, and root_squash
            // / mount uid mapping further confuse it). Actually creating and
            // removing a temp file is the ground truth for "can I write here".
            const probe = Util.joinPath(cwd, '.manifest-write-test-' + Date.now());
            const q = Util.shq(probe);
            try {
                await FS.spawn(['sh', '-c', 'touch ' + q + ' && rm -f ' + q]);
            } catch (e) {
                this.fsPicker.error = 'Destination not writable — could not create a file here ('
                    + (e.message ? String(e.message).trim() : 'permission denied') + ').';
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
