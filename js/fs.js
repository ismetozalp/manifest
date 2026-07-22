// fs.js — cockpit.spawn / cockpit.file wrappers.
//
// Bridge Lesson #3: cockpit.file().read() hangs on private SELinux MCS labels
// (e.g. files under $HOME/.config on RHEL/Fedora with confined users). All
// text reads here go through `cockpit.spawn(['cat', path])` instead — never
// cockpit.file().read().
'use strict';
(function (root) {
    const Util = root.ManifestUtil;

    // Bridge rule: every cockpit.spawn call sets err:'message' so failures
    // reject with a readable message instead of an exit-code-only error.
    function spawn(argv, opts) {
        opts = opts || {};
        const spawnOpts = { err: 'message' };
        if (opts.admin) spawnOpts.superuser = 'require';
        return cockpit.spawn(argv, spawnOpts);
    }

    async function homeDir() {
        try {
            const info = await cockpit.user();
            if (info && info.home) return info.home;
        } catch (e) { /* fall through */ }
        const out = await spawn(['sh', '-c', 'echo $HOME']);
        return String(out).trim();
    }

    // Bridge Lesson #3: use `cat` via spawn, not cockpit.file().read().
    async function readText(path) {
        return spawn(['cat', path]);
    }

    async function writeText(path, text) {
        const dir = Util.dirname(path);
        await mkdir(dir);
        await cockpit.file(path).replace(text == null ? '' : text);
    }

    async function mkdir(path) {
        return spawn(['mkdir', '-p', path]);
    }

    async function exists(path) {
        try {
            await spawn(['test', '-e', path]);
            return true;
        } catch (e) {
            return false;
        }
    }

    async function which(bin) {
        try {
            const out = await spawn(['sh', '-c', 'command -v ' + Util.shq(bin) + ' || true']);
            return String(out).trim();
        } catch (e) {
            return '';
        }
    }

    const FS = { homeDir, readText, writeText, mkdir, exists, which, spawn };
    root.FS = FS;
})(typeof window !== 'undefined' ? window : globalThis);
