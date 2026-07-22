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
        async pauseDl(d) {
            this.closeContextMenu();
            for (const t of this._targets(d)) {
                try { await this.rpc.pause(t.gid); }
                catch (e) { this.toast('Pause failed: ' + e.message, 'danger'); }
            }
        },

        async resumeDl(d) {
            this.closeContextMenu();
            for (const t of this._targets(d)) {
                try { await this.rpc.unpause(t.gid); }
                catch (e) { this.toast('Resume failed: ' + e.message, 'danger'); }
            }
        },

        // Re-adds an errored/stopped download's original URIs as a fresh
        // download, then clears the old (errored) entry out of aria2's
        // stopped-results list so it doesn't linger duplicated in the table.
        async retryDl(d) {
            this.closeContextMenu();
            for (const t of this._targets(d)) {
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

        async removeDl(d) {
            this.closeContextMenu();
            const targets = this._targets(d);
            if (!targets.length) return;
            const label = targets.length === 1 ? this.rowName(targets[0]) : (targets.length + ' downloads');
            const ok = await this.confirmDialog('Remove download', 'Remove ' + label + '? The download will stop; files already downloaded are kept.');
            if (!ok) return;
            for (const t of targets) {
                try {
                    try { await this.rpc.remove(t.gid); }
                    catch (e) { await this.rpc.forceRemove(t.gid); }
                    await this.rpc.removeDownloadResult(t.gid).catch(() => {});
                    delete this.downloads[t.gid];
                } catch (e) {
                    this.toast('Remove failed: ' + e.message, 'danger');
                }
            }
            this.selection = new Set();
        },

        async removeAndDelete(d) {
            this.closeContextMenu();
            const targets = this._targets(d);
            if (!targets.length) return;
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
                    try { await this.rpc.remove(t.gid); }
                    catch (e) { await this.rpc.forceRemove(t.gid); }
                    await this.rpc.removeDownloadResult(t.gid).catch(() => {});
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

        // Deep-links into the /explorer plugin's own "#open=<path>" hash
        // route, if it's installed. Guarded — explorer may not be present.
        openInExplorer(d) {
            this.closeContextMenu();
            d = d || this.ctxMenu.target;
            if (!d || !d.dir) return;
            try {
                window.top.location = '/explorer#open=' + encodeURIComponent(d.dir);
            } catch (e) {
                this.toast('Could not open Explorer — is it installed?', 'danger');
            }
        },
    };

    root.ManifestActions = ManifestActions;
})(typeof window !== 'undefined' ? window : globalThis);
