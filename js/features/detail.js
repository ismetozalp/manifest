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

    const DETAIL_POLL_MS = 1500;

    // Best-effort Azureus-style ("-XX####-...") peer-id → client name decode.
    // aria2's getPeers() hands back percent-encoded peer IDs; unknown/garbled
    // IDs just fall back to a truncated raw string rather than erroring.
    const CLIENT_CODES = {
        UT: 'µTorrent', TR: 'Transmission', DE: 'Deluge', LT: 'libtorrent',
        qB: 'qBittorrent', AZ: 'Vuze/Azureus', BC: 'BitComet', KT: 'KTorrent',
        RS: 'Rufus', WW: 'WebTorrent', A2: 'aria2', LP: 'libtorrent (Rasterbar)',
        BT: 'BitTorrent', SD: 'Xunlei', XL: 'Xunlei', TS: 'TorrentStorm',
    };
    function decodePeerId(peerId) {
        if (!peerId) return '';
        let raw = peerId;
        try { raw = decodeURIComponent(peerId); } catch (e) { /* leave as-is */ }
        const m = /^-([A-Za-z]{2})(\d{4})-/.exec(raw);
        if (m) return (CLIENT_CODES[m[1]] || m[1]) + ' ' + m[2].split('').join('.');
        return raw.replace(/[^\x20-\x7e]/g, '.').slice(0, 20);
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
        };
    }

    const ManifestDetail = {
        detailModalEl: null,
        detail: freshDetail(),
        _detailPollTimer: null,
        _detailPollInFlight: false,
        _detailVisHandler: null,

        // ── Row action: "Details" (context menu item + a caret on torrent
        // rows in index.html) ──
        openDetail(d) {
            this.closeContextMenu && this.closeContextMenu();
            if (!d || !d.gid) return;
            this.detail = Object.assign(freshDetail(), { open: true, gid: d.gid });
            bootstrap.Modal.getOrCreateInstance(this.detailModalEl).show();
            this._detailStartPoll();
        },

        closeDetail() {
            this.detail.open = false;
            this._detailStopPoll();
            bootstrap.Modal.getOrCreateInstance(this.detailModalEl).hide();
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
