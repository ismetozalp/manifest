// features/detail.js — torrent/download detail view: a horizontal
// General/Files/Peers/Trackers Bootstrap tab strip inside a modal (per the
// no-sidebar rule — detail is a modal/inline panel, never a side rail).
// Spread-in Alpine state/methods driving html/modals/detail.html.
//
// Consumes: this.rpc (tellStatus/getFiles/getPeers/getServers/changeOption),
// ManifestUtil (humanSize/humanSpeed/eta/percent/selectFileCsv).
//
// Polling is DETAIL-SCOPED and tab-scoped: opening the dialog polls only the
// currently active tab's data (not all four) at ~1.5s, switching tabs fetches
// immediately and continues polling the new tab, and the poll pauses when the
// dialog is closed or the browser tab is hidden (same pattern as
// features/downloads.js's table-wide poll, but independent of it — the table
// poll keeps running underneath so rows stay live too).
'use strict';
(function (root) {
    const Util = root.ManifestUtil;
    const Sorting = root.ManifestSorting;

    const DETAIL_POLL_MS = 1500;
    const DETAIL_MIN_VH = 20, DETAIL_MAX_VH = 90, DETAIL_DEFAULT_VH = 50;

    // Peer-id → client name decode lives in core/peerid.js (byte-wise percent
    // decode + Azureus-style parse), so it's unit-tested and can't regress to
    // showing percent-escaped gibberish for non-UTF-8 peer ids.
    const decodePeerId = root.ManifestPeerId.decodePeerId;

    // Sort key for a peer address: zero-pad IPv4 octets so 9.x sorts before
    // 103.x numerically; non-IPv4 (IPv6/hostname) falls back to string order.
    function ipSortKey(ip) {
        const s = String(ip || '');
        const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
        return m ? m.slice(1).map((n) => String(n).padStart(3, '0')).join('.') : s;
    }

    // Counts set bits across an aria2 `bitfield` hex string — used as a
    // best-effort per-peer completion estimate (aria2 doesn't hand back a
    // ready-made peer progress percentage). `totalPieces`, when known (from
    // the General tab's last tellStatus), gives an exact denominator; without
    // it we fall back to the bitfield's own bit-length (padding bits included,
    // so this slightly under/overstates — good enough for a rough indicator).
    const POPCOUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
    function peerProgress(bitfield, totalPieces) {
        if (!bitfield) return null;
        let set = 0;
        for (let i = 0; i < bitfield.length; i++) {
            const v = parseInt(bitfield[i], 16);
            if (!Number.isNaN(v)) set += POPCOUNT[v];
        }
        const denom = totalPieces > 0 ? totalPieces : bitfield.length * 4;
        if (!denom) return null;
        return Math.min(100, Math.floor((set / denom) * 100));
    }

    // Flattens BitTorrent announce tiers (tellStatus.bittorrent.announceList)
    // and aria2's HTTP/FTP file-server list (getServers) into one list for
    // the Trackers tab — torrents show tracker tiers, plain HTTP/FTP/metalink
    // downloads show which server they're currently pulling from (spec: BT
    // via announce list, HTTP via getServers).
    function buildTrackers(status, servers) {
        const list = [];
        const bt = status && status.bittorrent;
        if (bt && Array.isArray(bt.announceList)) {
            bt.announceList.forEach((tier, ti) => {
                (tier || []).forEach((url) => list.push({ kind: 'tracker', tier: ti + 1, url }));
            });
        }
        (servers || []).forEach((entry) => {
            (entry.servers || []).forEach((s) => list.push({
                kind: 'server', tier: null, url: s.uri, currentUri: s.currentUri,
                downloadSpeed: Number(s.downloadSpeed) || 0,
            }));
        });
        return list;
    }

    function freshDetail() {
        return {
            open: false, gid: null, tab: 'general',
            data: {}, files: [], peers: [], trackers: [],
            fileTree: [], selectedIndices: new Set(), collapsed: new Set(), _selGid: null,
            loading: false, error: '',
            peerSort: null, trackerSort: null,
        };
    }

    const ManifestDetail = {
        detailModalEl: null,
        detail: freshDetail(),
        // Every open detail SESSION shown as a chip in the permanent bottom
        // taskbar: [{ gid, name }]. The focused one (detail.gid while
        // detail.open) is shown in the docked panel and highlighted.
        minimizedDetails: [],
        detailHeight: DETAIL_DEFAULT_VH,   // docked-panel height in vh (persisted)
        _dismissedDetails: null,           // gids the user closed → no auto-reopen
        _autoSeen: null,                   // gids already seen active (auto-open dedupe)
        _autoOpenPrimed: false,            // baseline set on the first poll
        _detailPollTimer: null,
        _detailPollInFlight: false,
        _detailVisHandler: null,

        // Restore taskbar sessions + panel height from settings.yml (survives
        // re-login). Stale sessions (download gone) are pruned once downloads
        // are polled. Called from init() after settings load.
        _restoreMinimized() {
            const s = this.settings || {};
            this.minimizedDetails = ((s.minimizedDetails) || []).map((m) => ({ gid: m.gid, name: m.name }));
            const h = Number(s.detailHeight);
            if (Number.isFinite(h)) this.detailHeight = Math.max(DETAIL_MIN_VH, Math.min(DETAIL_MAX_VH, h));
            this._dismissedDetails = new Set();
            this._autoSeen = new Set();
        },

        _persistMinimized() {
            this.settings.minimizedDetails = this.minimizedDetails.map((m) => ({ gid: m.gid, name: m.name }));
            this.saveSettings();
        },

        // Ensure a taskbar chip exists for gid (keeping its name fresh).
        _ensureSession(gid, name) {
            const existing = this.minimizedDetails.find((m) => m.gid === gid);
            if (existing) {
                if (name && existing.name !== name) { existing.name = name; this._persistMinimized(); }
                return;
            }
            this.minimizedDetails.push({ gid, name: name || gid });
            this._persistMinimized();
        },

        // Show a session in the docked panel + start its poll.
        _showDetail(gid) {
            this.detail = Object.assign(freshDetail(), { open: true, gid });
            this._detailStartPoll();
        },

        // ── Row action: "Details" (context menu / row caret / selection bar) ──
        openDetail(d) {
            this.closeContextMenu && this.closeContextMenu();
            if (!d || !d.gid) return;
            this._ensureSession(d.gid, this.rowName(d) || d.gid);
            if (this._dismissedDetails) this._dismissedDetails.delete(d.gid);
            this._showDetail(d.gid);
        },

        // Taskbar chip click: toggle focus/collapse; drop a chip whose download
        // is gone (removing is OK).
        restoreDetail(gid) {
            if (this.detail.open && this.detail.gid === gid) { this.minimizeDetail(); return; }
            if (!this.downloads[gid]) {
                this.closeMinimized(gid);
                this.toast('That download is no longer available', 'danger');
                return;
            }
            this._showDetail(gid);
        },

        // Minimize: collapse the panel but keep the session chip in the taskbar.
        minimizeDetail() {
            this.detail.open = false;
            this._detailStopPoll();
        },

        // Close: remove the session (chip) and collapse the panel; a still-active
        // download won't auto-reopen (dismissed).
        closeDetail() {
            const gid = this.detail && this.detail.gid;
            if (gid) this.closeMinimized(gid);
            this.detail.open = false;
            this._detailStopPoll();
        },

        // Dismiss a session chip (× on the chip, or via closeDetail).
        closeMinimized(gid) {
            this.minimizedDetails = this.minimizedDetails.filter((m) => m.gid !== gid);
            this._persistMinimized();
            if (this._dismissedDetails) this._dismissedDetails.add(gid);
            if (this.detail.open && this.detail.gid === gid) { this.detail.open = false; this._detailStopPoll(); }
        },

        // Auto-open the detail panel for downloads that have JUST started
        // downloading. Called from the table poll (_mergeDownloads). The first
        // poll only primes the baseline so pre-existing actives don't all pop
        // open on load; afterwards a gid newly turning 'active' auto-opens (and
        // gets a taskbar chip — so several starting at once are all "open").
        _autoOpenActive() {
            if (!this._autoSeen) this._autoSeen = new Set();
            if (!this._dismissedDetails) this._dismissedDetails = new Set();
            // Only downloads that are actually DOWNLOADING (active and not yet
            // complete) — a seeding torrent is 'active' in aria2 but shouldn't
            // pop its detail open.
            const isActive = (g) => {
                const x = this.downloads[g];
                return x && x.status === 'active' && (Number(x.completedLength) || 0) < (Number(x.totalLength) || 0);
            };
            const active = Object.keys(this.downloads).filter(isActive);
            if (!this._autoOpenPrimed) {
                active.forEach((g) => this._autoSeen.add(g));
                this._autoOpenPrimed = true;
                return;
            }
            for (const gid of active) {
                if (this._autoSeen.has(gid)) continue;
                this._autoSeen.add(gid);
                if (this._dismissedDetails.has(gid)) continue;   // user closed it
                this._ensureSession(gid, this.rowName(this.downloads[gid]) || gid);
                this._showDetail(gid);                            // focus the newest
            }
            // forget gids no longer active so a later re-activation re-triggers
            for (const g of Array.from(this._autoSeen)) if (!this.downloads[g]) this._autoSeen.delete(g);
        },

        // ── Docked-panel resize (drag the top grip up/down) ──
        startDetailResize(ev) {
            ev.preventDefault();
            const startY = ev.clientY;
            const startH = this.detailHeight;
            const vh = window.innerHeight || 1;
            const onMove = (e) => {
                const dvh = ((startY - e.clientY) / vh) * 100;   // drag up → taller
                this.detailHeight = Math.max(DETAIL_MIN_VH, Math.min(DETAIL_MAX_VH, Math.round((startH + dvh) * 10) / 10));
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                document.body.classList.remove('mf-ns-resizing');
                this.settings.detailHeight = this.detailHeight;
                this.saveSettings();
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            document.body.classList.add('mf-ns-resizing');
        },

        // ── Peers / Trackers sorting (detail-scoped) ──
        detailSortPeers(key) { this.detail.peerSort = Sorting.nextSort(this.detail.peerSort, key); },
        detailSortTrackers(key) { this.detail.trackerSort = Sorting.nextSort(this.detail.trackerSort, key); },
        detailSortInd(which, key) {
            return Sorting.indicator(which === 'peers' ? this.detail.peerSort : this.detail.trackerSort, key);
        },
        get detailPeersSorted() {
            return Sorting.sortRows(this.detail.peers, this.detail.peerSort, {
                ip: (p) => ipSortKey(p.ip),
                client: (p) => String(p.client || '').toLowerCase(),
                down: (p) => Number(p.downloadSpeed) || 0,
                up: (p) => Number(p.uploadSpeed) || 0,
                progress: (p) => (p.progress == null ? -1 : Number(p.progress)),
            });
        },
        get detailTrackersSorted() {
            return Sorting.sortRows(this.detail.trackers, this.detail.trackerSort, {
                tier: (t) => (t.tier == null ? Infinity : Number(t.tier)),
                url: (t) => String(t.url || '').toLowerCase(),
                speed: (t) => Number(t.downloadSpeed) || 0,
            });
        },

        detailSwitchTab(tab) {
            if (this.detail.tab === tab) return;
            this.detail.tab = tab;
            this._detailFetchActiveTab();
        },

        // ── Poll lifecycle (detail-scoped, tab-scoped, pauses on close/hidden) ──
        _detailStartPoll() {
            this._detailStopPoll();
            this._detailVisHandler = () => {
                if (document.hidden) {
                    if (this._detailPollTimer) { clearTimeout(this._detailPollTimer); this._detailPollTimer = null; }
                } else if (this.detail.open && !this._detailPollTimer && !this._detailPollInFlight) {
                    this._detailTick();
                }
            };
            document.addEventListener('visibilitychange', this._detailVisHandler);
            if (!document.hidden) this._detailTick();
        },

        _detailStopPoll() {
            this._detailPollInFlight = false;
            if (this._detailPollTimer) { clearTimeout(this._detailPollTimer); this._detailPollTimer = null; }
            if (this._detailVisHandler) {
                document.removeEventListener('visibilitychange', this._detailVisHandler);
                this._detailVisHandler = null;
            }
        },

        // Re-entry guard (same pattern/reasoning as features/downloads.js's
        // table-wide poll): _detailPollTimer sits null for the whole
        // duration of an in-flight fetch, so a hide→show visibilitychange
        // mid-request could otherwise start a second concurrent poll chain.
        _detailTick() {
            if (this._detailPollInFlight) return;
            this._detailPollInFlight = true;
            this._detailFetchActiveTab().finally(() => {
                this._detailPollInFlight = false;
                if (!this.detail.open || document.hidden) return;
                this._detailPollTimer = setTimeout(() => {
                    this._detailPollTimer = null;
                    this._detailTick();
                }, DETAIL_POLL_MS);
            });
        },

        async _detailFetchActiveTab() {
            if (!this.detail.open || !this.detail.gid || !this.rpc) return;
            const gid = this.detail.gid;
            const tab = this.detail.tab;
            try {
                if (tab === 'general') {
                    const s = await this.rpc.tellStatus(gid);
                    if (this.detail.gid === gid) this.detail.data = s || {};
                } else if (tab === 'files') {
                    const files = await this.rpc.getFiles(gid);
                    if (this.detail.gid === gid) {
                        this.detail.files = (files || []).map((f, i) => ({
                            index: Number(f.index) || (i + 1), path: f.path,
                            length: Number(f.length) || 0,
                            completedLength: Number(f.completedLength) || 0,
                            selected: f.selected !== 'false',
                        }));
                        this.detail.fileTree = ManifestFileTree.build(files || []).nodes;
                        // Seed the selection set from aria2 ONCE per download; after
                        // that the user's checkbox toggles drive it (each applied via
                        // changeOption, so aria2's own state stays in agreement).
                        if (this.detail._selGid !== gid) {
                            this.detail._selGid = gid;
                            this.detail.selectedIndices = new Set(this.detail.files.filter((f) => f.selected).map((f) => f.index));
                            this.detail.collapsed = new Set();
                        }
                    }
                } else if (tab === 'peers') {
                    const totalPieces = Number(this.detail.data && this.detail.data.numPieces) || 0;
                    // getPeers only works while the download is ACTIVE; a completed
                    // or stopped torrent makes aria2 return "Bad Request". Treat that
                    // as "no peers" (same as getServers below) rather than surfacing
                    // a refresh error on every ~1.5s poll of a finished torrent.
                    const peers = await this.rpc.getPeers(gid).catch(() => []);
                    if (this.detail.gid === gid) {
                        this.detail.peers = (peers || []).map((p) => ({
                            ip: p.ip, port: p.port, client: decodePeerId(p.peerId),
                            downloadSpeed: Number(p.downloadSpeed) || 0,
                            uploadSpeed: Number(p.uploadSpeed) || 0,
                            seeder: p.seeder === 'true',
                            progress: peerProgress(p.bitfield, totalPieces),
                        }));
                    }
                } else if (tab === 'trackers') {
                    const [status, servers] = await Promise.all([
                        this.rpc.tellStatus(gid, ['bittorrent']),
                        this.rpc.getServers(gid).catch(() => []),
                    ]);
                    if (this.detail.gid === gid) this.detail.trackers = buildTrackers(status, servers);
                }
                this.detail.error = '';
            } catch (e) {
                this.detail.error = 'Could not refresh: ' + ((e && e.message) || e);
            }
        },

        // ── General tab derived view helpers ──
        detailName() { return this.rowName(this.detail.data); },
        detailProgress() { return Util.percent(this.detail.data.completedLength, this.detail.data.totalLength); },
        detailEta() {
            const d = this.detail.data;
            if (d.status === 'complete') return '—';
            const remaining = (Number(d.totalLength) || 0) - (Number(d.completedLength) || 0);
            return Util.eta(remaining, d.downloadSpeed);
        },
        detailRatio() {
            const up = Number(this.detail.data.uploadLength) || 0;
            const done = Number(this.detail.data.completedLength) || 0;
            if (!done) return '0.00';
            return (up / done).toFixed(2);
        },

        // ── Files tab: editable per-file selection. Applies immediately on
        // toggle (rpc.changeOption select-file) rather than a batched Apply,
        // so the ~1.5s poll simply re-confirms aria2's own authoritative
        // state next tick. Guard: aria2 rejects an empty selection — revert
        // the toggle and refuse rather than submit it (spec §7).
        async detailToggleFile(f) {
            const cfg = this.detail;
            const selected = new Set(cfg.files.filter((x) => x.selected).map((x) => x.index));
            if (!selected.size) {
                f.selected = true; // revert — at least one file must stay selected
                this.toast('At least one file must be selected.', 'danger');
                return;
            }
            try {
                await this.rpc.changeOption(cfg.gid, { 'select-file': Util.selectFileCsv(selected, cfg.files.length) });
            } catch (e) {
                f.selected = !f.selected; // revert on failure
                this.toast('Could not update file selection: ' + ((e && e.message) || e), 'danger');
            }
        },

        detailFileProgress(f) { return Util.percent(f.completedLength, f.length); },

        // ── File-selection as a collapsible checkbox TREE ──
        // detailTreeRows flattens the folder tree into indented display rows,
        // hiding the children of collapsed folders (Alpine has no recursive
        // template, so we flatten with a depth for padding).
        get detailTreeRows() {
            const rows = [];
            const collapsed = this.detail.collapsed || new Set();
            const walk = (nodes, depth, prefix) => {
                for (const n of nodes) {
                    const key = prefix + '/' + n.name;
                    const isCollapsed = n.dir && collapsed.has(key);
                    rows.push({ node: n, depth, key, collapsed: isCollapsed });
                    if (n.dir && !isCollapsed) walk(n.children, depth + 1, key);
                }
            };
            walk(this.detail.fileTree || [], 0, '');
            return rows;
        },
        detailToggleFolder(key) {
            const c = new Set(this.detail.collapsed || []);
            if (c.has(key)) c.delete(key); else c.add(key);
            this.detail.collapsed = c;                 // reassign — Alpine doesn't track Set mutations
        },
        detailFolderState(node) {
            return ManifestFileTree.folderState(node, this.detail.selectedIndices || new Set());
        },
        detailFileChecked(node) {
            return (this.detail.selectedIndices || new Set()).has(node.index);
        },
        detailToggleTreeFile(node) {
            const sel = new Set(this.detail.selectedIndices || []);
            if (sel.has(node.index)) sel.delete(node.index); else sel.add(node.index);
            this._detailApplySelection(sel);
        },
        detailToggleTreeFolder(node) {
            const sel = new Set(this.detail.selectedIndices || []);
            if (ManifestFileTree.folderState(node, sel) === 'all') node.indices.forEach((i) => sel.delete(i));
            else node.indices.forEach((i) => sel.add(i));
            this._detailApplySelection(sel);
        },
        detailSelectAllFiles(on) {
            const all = ManifestFileTree.allIndices(this.detail.fileTree || []);
            this._detailApplySelection(new Set(on ? all : []));
        },
        // Apply a new selection set: optimistic UI update, then changeOption; on
        // failure revert. aria2 refuses an empty selection, so guard it.
        async _detailApplySelection(sel) {
            if (!sel.size) { this.toast('At least one file must be selected.', 'danger'); return; }
            const prev = this.detail.selectedIndices;
            this.detail.selectedIndices = sel;
            try {
                const total = ManifestFileTree.allIndices(this.detail.fileTree || []).length;
                await this.rpc.changeOption(this.detail.gid, { 'select-file': Util.selectFileCsv(sel, total) });
                (this.detail.files || []).forEach((f) => { f.selected = sel.has(f.index); });
            } catch (e) {
                this.detail.selectedIndices = prev;
                this.toast('Could not change file selection: ' + ((e && e.message) || e), 'danger');
            }
        },
    };

    root.ManifestDetail = ManifestDetail;
})(typeof window !== 'undefined' ? window : globalThis);
