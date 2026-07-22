// features/quickadd.js — Quick Add modal: source auto-detect (magnet / http /
// ftp / multiline / metalink via ManifestDetect), .torrent via drag-drop +
// Browse (base64-inside-JSON per Bridge Lesson #2 — NEVER raw binary),
// destination chip row (bookmarks + recents + Browse via openFolderPicker),
// add-paused, optional per-torrent file selection. Spread-in Alpine methods
// driving the #mfQuickAdd markup in html/modals/quickadd.html (state
// `quickAdd` lives here; `quickAddModalEl` is captured by that partial's
// x-init, same pattern as html/modals/confirm.html).
//
// Consumes: ManifestDetect (parseLines/dedupe), this.rpc (addUri/addTorrent/
// getFiles/forceRemove/removeDownloadResult), ManifestFsPicker's
// openFolderPicker + ManifestSettings' pushRecent/settings (both spread in
// alongside this module), ManifestUtil.stripDataUrl (FileReader -> base64).
'use strict';
(function (root) {
    const Detect = root.ManifestDetect;
    const Util = root.ManifestUtil;

    function isRemoteUrl(v) { return /^(https?|ftp|sftp):\/\//i.test(String(v || '')); }

    function freshQuickAdd() {
        return {
            open: false,
            text: '',
            dir: '',
            paused: false,
            error: '',
            dragOver: false,
            torrentFiles: [],   // [{name,size,b64,gid,entries,expanded,loading,error}]
        };
    }

    const ManifestQuickAdd = {
        quickAddModalEl: null,
        quickAdd: freshQuickAdd(),

        openQuickAdd() {
            const dest = (this.settings && this.settings.destinations && this.settings.destinations.default)
                || this.home || '/';
            this.quickAdd = freshQuickAdd();
            this.quickAdd.open = true;
            this.quickAdd.dir = dest;
            bootstrap.Modal.getOrCreateInstance(this.quickAddModalEl).show();
        },

        _qaSetDest(path) {
            if (path) this.quickAdd.dir = path;
        },

        async _qaBrowseDest() {
            const p = await this.openFolderPicker(this.quickAdd.dir);
            if (p) this.quickAdd.dir = p;
        },

        // ── .torrent intake (drag-drop + Browse) ──
        _qaDrop(ev) {
            this.quickAdd.dragOver = false;
            this._qaAddTorrentFiles((ev.dataTransfer && ev.dataTransfer.files) || []);
        },

        _qaFiles(ev) {
            this._qaAddTorrentFiles(ev.target.files || []);
            ev.target.value = ''; // allow re-picking the same filename later
        },

        async _qaAddTorrentFiles(fileList) {
            for (const file of Array.from(fileList)) {
                if (!/\.torrent$/i.test(file.name)) continue;
                const entry = { name: file.name, size: file.size, b64: '', gid: null, entries: null, expanded: false, loading: false, error: '' };
                this.quickAdd.torrentFiles.push(entry);
                try {
                    entry.b64 = await this._fileToBase64(file);
                } catch (e) {
                    entry.error = 'Could not read file: ' + ((e && e.message) || e);
                }
            }
        },

        // Bridge Lesson #2: read as a data: URL, then strip the prefix so the
        // aria2 addTorrent call carries the bare base64 payload — never raw
        // binary/ArrayBuffer/multipart/FormData.
        _fileToBase64(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(Util.stripDataUrl(reader.result));
                reader.onerror = () => reject(reader.error || new Error('read failed'));
                reader.readAsDataURL(file);
            });
        },

        async _qaRemoveTorrentFile(idx) {
            const tf = this.quickAdd.torrentFiles[idx];
            if (!tf) return;
            await this._qaDiscardPeek(tf);
            this.quickAdd.torrentFiles.splice(idx, 1);
        },

        // ── Per-file selection (spec §6.1) ──
        // Default is "all files" — no peek needed, no select-file option.
        // Only when the user expands "Choose files…" do we add the torrent
        // *paused* so aria2 can resolve its metadata locally, then list
        // entries via getFiles(gid). That peek gid is discarded (never left
        // running) — confirmQuickAdd always issues the real add afterward
        // with the user's selection baked into the options aria2 receives.
        async _qaToggleChooseFiles(idx) {
            const tf = this.quickAdd.torrentFiles[idx];
            if (!tf) return;
            tf.expanded = !tf.expanded;
            if (tf.expanded && !tf.entries && !tf.loading && !tf.error) await this._qaLoadTorrentEntries(tf);
        },

        async _qaLoadTorrentEntries(tf) {
            tf.loading = true;
            tf.error = '';
            try {
                if (!tf.gid) {
                    tf.gid = await this.rpc.addTorrent(tf.b64, [], { dir: this.quickAdd.dir, pause: 'true' });
                }
                const files = await this.rpc.getFiles(tf.gid);
                tf.entries = (files || []).map((f, i) => ({ index: i + 1, path: f.path, length: f.length, selected: true }));
            } catch (e) {
                tf.error = 'Could not read torrent contents: ' + ((e && e.message) || e);
            } finally {
                tf.loading = false;
            }
        },

        // Best-effort cleanup of a paused peek-add (torrent removed from the
        // list, or the whole modal cancelled) so it never sits around as an
        // orphaned paused download the user never asked to keep.
        async _qaDiscardPeek(tf) {
            if (!tf || !tf.gid) return;
            const gid = tf.gid;
            tf.gid = null;
            try { await this.rpc.forceRemove(gid); } catch (e) {}
            try { await this.rpc.removeDownloadResult(gid); } catch (e) {}
        },

        async _qaCancel() {
            for (const tf of this.quickAdd.torrentFiles) await this._qaDiscardPeek(tf);
            bootstrap.Modal.getOrCreateInstance(this.quickAddModalEl).hide();
        },

        // ── Confirm: add every parsed line + every attached .torrent ──
        async confirmQuickAdd() {
            this.quickAdd.error = '';
            const items = Detect.dedupe(Detect.parseLines(this.quickAdd.text));
            if (!items.length && !this.quickAdd.torrentFiles.length) {
                this.quickAdd.error = 'Nothing to add — paste a magnet/URL or attach a .torrent file.';
                return;
            }
            const opts = { dir: this.quickAdd.dir, pause: this.quickAdd.paused ? 'true' : 'false' };
            const errors = [];

            for (const item of items) {
                try {
                    // aria2 fetches URLs itself (incl. remote .torrent/.metalink) —
                    // only a *local* .torrent file needs the base64 path below,
                    // and local .metalink files aren't accepted as pasted text
                    // (use Quick Add's file Browse for those in a later phase).
                    if (item.type === 'magnet' || item.type === 'http' || (item.type === 'metalink' && isRemoteUrl(item.value))) {
                        await this.rpc.addUri([item.value], opts);
                    } else {
                        errors.push(item.raw + ': unrecognized source');
                    }
                } catch (e) {
                    errors.push(item.raw + ': ' + ((e && e.message) || e));
                }
            }

            for (const tf of this.quickAdd.torrentFiles) {
                try {
                    if (tf.error) { errors.push(tf.name + ': ' + tf.error); continue; }
                    let torrentOpts = opts;
                    if (tf.gid) {
                        // Peeked for "Choose files…" — bake the selection into
                        // a fresh options object, then discard the paused
                        // probe add and re-add for real below (still
                        // base64-inside-JSON — Bridge Lesson #2).
                        if (tf.entries) {
                            const idx = tf.entries.filter((e) => e.selected).map((e) => e.index);
                            if (idx.length && idx.length < tf.entries.length) {
                                torrentOpts = Object.assign({}, opts, { 'select-file': idx.join(',') });
                            }
                        }
                        await this._qaDiscardPeek(tf);
                    }
                    await this.rpc.addTorrent(tf.b64, [], torrentOpts);
                } catch (e) {
                    errors.push(tf.name + ': ' + ((e && e.message) || e));
                }
            }

            if (errors.length) {
                this.quickAdd.error = errors.join('\n');
                return; // keep the modal open so the user can see/fix (spec §13)
            }

            this.pushRecent(this.quickAdd.dir);
            this.toast('Added to aria2.', 'success');
            bootstrap.Modal.getOrCreateInstance(this.quickAddModalEl).hide();
            if (this._pollActive) this._poll(); // immediate refresh, don't wait for the next tick
        },
    };

    root.ManifestQuickAdd = ManifestQuickAdd;
})(typeof window !== 'undefined' ? window : globalThis);
