// core/settings.js — settings.yml load/save + destination bookmarks/recents.
// Spread-in Alpine methods (like explorer's ExplorerSettings). Pure merge
// logic lives in core/defaults.js; pure recents-list logic lives in
// core/destlist.js — this file is YAML I/O + debounce + list mutations only.
'use strict';
(function (root) {
    const Defaults = root.ManifestDefaults;
    const DestList = root.ManifestDestList;
    const Util = root.ManifestUtil;
    const ManifestThemes = root.ManifestThemes;

    // Re-apply the theme live when it's 'system' and the OS/Cockpit preference
    // flips (e.g. desktop switches light/dark mid-session). Registered once.
    let _themeMediaBound = false;
    function _bindSystemThemeListener(getSettings, applyFn) {
        if (_themeMediaBound || !root.matchMedia) return;
        _themeMediaBound = true;
        const mq = root.matchMedia('(prefers-color-scheme: dark)');
        const onChange = () => {
            const s = getSettings();
            if (s && (s.theme || 'system') === 'system') applyFn();
        };
        if (mq.addEventListener) mq.addEventListener('change', onChange);
        else if (mq.addListener) mq.addListener(onChange); // legacy
    }

    function settingsDir(home) {
        return Util.joinPath(Util.joinPath(home, '.config'), 'cockpit/manifest');
    }

    const ManifestSettings = {
        settings: null,
        _suppressSettingsSave: false,
        _saveTimer: null,

        _settingsPath() {
            return Util.joinPath(this._settingsDir(), 'settings.yml');
        },

        _settingsDir() {
            return settingsDir(this.home);
        },

        async _loadSettings() {
            try {
                const text = await FS.readText(this._settingsPath());
                const loaded = jsyaml.load(text) || {};
                this.settings = Defaults.mergeSettings(loaded);
            } catch (e) {
                this.settings = Defaults.mergeSettings({});
            }
            this.applyTheme();
            _bindSystemThemeListener(() => this.settings, () => this.applyTheme());
            return this.settings;
        },

        applyTheme() {
            const prefersDark = !!(root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches);
            const { attr } = ManifestThemes.resolve((this.settings && this.settings.theme) || 'system', prefersDark);
            document.documentElement.setAttribute('data-bs-theme', attr);
        },

        async _writeSettingsYaml() {
            const dir = this._settingsDir();
            await FS.mkdir(dir);
            await FS.chmod('700', dir);
            const text = jsyaml.dump(this.settings, { indent: 2 });
            // settings.yml holds rpc.secret — write it owner-only (0600).
            await FS.writeSecret(this._settingsPath(), text);
        },

        saveSettings() {
            if (this._suppressSettingsSave) return;
            if (this._saveTimer) clearTimeout(this._saveTimer);
            this._saveTimer = setTimeout(() => {
                this._saveTimer = null;
                this._writeSettingsYaml().catch((e) => console.error('[manifest] save settings failed:', e));
            }, 400);
        },

        addBookmark(label, path) {
            const id = (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
            this.settings.destinations.bookmarks.push({ id, label: label || path, path });
            this.saveSettings();
        },

        removeBookmark(id) {
            this.settings.destinations.bookmarks = this.settings.destinations.bookmarks.filter((b) => b.id !== id);
            this.saveSettings();
        },

        setDefaultDest(path) {
            this.settings.destinations.default = path;
            this.saveSettings();
        },

        pushRecent(path) {
            this.settings.destinations.recents = DestList.pushRecent(this.settings.destinations.recents, path, 10);
            this.saveSettings();
        },

        // Recent destinations for the "Recent" chip group: excludes paths that
        // are already saved bookmarks (shown under "Saved"), capped at 5.
        recentDests() {
            const dests = this.settings.destinations || {};
            const bookmarkPaths = (dests.bookmarks || []).map((b) => b.path);
            return DestList.recentsExcluding(dests.recents, bookmarkPaths, 5);
        },
    };

    root.ManifestSettings = ManifestSettings;
})(typeof window !== 'undefined' ? window : globalThis);
