// features/actions.js — row & context-menu actions on the unified table.
// Spread-in Alpine state/methods. Popup context menu (NOT a rail — a
// cursor-positioned popover, per the no-sidebar constraint), multi-select,
// and the row actions: pause/resume/retry/remove/remove+delete/copy URI or
// magnet/Open destination in Explorer.
//
// Consumes: this.rpc (ManifestRpc instance), this.confirmDialog() (app.js
// generic confirm modal), this.toast(), FS.spawn (rm -f for delete),
// ManifestUtil (shq for shell-quoting rm args).
'use strict';
(function (root) {
    const Util = root.ManifestUtil;
    const Selection = root.ManifestSelection;

    const ManifestActions = {
        // ── Context-menu popup state (positioned at the cursor, not a rail) ──
        ctxMenu: { open: false, x: 0, y: 0, target: null },

        // ── Multi-select ──
        selection: new Set(),
        _lastClickedGid: null,

        openRowMenu(ev, d) {
            if (ev) { ev.preventDefault(); ev.stopPropagation(); }
            if (d && d.gid && !this.selection.has(d.gid)) {
                // Right-clicking/​opening the menu on a row outside the current
                // selection re-targets the menu at just that row (bulk actions
                // then apply only to it), matching common file-manager UX.
                this.selection = new Set([d.gid]);
            }
            const x = ev ? ev.clientX : 0;
            const y = ev ? ev.clientY : 0;
            this.ctxMenu = { open: true, x, y, target: d || null };
            // Keep the menu inside the (iframe) viewport: the ⋯ button sits at the
            // far right, so an unclamped left:clientX opens the menu off-screen and
            // unclickable. Measure the rendered menu and shift it left/up to fit.
            this.$nextTick(() => {
                const el = document.querySelector('.mf-ctxmenu');
                if (!el) return;
                const pad = 8;
                const w = el.offsetWidth || 200;
                const h = el.offsetHeight || 220;
                let nx = x, ny = y;
                if (x + w + pad > window.innerWidth) nx = Math.max(pad, window.innerWidth - w - pad);
                if (y + h + pad > window.innerHeight) ny = Math.max(pad, window.innerHeight - h - pad);
                if (nx !== x) this.ctxMenu.x = nx;
                if (ny !== y) this.ctxMenu.y = ny;
            });
        },

        closeContextMenu() {
            this.ctxMenu.open = false;
        },

        // Row (left-)click selection: plain click selects only this row;
        // ctrl/cmd-click toggles; shift-click range-selects from the last
        // clicked row (in visibleDownloads order).
        selectRow(ev, d) {
            if (!d || !d.gid) return;
            if (ev && (ev.shiftKey) && this._lastClickedGid) {
                const list = this.visibleDownloads;
                const ia = list.findIndex((x) => x.gid === this._lastClickedGid);
                const ib = list.findIndex((x) => x.gid === d.gid);
                if (ia !== -1 && ib !== -1) {
                    const [lo, hi] = ia < ib ? [ia, ib] : [ib, ia];
                    for (let i = lo; i <= hi; i++) this.selection.add(list[i].gid);
                    this.selection = new Set(this.selection);
                    return;
                }
            }
            if (ev && (ev.ctrlKey || ev.metaKey)) {
                if (this.selection.has(d.gid)) this.selection.delete(d.gid);
                else this.selection.add(d.gid);
                this.selection = new Set(this.selection);
            } else {
                this.selection = new Set([d.gid]);
            }
            this._lastClickedGid = d.gid;
        },

        // ── Checkbox multi-select (independent of row-click selection) ──
        // Toggle a single row's checkbox.
        toggleSelect(d) {
            if (!d || !d.gid) return;
            this.selection = Selection.toggle(this.selection, d.gid);
            this._lastClickedGid = d.gid;
        },

        // gids currently on screen (respects the active filter/sort order).
        _visibleGids() {
            return this.visibleDownloads.map((d) => d.gid).filter(Boolean);
        },

        // Header checkbox state: checked when every visible row is selected,
        // indeterminate (see index.html x-effect) when only some are.
        get allVisibleSelected() {
            return Selection.allSelected(this.selection, this._visibleGids());
        },
        get anyVisibleSelected() {
            return Selection.anySelected(this.selection, this._visibleGids());
        },

        // Header checkbox: select all visible rows, or clear them if all are
        // already selected. Only touches the visible set — rows hidden by the
        // active filter keep their current selection state.
        toggleSelectAll() {
            const vis = this._visibleGids();
            this.selection = this.allVisibleSelected
                ? Selection.remove(this.selection, vis)
                : Selection.add(this.selection, vis);
        },

        clearSelection() {
            this.selection = new Set();
        },

        // Selected downloads that still exist (stale gids from removed rows are
        // dropped). Drives the bulk-action bar count and its actions.
        get selectedRows() {
            return Array.from(this.selection)
                .map((gid) => this.downloads[gid])
                .filter(Boolean);
        },

        // Rows the current menu/bulk action should apply to: the multi-select
        // if the target is part of it, else just the single right-clicked row.
        _targets(d) {
            d = d || this.ctxMenu.target;
            if (d && d.gid && this.selection.has(d.gid) && this.selection.size > 1) {
                return Array.from(this.selection)
                    .map((gid) => this.downloads[gid])
                    .filter(Boolean);
            }
            return d ? [d] : [];
        },

        // ── Actions ──
        // Run a per-download RPC over a target list, toasting per-row failures
        // (one bad row never aborts the batch). Shared by row + bulk actions.
        async _runOnTargets(targets, fn, verb) {
            for (const t of (targets || [])) {
                try { await fn(t); }
                catch (e) { this.toast(verb + ' failed: ' + (e.message || e), 'danger'); }
            }
        },

        async pauseDl(d) {
            this.closeContextMenu();
            await this._runOnTargets(this._targets(d), (t) => this.rpc.pause(t.gid), 'Pause');
        },
        async resumeDl(d) {
            this.closeContextMenu();
            await this._runOnTargets(this._targets(d), (t) => this.rpc.unpause(t.gid), 'Resume');
        },

        // ── Bulk actions (the selection-bar buttons) — operate on selectedRows ──
        async bulkPause() { await this._runOnTargets(this.selectedRows, (t) => this.rpc.pause(t.gid), 'Pause'); },
        async bulkResume() { await this._runOnTargets(this.selectedRows, (t) => this.rpc.unpause(t.gid), 'Resume'); },
        async bulkRetry() { await this._retryTargets(this.selectedRows); },
        async bulkRemove() { await this._removeTargets(this.selectedRows); },
        async bulkRemoveAndDelete() { await this._removeAndDeleteTargets(this.selectedRows); },

        // Re-adds an errored/stopped download's original URIs as a fresh
        // download, then clears the old (errored) entry out of aria2's
        // stopped-results list so it doesn't linger duplicated in the table.
        retryDl(d) {
            this.closeContextMenu();
            return this._retryTargets(this._targets(d));
        },

        async _retryTargets(targets) {
            for (const t of (targets || [])) {
                try {
                    const uris = await this._retryUris(t);
                    if (!uris.length) {
                        this.toast('No URIs to retry for ' + this.rowName(t), 'danger');
                        continue;
                    }
                    await this.rpc.addUri(uris, { dir: t.dir || undefined });
                    await this.rpc.removeDownloadResult(t.gid).catch(() => {});
                } catch (e) {
                    this.toast('Retry failed: ' + e.message, 'danger');
                }
            }
            this._poll && this._poll();
        },

        // Pure-ish helper: which URIs a download should be retried with.
        // Prefers URIs already on the row (from the poll payload's `files`),
        // falls back to a live aria2.getUris call.
        async _retryUris(d) {
            const fromFiles = [];
            for (const f of (d.files || [])) {
                for (const u of (f.uris || [])) {
                    if (u && u.uri) fromFiles.push(u.uri);
                }
            }
            if (fromFiles.length) return fromFiles;
            try {
                const res = await this.rpc.getUris(d.gid);
                return (res || []).map((u) => u.uri).filter(Boolean);
            } catch (e) {
                return [];
            }
        },

        // Remove a download regardless of state. aria2.remove/forceRemove ONLY
        // work on active/waiting/paused; a completed or errored download must be
        // cleared with removeDownloadResult instead (calling remove on it throws
        // "GID not found" — the bug that made completed items un-removable).
        async _stopAndPurge(t) {
            const st = t && t.status;
            if (st === 'active' || st === 'waiting' || st === 'paused') {
                try { await this.rpc.remove(t.gid); }
                catch (e) { try { await this.rpc.forceRemove(t.gid); } catch (e2) { /* fall through to purge */ } }
            }
            // Purge the (now-)stopped entry. Works for complete/error/removed;
            // harmless no-op if it's already gone.
            await this.rpc.removeDownloadResult(t.gid).catch(() => {});
        },

        removeDl(d) {
            this.closeContextMenu();
            return this._removeTargets(this._targets(d));
        },

        async _removeTargets(targets) {
            if (!targets || !targets.length) return;
            const label = targets.length === 1 ? this.rowName(targets[0]) : (targets.length + ' downloads');
            const ok = await this.confirmDialog('Remove download', 'Remove ' + label + '? The download will stop; files already downloaded are kept.');
            if (!ok) return;
            for (const t of targets) {
                try {
                    await this._stopAndPurge(t);
                    delete this.downloads[t.gid];
                } catch (e) {
                    this.toast('Remove failed: ' + (e.message || e), 'danger');
                }
            }
            this.selection = new Set();
        },

        removeAndDelete(d) {
            this.closeContextMenu();
            return this._removeAndDeleteTargets(this._targets(d));
        },

        async _removeAndDeleteTargets(targets) {
            if (!targets || !targets.length) return;
            const label = targets.length === 1 ? this.rowName(targets[0]) : (targets.length + ' downloads');
            const ok = await this.confirmDialog('Remove & delete files', 'Remove ' + label + ' AND permanently delete the downloaded file(s) on disk? This cannot be undone.');
            if (!ok) return;
            for (const t of targets) {
                try {
                    let paths = [];
                    try {
                        const files = await this.rpc.getFiles(t.gid);
                        paths = (files || []).map((f) => f.path).filter(Boolean);
                    } catch (e) { /* fall through with whatever we already have */ }
                    if (!paths.length) paths = (t.files || []).map((f) => f.path).filter(Boolean);
                    await this._stopAndPurge(t);
                    delete this.downloads[t.gid];
                    if (paths.length) {
                        // `--` terminates option parsing so a torrent-controlled
                        // filename that begins with '-' can't smuggle flags into rm.
                        await FS.spawn(['rm', '-f', '--', ...paths]);
                    }
                } catch (e) {
                    this.toast('Remove & delete failed: ' + e.message, 'danger');
                }
            }
            this.selection = new Set();
        },

        async copyUri(d) {
            this.closeContextMenu();
            d = d || this.ctxMenu.target;
            if (!d) return;
            try {
                const uris = await this._retryUris(d);
                if (!uris.length) { this.toast('No URI available for this download', 'danger'); return; }
                await navigator.clipboard.writeText(uris[0]);
                this.toast('URI copied', 'success');
            } catch (e) {
                this.toast('Copy failed: ' + e.message, 'danger');
            }
        },

        async copyMagnet(d) {
            this.closeContextMenu();
            d = d || this.ctxMenu.target;
            if (!d) return;
            try {
                let magnet = '';
                if (d.bittorrent && d.bittorrent.info && d.bittorrent.info.hash) {
                    // Best-effort reconstruction when aria2 doesn't hand back the
                    // original magnet text directly (torrent already resolved).
                    magnet = 'magnet:?xt=urn:btih:' + d.bittorrent.info.hash;
                } else {
                    const uris = await this._retryUris(d);
                    magnet = uris.find((u) => u.startsWith('magnet:')) || '';
                }
                if (!magnet) { this.toast('No magnet link available for this download', 'danger'); return; }
                await navigator.clipboard.writeText(magnet);
                this.toast('Magnet link copied', 'success');
            } catch (e) {
                this.toast('Copy failed: ' + e.message, 'danger');
            }
        },

        // Detect which folder-opening Cockpit plugins are installed so the menu
        // only offers the ones actually present. Called once from init().
        async _detectFileManagers() {
            const check = async (name) => {
                const bases = ['/usr/share/cockpit/', (this.home || '') + '/.local/share/cockpit/'];
                for (const base of bases) {
                    if (!base) continue;
                    try { await FS.spawn(['test', '-d', base + name]); return true; } catch (e) { /* not here */ }
                }
                return false;
            };
            this.deepLinks = { explorer: await check('explorer'), files: await check('files') };
        },

        // The actual content FOLDER of a download (not aria2's base `dir`):
        // for a torrent that's `dir/<TorrentName>/`, for a single file it's the
        // file's own folder. Derived from the common directory of its files.
        _destFolder(d) {
            if (!d) return '';
            const files = d.files || [];
            if (files.length && window.ManifestFileTree) {
                const common = ManifestFileTree.commonDirPrefix(files.map((f) => f.path)).replace(/\/+$/, '');
                if (common) return common;
            }
            return d.dir || '';
        },

        // Deep-link into the /explorer plugin's "#open=<path>" route.
        openInExplorer(d) {
            this.closeContextMenu();
            d = d || this.ctxMenu.target;
            const path = this._destFolder(d);
            if (!path) return;
            try { window.top.location = '/explorer#open=' + encodeURIComponent(path); }
            catch (e) { this.toast('Could not open Explorer — is it installed?', 'danger'); }
        },

        // Deep-link into Cockpit's built-in Files app (cockpit-files). It routes
        // on a hash query: /files#/?path=<url-encoded absolute path>. The raw
        // "/files#<path>" form silently falls back to $HOME on any path with
        // spaces/brackets (e.g. a torrent folder), so encode it as the query.
        openInFiles(d) {
            this.closeContextMenu();
            d = d || this.ctxMenu.target;
            const path = this._destFolder(d);
            if (!path) return;
            try { window.top.location = '/files#/?path=' + encodeURIComponent(path); }
            catch (e) { this.toast('Could not open Files — is it installed?', 'danger'); }
        },
    };

    root.ManifestActions = ManifestActions;
})(typeof window !== 'undefined' ? window : globalThis);
