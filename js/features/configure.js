// features/configure.js — Configure-on-Start: the per-item dialog opened by
// a staged queue item's Start button (features/queue.js's `startItem`).
// Spread-in Alpine state/methods driving the #mfConfigure markup in
// html/modals/configure.html. Split out of features/queue.js to keep both
// files under the size cap; shares `this.queue.configuring` (declared in
// queue.js's `queue` state, owned/nulled here) since composeData merges
// every spread-in module onto one `this`.
//
// Flow (spec §6.2):
//   1. destination picker (bookmarks/recents/Browse) for every item type.
//   2. http/ftp/metalink -> Start adds directly (this.rpc.addUri) and the
//      item leaves the queue immediately.
//   3. magnet/torrent -> Start adds PAUSED first (magnet: addUri; local
//      .torrent: addTorrent with its base64 payload, Bridge Lesson #2 — never
//      raw binary), then polls tellStatus/getFiles until metadata/files
//      arrive ("fetching metadata…" for magnets), lets the user pick files,
//      then applies select-file + unpause. Cancel at any point (including a
//      metadata-fetch timeout) removes the paused probe download so nothing
//      is ever left running that the user didn't confirm.
'use strict';
(function (root) {
    const Util = root.ManifestUtil;
    const QM = root.ManifestQueueModel;

    // How long a magnet/torrent's "fetching metadata…" probe is allowed to
    // run before the dialog offers Cancel/Retry instead of spinning forever
    // (spec §13: cancel removes the paused item on timeout).
    const FETCH_METADATA_TIMEOUT_MS = 30000;
    const FETCH_METADATA_POLL_MS = 1500;

    const ManifestConfigure = {
        configureModalEl: null,

        needsFileSelect(item) {
            return !!item && (item.type === 'magnet' || item.type === 'torrent');
        },

        // Open Configure directly for a single magnet/torrent handed over from
        // Quick Add (destination already chosen there): show the dialog and
        // immediately kick off metadata resolution → the file tree.
        configureItemNow(item, dir) {
            this.queue.configuring = {
                item, dir: dir || this.home || '/', stage: 'destination',
                gid: null, files: [], fileTree: [], selectedIndices: new Set(), collapsed: new Set(),
                error: '', busy: false, _pollTimer: null, _startedAt: 0,
            };
            bootstrap.Modal.getOrCreateInstance(this.configureModalEl).show();
            this.$nextTick(() => this.cfgStart());
        },

        startItem(item) {
            const dest = (this.settings && this.settings.destinations && this.settings.destinations.default) || this.home || '/';
            this.queue.configuring = {
                item, dir: dest, stage: 'destination',
                gid: null, files: [], fileTree: [], selectedIndices: new Set(), collapsed: new Set(),
                error: '', busy: false,
                _pollTimer: null, _startedAt: 0,
            };
            bootstrap.Modal.getOrCreateInstance(this.configureModalEl).show();
        },

        _cfgSetDest(path) {
            if (path && this.queue.configuring) this.queue.configuring.dir = path;
        },

        async _cfgBrowseDest() {
            if (!this.queue.configuring) return;
            const p = await this.openFolderPicker(this.queue.configuring.dir);
            if (p) this.queue.configuring.dir = p;
        },

        // Destination chosen -> Start. http/ftp/metalink add directly and
        // finish; magnet/torrent add PAUSED first, then poll for metadata/
        // file list before letting the user pick files.
        async cfgStart() {
            const cfg = this.queue.configuring;
            if (!cfg || cfg.busy) return;
            cfg.error = '';
            if (!this.needsFileSelect(cfg.item)) {
                cfg.busy = true;
                try {
                    await this._startItemDirect(cfg.item, cfg.dir); // features/queue.js
                    this._cfgFinish();
                } catch (e) {
                    cfg.error = 'Could not add: ' + ((e && e.message) || e);
                } finally {
                    if (this.queue.configuring) this.queue.configuring.busy = false;
                }
                return;
            }
            cfg.busy = true;
            cfg.stage = 'resolving';
            try {
                if (cfg.item.type === 'magnet') {
                    cfg.gid = await this.rpc.addUri([cfg.item.value], { dir: cfg.dir, pause: 'true' });
                } else {
                    cfg.gid = await this.rpc.addTorrent(cfg.item.b64, [], { dir: cfg.dir, pause: 'true' });
                }
            } catch (e) {
                cfg.error = 'Could not add: ' + ((e && e.message) || e);
                cfg.stage = 'destination';
                cfg.busy = false;
                return;
            }
            cfg.busy = false;
            cfg._startedAt = Date.now();
            this._cfgPollMetadata();
        },

        // Polls getFiles until the real file list is available, then builds the
        // tree. NB: a *paused* torrent reports totalLength=0 even though its
        // metadata (file list) is already known, so we can't key off size — we
        // key off the file list itself. A magnet still fetching metadata exposes
        // a single "[METADATA]…" pseudo-file; a resolved magnet or any torrent
        // lists its actual files. Times out after FETCH_METADATA_TIMEOUT_MS.
        async _cfgPollMetadata() {
            const cfg = this.queue.configuring;
            if (!cfg || cfg.stage !== 'resolving' || !cfg.gid) return;
            if (Date.now() - cfg._startedAt > FETCH_METADATA_TIMEOUT_MS) {
                cfg.stage = 'timeout';
                cfg.error = 'Metadata fetch timed out — no response from peers/trackers yet. Cancel to remove the paused item, or Retry to keep waiting.';
                return;
            }
            try {
                const files = await this.rpc.getFiles(cfg.gid);
                const ready = (files || []).length > 0 && files[0].path && files[0].path.indexOf('[METADATA]') !== 0;
                if (ready) {
                    cfg.files = files.map((f, i) => ({ index: Number(f.index) || (i + 1), path: f.path, length: Number(f.length) || 0, selected: true }));
                    cfg.fileTree = ManifestFileTree.build(files).nodes;
                    cfg.selectedIndices = new Set(cfg.files.map((f) => f.index)); // all selected by default
                    cfg.collapsed = new Set();
                    cfg.stage = 'files';
                    return;
                }
            } catch (e) { /* transient right after add — keep polling */ }
            cfg._pollTimer = setTimeout(() => this._cfgPollMetadata(), FETCH_METADATA_POLL_MS);
        },

        cfgRetry() {
            const cfg = this.queue.configuring;
            if (!cfg) return;
            cfg.error = '';
            cfg.stage = 'resolving';
            cfg._startedAt = Date.now();
            this._cfgPollMetadata();
        },

        // ── Add-time file selection as a checkbox tree (same shape as the
        // detail Files tab; here the choice is applied on Start, not live). ──
        get cfgTreeRows() {
            const cfg = this.queue.configuring;
            if (!cfg) return [];
            const rows = [];
            const collapsed = cfg.collapsed || new Set();
            const walk = (nodes, depth, prefix) => {
                for (const n of nodes) {
                    const key = prefix + '/' + n.name;
                    const isCollapsed = n.dir && collapsed.has(key);
                    rows.push({ node: n, depth, key, collapsed: isCollapsed });
                    if (n.dir && !isCollapsed) walk(n.children, depth + 1, key);
                }
            };
            walk(cfg.fileTree || [], 0, '');
            return rows;
        },
        cfgToggleFolder(key) {
            const cfg = this.queue.configuring; if (!cfg) return;
            const c = new Set(cfg.collapsed || []);
            if (c.has(key)) c.delete(key); else c.add(key);
            cfg.collapsed = c;
        },
        cfgFolderState(node) {
            const cfg = this.queue.configuring;
            return ManifestFileTree.folderState(node, (cfg && cfg.selectedIndices) || new Set());
        },
        cfgFileChecked(node) {
            const cfg = this.queue.configuring;
            return ((cfg && cfg.selectedIndices) || new Set()).has(node.index);
        },
        cfgToggleTreeFile(node) {
            const cfg = this.queue.configuring; if (!cfg) return;
            const s = new Set(cfg.selectedIndices || []);
            if (s.has(node.index)) s.delete(node.index); else s.add(node.index);
            cfg.selectedIndices = s;
        },
        cfgToggleTreeFolder(node) {
            const cfg = this.queue.configuring; if (!cfg) return;
            const s = new Set(cfg.selectedIndices || []);
            if (ManifestFileTree.folderState(node, s) === 'all') node.indices.forEach((i) => s.delete(i));
            else node.indices.forEach((i) => s.add(i));
            cfg.selectedIndices = s;
        },
        cfgSelectAll(sel) {
            const cfg = this.queue.configuring; if (!cfg) return;
            cfg.selectedIndices = new Set(sel ? ManifestFileTree.allIndices(cfg.fileTree || []) : []);
        },

        // File selection confirmed -> apply select-file (only if a strict
        // subset is chosen) + unpause; the item leaves the staging queue.
        async cfgConfirmFiles() {
            const cfg = this.queue.configuring;
            if (!cfg || cfg.stage !== 'files' || cfg.busy) return;
            const selected = cfg.selectedIndices || new Set();
            const total = ManifestFileTree.allIndices(cfg.fileTree || []).length || cfg.files.length;
            if (!selected.size) { cfg.error = 'Select at least one file.'; return; }
            cfg.error = '';
            cfg.busy = true;
            try {
                if (selected.size < total) {
                    await this.rpc.changeOption(cfg.gid, { 'select-file': Util.selectFileCsv(selected, total) });
                }
                await this.rpc.unpause(cfg.gid);
                this._cfgFinish();
            } catch (e) {
                cfg.error = 'Could not start: ' + ((e && e.message) || e);
            } finally {
                if (this.queue.configuring) this.queue.configuring.busy = false;
            }
        },

        _cfgClosePoll() {
            const cfg = this.queue.configuring;
            if (cfg && cfg._pollTimer) { clearTimeout(cfg._pollTimer); cfg._pollTimer = null; }
        },

        // Success path: leaves the staging queue, saves, remembers the
        // destination, closes the modal (actual `configuring = null` happens
        // in configure.html's hidden.bs.modal listener, same pattern as
        // confirm.html/quickadd.html — avoids a flash-of-empty-modal).
        _cfgFinish() {
            const cfg = this.queue.configuring;
            if (!cfg) return;
            this._cfgClosePoll();
            this.queue.items = QM.removeById(this.queue.items, cfg.item.id);
            this._saveQueue(); // features/queue.js
            this.pushRecent(cfg.dir);
            this.toast('Started: ' + (cfg.item.raw || cfg.item.value), 'success');
            bootstrap.Modal.getOrCreateInstance(this.configureModalEl).hide();
            if (this._pollActive) this._poll();
        },

        // Cancel at any stage: if a paused probe download was added
        // (magnet/torrent already sent to aria2 paused), remove it so it
        // never lingers — including after a metadata-fetch timeout
        // (spec §13). The item itself stays in the staging queue.
        async cfgCancel() {
            const cfg = this.queue.configuring;
            if (!cfg) return;
            this._cfgClosePoll();
            if (cfg.gid) {
                const gid = cfg.gid;
                cfg.gid = null;
                try { await this.rpc.forceRemove(gid); } catch (e) {}
                try { await this.rpc.removeDownloadResult(gid); } catch (e) {}
            }
            bootstrap.Modal.getOrCreateInstance(this.configureModalEl).hide();
        },
    };

    root.ManifestConfigure = ManifestConfigure;
})(typeof window !== 'undefined' ? window : globalThis);
