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
    // `--` terminates option parsing so a path beginning with '-' can't be
    // read as a flag (defense-in-depth; manifest paths are absolute anyway).
    async function readText(path) {
        return spawn(['cat', '--', path]);
    }

    async function writeText(path, text) {
        const dir = Util.dirname(path);
        await mkdir(dir);
        await cockpit.file(path).replace(text == null ? '' : text);
    }

    // Write a file that contains a credential (e.g. the aria2 rpc-secret) with
    // owner-only permissions (0600), so other local users can't read the secret
    // that gates the loopback aria2 RPC. cockpit.file().replace() honours the
    // process umask (often 0644/0664), so we chmod immediately after the write.
    async function writeSecret(path, text) {
        await writeText(path, text);
        await spawn(['chmod', '600', '--', path]);
    }

    // Restrict a directory to owner-only (0700) — used for the manifest config
    // dir that holds the secret-bearing files. `--` guards a '-'-leading path.
    async function chmod(mode, path) {
        return spawn(['chmod', mode, '--', path]);
    }

    async function mkdir(path) {
        return spawn(['mkdir', '-p', '--', path]);
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

    const FS = { homeDir, readText, writeText, writeSecret, chmod, mkdir, exists, which, spawn };
    root.FS = FS;
})(typeof window !== 'undefined' ? window : globalThis);
