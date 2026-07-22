// core/service.js — aria2 service lifecycle: detect / install / configure /
// run as a systemctl --user unit / manage.
//
// This module is orchestration + spawn only. Branch-heavy pure decisions are
// delegated to the already-built Phase-1 modules:
//   ManifestInstallCmd  — which package manager, what steps, static fallback
//   ManifestPortPick    — free-port selection from `ss -ltn`
//   ManifestAria2Conf   — aria2.conf + systemd unit text
//   ManifestDefaults    — settings -> aria2 global-option mapping
//   ManifestSystemctl   — `systemctl --user show` key=value parsing
//   ManifestRpc         — JSON-RPC ping for the setup() readiness wait
//
// Bridge Lesson #4: the aria2 daemon is a **user** systemd unit, managed via
// `cockpit.spawn(['systemctl','--user',...])` — never system D-Bus.
// Global Constraint (spec §2/§9): the ONLY root/superuser steps anywhere in
// this module are (a) installing the aria2 package and (b) plugin install
// (the latter is out of this file's scope). Everything else — including
// `loginctl enable-linger` for the logged-in user's OWN account, which
// systemd-logind's default polkit policy permits unprivileged — runs
// without `{ admin: true }`.
'use strict';
(function (root) {
    const Util = root.ManifestUtil;
    const InstallCmd = root.ManifestInstallCmd;
    const PortPick = root.ManifestPortPick;
    const Aria2Conf = root.ManifestAria2Conf;
    const Defaults = root.ManifestDefaults;
    const Systemctl = root.ManifestSystemctl;

    const UNIT_NAME = 'manifest-aria2.service';

    function configDir(home) {
        return Util.joinPath(Util.joinPath(home, '.config'), 'cockpit/manifest');
    }

    function systemdUserDir(home) {
        return Util.joinPath(Util.joinPath(home, '.config'), 'systemd/user');
    }

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // Small fallback helper mirroring FS.homeDir()'s cockpit.user() -> spawn
    // pattern (needed for `loginctl enable-linger <user>`, which takes a
    // username, not a path).
    async function currentUser() {
        try {
            const info = await cockpit.user();
            if (info && info.name) return info.name;
        } catch (e) { /* fall through */ }
        const out = await FS.spawn(['sh', '-c', 'id -un']);
        return String(out).trim();
    }

    async function detect(home) {
        const h = home || await FS.homeDir();
        let path = await FS.which('aria2c');
        if (!path) {
            const localBin = Util.joinPath(h, '.local/bin/aria2c');
            if (await FS.exists(localBin)) path = localBin;
        }
        return { installed: !!path, aria2Path: path || '' };
    }

    // Probes package managers via ManifestInstallCmd.PROBES, runs each
    // found manager's plan sequentially via superuser (Bridge/Global
    // Constraint: the ONE superuser use besides plugin install), stopping
    // as soon as detect() reports installed. Falls back to the static
    // build plan (unprivileged) if every manager attempt fails.
    async function install(home, onLog) {
        const log = onLog || function () {};
        for (const probe of InstallCmd.PROBES) {
            const bin = await FS.which(probe.bin);
            if (!bin) continue;
            log('Found package manager: ' + probe.manager);
            const steps = InstallCmd.planFor(probe.bin);
            for (const step of steps) {
                log('$ ' + step.join(' '));
                try {
                    const out = await FS.spawn(step, { admin: true });
                    if (out) log(String(out).trim());
                } catch (e) {
                    log('  (step failed: ' + (e.message || e) + ')');
                }
                const d = await detect(home);
                if (d.installed) {
                    log('aria2 installed via ' + probe.manager + ': ' + d.aria2Path);
                    return { ok: true, aria2Path: d.aria2Path, method: probe.manager };
                }
            }
        }
        log('No supported package manager install succeeded; trying the static build fallback.');
        const plan = InstallCmd.staticFallbackPlan(home);
        try {
            for (const step of plan.steps) {
                log('$ ' + step.join(' '));
                await FS.spawn(step); // unprivileged: writes only under $HOME/.local/bin
            }
        } catch (e) {
            // Most likely cause: no internet access to fetch the static build
            // (curl/tar failure) now that every package manager has also
            // failed. Fall through to the actionable manual-install error
            // below instead of letting the raw spawn error escape (spec §13).
            log('  (static fallback failed: ' + (e.message || e) + ')');
        }
        const d = await detect(home);
        if (d.installed) {
            log('aria2 installed via static fallback: ' + d.aria2Path);
            return { ok: true, aria2Path: d.aria2Path, method: 'static' };
        }
        throw new Error(
            'Automatic aria2 install failed. Install it manually (e.g. `sudo dnf install aria2`, ' +
            '`sudo apt-get install aria2`, `sudo pacman -S aria2`, or `sudo zypper install aria2`) and retry Setup.'
        );
    }

    async function pickPort(preferred) {
        const ssOut = await FS.spawn(['ss', '-ltn']);
        const taken = PortPick.listeningPorts(ssOut);
        const pref = Number(preferred);
        if (pref && !taken.has(pref)) return pref;
        // pref IS taken: if it's OUR OWN manifest-aria2 unit already listening
        // there (turnkey re-run against an already-active unit, e.g. after a
        // settings reset that wiped config but left the service running),
        // reuse it rather than picking a new port — otherwise setup() writes
        // a config nobody reloads (see start()) and waits on a port aria2
        // never binds. Only re-pick when the occupant is something else.
        if (pref) {
            try {
                const st = await status();
                if (st.active) return pref;
            } catch (e) { /* fall through to re-pick */ }
        }
        const port = PortPick.firstFree(ssOut, PortPick.RANGE.lo, PortPick.RANGE.hi);
        if (!port) {
            throw new Error('No free port available in ' + PortPick.RANGE.lo + '-' + PortPick.RANGE.hi + '. Free a port and retry.');
        }
        return port;
    }

    function genSecret() {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    async function writeConfig(opts) {
        opts = opts || {};
        const home = opts.home;
        const port = opts.port;
        const secret = opts.secret;
        const dir = opts.dir;
        const settings = opts.settings;
        const aria2Path = opts.aria2Path;

        const cfgDir = configDir(home);
        await FS.mkdir(cfgDir);
        // The config dir holds the rpc-secret (in aria2.conf) — restrict it to
        // owner-only so other local users can't read the secret that gates the
        // loopback aria2 RPC.
        await FS.chmod('700', cfgDir);
        // input-file must already exist or aria2 refuses to start with it set.
        const sessionPath = Util.joinPath(cfgDir, 'aria2.session');
        await FS.spawn(['touch', sessionPath]);
        await FS.chmod('600', sessionPath);

        const limits = Defaults.toAria2GlobalOptions(settings);
        const confText = Aria2Conf.confText({ home, port, secret, dir, limits });
        const confPath = Util.joinPath(cfgDir, 'aria2.conf');
        // aria2.conf embeds rpc-secret — write it owner-only (0600).
        await FS.writeSecret(confPath, confText);

        const unitDir = systemdUserDir(home);
        await FS.mkdir(unitDir);
        const unitText = Aria2Conf.unitText({ home, aria2Path });
        const unitPath = Util.joinPath(unitDir, UNIT_NAME);
        await FS.writeText(unitPath, unitText);

        return { confPath, unitPath };
    }

    async function start() {
        await FS.spawn(['systemctl', '--user', 'daemon-reload']);
        // `enable --now` is a no-op start-wise if the unit is already active
        // (systemd won't reload/restart a running unit just because it's
        // being (re-)enabled) — so a freshly-written config (new port/secret)
        // never gets picked up. Detect "already active" first and force a
        // restart in that case; enable --now is fine (and sufficient) for the
        // not-yet-running case.
        const wasActive = (await status()).active;
        await FS.spawn(['systemctl', '--user', 'enable', '--now', UNIT_NAME]);
        if (wasActive) {
            await FS.spawn(['systemctl', '--user', 'restart', UNIT_NAME]);
        }
        try {
            const user = await currentUser();
            // Unprivileged: systemd-logind's default polkit policy allows a
            // user to enable/disable lingering for their OWN account without
            // authentication. No { admin: true } — see file header.
            await FS.spawn(['loginctl', 'enable-linger', user]);
        } catch (e) {
            // Lingering keeps the unit alive after logout; it's a nice-to-have,
            // not required for the current session, so don't fail setup on it.
            console.warn('[manifest] enable-linger failed (non-fatal):', e.message || e);
        }
    }

    async function stop() {
        return FS.spawn(['systemctl', '--user', 'stop', UNIT_NAME]);
    }

    async function restart() {
        return FS.spawn(['systemctl', '--user', 'restart', UNIT_NAME]);
    }

    async function status() {
        const out = await FS.spawn(['systemctl', '--user', 'show', UNIT_NAME, '-p', 'ActiveState,SubState,LoadState']);
        const parsed = Systemctl.parseShow(out);
        return { active: Systemctl.isActive(parsed), state: parsed.SubState || parsed.ActiveState || 'unknown' };
    }

    // Turnkey orchestration: detect -> (install if missing) -> pickPort ->
    // genSecret -> writeConfig -> start -> wait for the RPC to answer ->
    // return {port,secret,aria2Path}. Caller persists settings.rpc via
    // ManifestSettings.saveSettings().
    async function setup(opts) {
        opts = opts || {};
        const log = opts.onLog || function () {};
        const home = opts.home || await FS.homeDir();
        const settings = opts.settings || Defaults.mergeSettings({});

        log('Checking for aria2…');
        let d = await detect(home);
        let aria2Path = d.aria2Path;
        if (!d.installed) {
            log('aria2 not found; installing…');
            const result = await install(home, log);
            aria2Path = result.aria2Path;
        } else {
            log('aria2 already installed: ' + aria2Path);
        }

        log('Choosing an RPC port…');
        const preferred = settings.rpc && settings.rpc.port;
        const port = await pickPort(preferred);
        log('Using port ' + port + '.');

        const secret = genSecret();
        const dir = (settings.destinations && settings.destinations.default) || Util.joinPath(home, 'Downloads');

        log('Writing aria2.conf and the user unit…');
        await writeConfig({ home, port, secret, dir, settings, aria2Path });

        log('Starting ' + UNIT_NAME + '…');
        await start();

        log('Waiting for aria2 to respond on port ' + port + '…');
        const rpc = ManifestRpc.create({ port, secret });
        const deadline = Date.now() + 15000;
        let up = false;
        while (Date.now() < deadline) {
            up = await rpc.ping();
            if (up) break;
            await sleep(500);
        }
        if (!up) {
            throw new Error('aria2 did not respond on port ' + port + ' within 15s. Check `systemctl --user status ' + UNIT_NAME + '`.');
        }

        settings.rpc = { port, secret };
        log('aria2 is up.');
        return { port, secret, aria2Path };
    }

    const ManifestService = {
        UNIT_NAME,
        configDir,
        detect,
        install,
        pickPort,
        genSecret,
        writeConfig,
        start,
        stop,
        restart,
        status,
        setup,
    };
    root.ManifestService = ManifestService;
})(typeof window !== 'undefined' ? window : globalThis);
