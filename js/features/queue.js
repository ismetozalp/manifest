// features/queue.js — Paste-to-Queue staging list + persistence (queue.json).
// Spread-in Alpine state/methods driving the Queue filter-pill view in
// index.html and the #mfPaste markup in html/modals/paste.html (state
// `queue` lives here, per the "declare state on its own module" rule —
// composeData keeps getters/state live). Configure-on-Start (the per-item
// destination + file-select + magnet metadata-fetch flow) is split out into
// features/configure.js to keep this file under the size cap — both share
// `this.queue` (in particular `queue.configuring`, owned/nulled by
// configure.js) since composeData merges every module onto one `this`.
//
// MIXED SOURCES ARE FIRST-CLASS: a paste may freely interleave magnets,
// http/ftp URLs, metalink URLs, and (via drag-drop) local .torrent files —
// each line/file is classified independently via ManifestQueueModel
// (-> ManifestDetect.classify per line); there is no "this batch is all
// torrents" mode. The paste preview shows every line/file's detected type.
//
// PERSISTENCE: the staging queue round-trips through
// ~/.config/cockpit/manifest/queue.json (FS.readText/writeText +
// ManifestQueueModel.serialize/deserialize) so it survives page reloads and
// Cockpit restarts — this works even while aria2 itself is not running.
//
// Consumes: ManifestQueueModel, ManifestDetect, FS, this.rpc, this.settings/
// pushRecent (ManifestSettings), this._fileToBase64 (ManifestQuickAdd — same
// FileReader→base64 helper, Bridge Lesson #2: base64-inside-JSON, never raw
// binary), this._poll/_pollActive (ManifestDownloads).
'use strict';
(function (root) {
    const Util = root.ManifestUtil;
    const Detect = root.ManifestDetect;
    const QM = root.ManifestQueueModel;

    function freshQueue() {
        return {
            items: [],          // persisted staged items (queue.json)
            pasteText: '',       // #mfPaste textarea
            pasteTorrents: [],   // [{name,size,b64,error}] attached via drag-drop/Browse
            pasteError: '',
            dragOver: false,
            configuring: null,   // Configure-on-Start dialog state — owned by features/configure.js
        };
    }

    const ManifestQueue = {
        pasteModalEl: null,
        queue: freshQueue(),
        _queueSaveTimer: null,

        // ── Persistence (spec §6.2, §14) ──
        _queueDir() { return Util.joinPath(Util.joinPath(this.home, '.config'), 'cockpit/manifest'); },
        _queuePath() { return Util.joinPath(this._queueDir(), 'queue.json'); },

        async _loadQueue() {
            try {
                const text = await FS.readText(this._queuePath());
                this.queue.items = QM.deserialize(text);
            } catch (e) {
                this.queue.items = []; // no queue.json yet, or unreadable — start empty, never throw
            }
        },

        _saveQueue() {
            if (this._queueSaveTimer) clearTimeout(this._queueSaveTimer);
            this._queueSaveTimer = setTimeout(() => {
                this._queueSaveTimer = null;
                this._writeQueueJson().catch((e) => console.error('[manifest] save queue failed:', e));
            }, 400);
        },

        async _writeQueueJson() {
            await FS.mkdir(this._queueDir());
            await FS.writeText(this._queuePath(), QM.serialize(this.queue.items));
        },

        // ── Type icon (queue list, paste preview, configure header) ──
        qIcon(type) {
            if (type === 'magnet') return '🧲';
            if (type === 'torrent') return '⛴';
            if (type === 'metalink') return '📋';
            if (type === 'http') return '🌐';
            return '❔';
        },

        // ── Paste modal ──
        openPaste() {
            this.queue.pasteText = '';
            this.queue.pasteTorrents = [];
            this.queue.pasteError = '';
            this.queue.dragOver = false;
            bootstrap.Modal.getOrCreateInstance(this.pasteModalEl).show();
        },

        // Live preview of every line + attached .torrent file, each
        // classified independently — this is what makes the mixed-source
        // paste (magnet + http + metalink + torrent, all at once) visible to
        // the user before anything is staged.
        get pastePreview() {
            const lines = Detect.parseLines(this.queue.pasteText)
                .map((l) => ({ raw: l.raw, type: l.type, kind: 'line' }));
            const torrents = (this.queue.pasteTorrents || [])
                .map((t, i) => ({ raw: t.name, type: t.error ? 'unknown' : 'torrent', kind: 'torrent', idx: i }));
            return lines.concat(torrents);
        },

        _pasteDrop(ev) {
            this.queue.dragOver = false;
            this._pasteAddTorrentFiles((ev.dataTransfer && ev.dataTransfer.files) || []);
        },

        _pasteFiles(ev) {
            this._pasteAddTorrentFiles(ev.target.files || []);
            ev.target.value = ''; // allow re-picking the same filename later
        },

        async _pasteAddTorrentFiles(fileList) {
            for (const file of Array.from(fileList)) {
                if (!/\.torrent$/i.test(file.name)) continue;
                const entry = { name: file.name, size: file.size, b64: '', error: '' };
                this.queue.pasteTorrents.push(entry);
                try {
                    entry.b64 = await this._fileToBase64(file); // from ManifestQuickAdd
                } catch (e) {
                    entry.error = 'Could not read file: ' + ((e && e.message) || e);
                }
            }
        },

        _pasteRemoveTorrent(idx) {
            this.queue.pasteTorrents.splice(idx, 1);
        },

        // Parses pasted lines + attached torrent files, drops invalid/unknown
        // entries, merges into the persisted queue (existing entries win on
        // dedupe-by-value), and saves. Nothing is handed to aria2 here.
        confirmPaste() {
            this.queue.pasteError = '';
            const textItems = QM.fromPaste(this.queue.pasteText).filter(QM.validate);
            const torrentItems = (this.queue.pasteTorrents || [])
                .filter((t) => !t.error && t.b64)
                .map((t) => QM.makeItem(t.name, t.b64));
            const incoming = QM.addAll([], textItems.concat(torrentItems));
            if (!incoming.length) {
                this.queue.pasteError = 'Nothing valid to add — paste a magnet/URL/metalink or attach a .torrent file.';
                return;
            }
            this.queue.items = QM.addAll(this.queue.items, incoming);
            this._saveQueue();
            this.toast(incoming.length + ' item(s) added to the queue.', 'success');
            bootstrap.Modal.getOrCreateInstance(this.pasteModalEl).hide();
        },

        // ── Queue view actions (per-item + bulk) ──
        removeItem(item) {
            this.queue.items = QM.removeById(this.queue.items, item.id);
            this._saveQueue();
        },

        async clearQueue() {
            if (!this.queue.items.length) return;
            const ok = await this.confirmDialog('Clear queue', 'Remove all ' + this.queue.items.length + ' staged item(s)? This does not affect any already-running download.');
            if (!ok) return;
            this.queue.items = [];
            this._saveQueue();
        },

        // Bulk quick-start: adds every staged item to aria2 now, unpaused,
        // with every file selected, to the current default destination — no
        // per-item Configure dialog (that's what single-item Start is for;
        // see features/configure.js).
        async startAll() {
            const items = this.queue.items.slice();
            if (!items.length) return;
            const dir = (this.settings && this.settings.destinations && this.settings.destinations.default) || this.home || '/';
            const errors = [];
            for (const item of items) {
                try {
                    await this._startItemDirect(item, dir);
                    this.queue.items = QM.removeById(this.queue.items, item.id);
                } catch (e) {
                    errors.push(item.raw + ': ' + ((e && e.message) || e));
                }
            }
            this._saveQueue();
            this.pushRecent(dir);
            if (errors.length) this.toast('Some items failed to start:\n' + errors.join('\n'), 'danger');
            else this.toast('Started ' + items.length + ' download(s).', 'success');
            if (this._pollActive) this._poll();
        },

        // Shared by startAll() here and configure.js's direct (non-file-
        // select) path: hands one staged item straight to aria2.
        async _startItemDirect(item, dir) {
            const opts = { dir, pause: 'false' };
            if (item.type === 'magnet' || item.type === 'http' || item.type === 'metalink') {
                await this.rpc.addUri([item.value], opts);
            } else if (item.type === 'torrent' && item.b64) {
                await this.rpc.addTorrent(item.b64, [], opts);
            } else {
                throw new Error('unrecognized/unresolvable source');
            }
        },
    };

    root.ManifestQueue = ManifestQueue;
})(typeof window !== 'undefined' ? window : globalThis);
