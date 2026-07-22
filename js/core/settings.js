// core/settings.js — settings.yml load/save + destination bookmarks/recents.
// Spread-in Alpine methods (like explorer's ExplorerSettings). Pure merge
// logic lives in core/defaults.js; pure recents-list logic lives in
// core/destlist.js — this file is YAML I/O + debounce + list mutations only.
'use strict';
(function (root) {
    const Defaults = root.ManifestDefaults;
    const DestList = root.ManifestDestList;
    const Util = root.ManifestUtil;

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
            return this.settings;
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
    };

    root.ManifestSettings = ManifestSettings;
})(typeof window !== 'undefined' ? window : globalThis);
