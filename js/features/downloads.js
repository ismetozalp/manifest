// features/downloads.js — live download view-model: polling, gid-keyed
// download map, filter buckets with counts, aggregates, row-view helpers.
// Spread-in Alpine methods/getters driving the unified table + filter pills
// + status bar in index.html (state fields `downloads`, `activeFilter`,
// `sortKey`, `sortDir` live in app.js; this module only adds behavior).
//
// Consumes: this.rpc (ManifestRpc instance, may be null pre-setup),
// this.settings (pollIntervalMs), this.toast(). Delegates formatting to
// ManifestUtil. Polling is started/stopped from app.js's init() via a
// $watch('svc.active', ...) so it never runs while aria2 isn't up.
'use strict';
(function (root) {
    const Util = root.ManifestUtil;

    // Fixed key set requested from aria2 on every poll (spec §4) — enough to
    // render every table column + row-type detection without over-fetching.
    const POLL_KEYS = [
        'gid', 'status', 'totalLength', 'completedLength', 'downloadSpeed',
        'uploadSpeed', 'files', 'dir', 'bittorrent', 'connections',
        'numSeeders', 'errorCode', 'errorMessage', 'followedBy',
    ];

    // A magnet add makes aria2 create an internal "[METADATA]" download that
    // fetches the torrent's file list, then spawns the REAL download and sets
    // followedBy on itself. That metadata entry is an implementation artifact,
    // not a user download — hide it from the list/counts.
    function isMetadataOnly(d) {
        if (!d) return false;
        if (Array.isArray(d.followedBy) && d.followedBy.length) return true;
        const f = d.files && d.files[0] && d.files[0].path;
        return !!(f && f.indexOf('[METADATA]') === 0);
    }

    const BASE_BACKOFF_MS = 1500;
    const MAX_EXTRA_BACKOFF_MS = 15000;
    const FREE_SPACE_THROTTLE_MS = 15000;

    const ManifestDownloads = {
        // ── Polling lifecycle ──
        _pollActive: false,
        _pollTimer: null,
        _pollInFlight: false,
        _pollVisHandler: null,
        _pollFailCount: 0,
        _pollFailToasted: false,
        _pollExtraDelayMs: 0,
        _freeSpaceAt: 0,
        _freeSpaceText: '',
        globalStat: {},

        startPolling() {
            if (this._pollActive) return;
            this._pollActive = true;
            this._pollFailCount = 0;
            this._pollFailToasted = false;
            this._pollExtraDelayMs = 0;
            // Pause the timer outright while the tab is hidden; resume
            // immediately (not on the next stale tick) once it's visible.
            this._pollVisHandler = () => {
                if (document.hidden) {
                    if (this._pollTimer) { clearTimeout(this._pollTimer); this._pollTimer = null; }
                } else if (this._pollActive && !this._pollTimer && !this._pollInFlight) {
                    this._pollTick();
                }
            };
            document.addEventListener('visibilitychange', this._pollVisHandler);
            if (!document.hidden) this._pollTick();
        },

        stopPolling() {
            this._pollActive = false;
            this._pollInFlight = false;
            if (this._pollTimer) { clearTimeout(this._pollTimer); this._pollTimer = null; }
            if (this._pollVisHandler) {
                document.removeEventListener('visibilitychange', this._pollVisHandler);
                this._pollVisHandler = null;
            }
        },

        // Re-entry guard: _pollTimer is null for the whole duration of an
        // in-flight _poll() (it's only (re-)set inside the .finally() below),
        // so a visibilitychange (hide→show) firing mid-request used to pass
        // the `!this._pollTimer` guard above and spawn a SECOND concurrent
        // poll chain — each with its own .finally()-scheduled setTimeout,
        // silently doubling/tripling the effective poll rate for the rest of
        // the session. _pollInFlight closes that window explicitly.
        _pollTick() {
            if (this._pollInFlight) return;
            this._pollInFlight = true;
            this._poll().finally(() => {
                this._pollInFlight = false;
                if (!this._pollActive || document.hidden) return;
                const base = (this.settings && this.settings.pollIntervalMs) || BASE_BACKOFF_MS;
                this._pollTimer = setTimeout(() => {
                    this._pollTimer = null;
                    this._pollTick();
                }, base + this._pollExtraDelayMs);
            });
        },

        async _poll() {
            if (!this.rpc) return;
            try {
                const results = await this.rpc.batch([
                    { method: 'aria2.tellActive', params: [POLL_KEYS] },
                    { method: 'aria2.tellWaiting', params: [0, 1000, POLL_KEYS] },
                    { method: 'aria2.tellStopped', params: [0, 1000, POLL_KEYS] },
                    { method: 'aria2.getGlobalStat', params: [] },
                ]);
                const [active, waiting, stopped, globalStat] = results;
                this._mergeDownloads([].concat(active || [], waiting || [], stopped || []));
                this.globalStat = globalStat || {};
                this._pollFailCount = 0;
                this._pollExtraDelayMs = 0;
                this._pollFailToasted = false;
                this._refreshFreeSpace(); // fire-and-forget, throttled
            } catch (e) {
                // Back off (doubling, capped) and keep the last-known data —
                // never blank the UI just because one poll failed.
                this._pollFailCount++;
                this._pollExtraDelayMs = Math.min(
                    (this._pollExtraDelayMs || BASE_BACKOFF_MS) * 2, MAX_EXTRA_BACKOFF_MS);
                if (!this._pollFailToasted) {
                    this.toast('Lost contact with aria2 — retrying…', 'danger');
                    this._pollFailToasted = true;
                }
            }
        },

        // Reconciles this.downloads (gid-keyed) with a fresh poll result:
        // mutates existing row objects in place (stable references → stable
        // Alpine-keyed rows, no row-recreate flicker) and drops gids that no
        // longer appear in active/waiting/stopped (removed/purged).
        _mergeDownloads(list) {
            const seen = new Set();
            for (const d of list) {
                if (!d || !d.gid) continue;
                if (isMetadataOnly(d)) continue;   // skip aria2's internal magnet-metadata download
                seen.add(d.gid);
                const existing = this.downloads[d.gid];
                if (existing) Object.assign(existing, d);
                else this.downloads[d.gid] = d;
            }
            for (const gid of Object.keys(this.downloads)) {
                if (!seen.has(gid)) delete this.downloads[gid];
            }
        },

        async _refreshFreeSpace() {
            const dest = this.settings && this.settings.destinations && this.settings.destinations.default;
            if (!dest) { this._freeSpaceText = ''; return; }
            const now = Date.now();
            if (this._freeSpaceAt && (now - this._freeSpaceAt) < FREE_SPACE_THROTTLE_MS) return;
            this._freeSpaceAt = now;
            try {
                const out = await FS.spawn(['df', '-h', '--output=avail', dest]);
                const lines = String(out).trim().split('\n');
                this._freeSpaceText = (lines[1] || '').trim();
            } catch (e) {
                // Leave the last-known value — not critical enough to toast.
            }
        },

        // ── Filter buckets ──
        bucket(d) {
            const status = d && d.status;
            if (status === 'active' || status === 'waiting' || status === 'paused'
                || status === 'complete' || status === 'error') return status;
            return 'error'; // e.g. aria2's 'removed' — surface rather than hide
        },

        get counts() {
            const c = { all: 0, active: 0, waiting: 0, paused: 0, complete: 0, error: 0 };
            c.queue = (this.queue && this.queue.items && this.queue.items.length) || 0; // Phase 5 staging list
            for (const gid in this.downloads) {
                const d = this.downloads[gid];
                c.all++;
                const b = this.bucket(d);
                if (c[b] != null) c[b]++;
            }
            return c;
        },

        get visibleDownloads() {
            let list;
            if (this.activeFilter === 'queue') {
                list = []; // Phase 5 staging queue is a distinct list, not aria2 downloads
            } else if (!this.activeFilter || this.activeFilter === 'all') {
                list = Object.values(this.downloads);
            } else {
                list = Object.values(this.downloads).filter((d) => this.bucket(d) === this.activeFilter);
            }
            const key = this.sortKey || 'name';
            const dir = this.sortDir === 'desc' ? -1 : 1;
            return list.slice().sort((a, b) => {
                const av = this._sortVal(a, key);
                const bv = this._sortVal(b, key);
                if (av < bv) return -1 * dir;
                if (av > bv) return 1 * dir;
                return 0;
            });
        },

        _sortVal(d, key) {
            if (key === 'size') return Number(d.totalLength) || 0;
            return (this.rowName(d) || '').toLowerCase(); // 'name' + fallback
        },

        sortBy(key) {
            if (this.sortKey === key) {
                this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                this.sortKey = key;
                this.sortDir = 'asc';
            }
        },

        // ── Aggregates ──
        get agg() {
            const g = this.globalStat || {};
            return {
                down: Util.humanSpeed(g.downloadSpeed || 0),
                up: Util.humanSpeed(g.uploadSpeed || 0),
                active: Number(g.numActive) || 0,
                freeSpace: this._freeSpaceText || '',
            };
        },

        // ── Row view helpers ──
        rowName(d) {
            if (!d) return '';
            if (d.bittorrent && d.bittorrent.info && d.bittorrent.info.name) return d.bittorrent.info.name;
            const f = d.files && d.files[0];
            if (f && f.path) return Util.basename(f.path);
            if (f && f.uris && f.uris[0] && f.uris[0].uri) return Util.basename(f.uris[0].uri);
            return d.gid || '';
        },

        // Torrent metadata isn't known until aria2 resolves it, so a magnet
        // still fetching metadata (totalLength 0) reads 🧲; once files are
        // known it's a torrent ⛴; anything without a `bittorrent` key is
        // plain HTTP/FTP/Metalink 🌐.
        rowType(d) {
            if (!d) return '🌐';
            if (d.bittorrent) return (Number(d.totalLength) > 0) ? '⛴' : '🧲';
            return '🌐';
        },

        rowProgress(d) {
            if (!d) return 0;
            return Util.percent(d.completedLength, d.totalLength);
        },

        rowEta(d) {
            if (!d) return '∞';
            if (d.status === 'complete') return '—';
            const remaining = (Number(d.totalLength) || 0) - (Number(d.completedLength) || 0);
            return Util.eta(remaining, d.downloadSpeed);
        },
    };

    root.ManifestDownloads = ManifestDownloads;
})(typeof window !== 'undefined' ? window : globalThis);
