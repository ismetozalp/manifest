# Manifest

A Cockpit plugin that turnkey-provisions and drives a per-user `aria2c` daemon,
giving the server one unified download station for torrents, magnets, and
HTTP/FTP/Metalink files, all inside the Cockpit console.

## What it does

Manifest appears under **Tools → Manifest** in Cockpit. It manages an
`aria2c` process as a per-user `systemctl --user` unit, and drives it entirely
over its JSON-RPC interface via the Cockpit bridge — the browser never talks
to aria2 directly. Adding, pausing, resuming, and removing downloads, queueing
torrents/magnets/HTTP links, and inspecting torrent detail (files, peers,
trackers) are all done from a single full-width table view. Documented below
in v4/v5.

## Requirements

- Cockpit ≥ 300 (the `requires.cockpit` floor in `manifest.json`)
- `aria2` — auto-installed by the plugin's Setup flow (per-package-manager
  install plan; requires one root/superuser step)

## Install

Cockpit ships as a distro package on most systems; consult your distro's
Cockpit documentation for enabling the web console itself first.

To install the Manifest plugin:

```bash
sudo make install
sudo systemctl try-restart cockpit
```

Or download a release zip and unpack it under `/usr/share/cockpit/manifest`:

```bash
unzip manifest-<version>.zip -d /usr/share/cockpit
sudo systemctl try-restart cockpit
```

## Where settings live

All Manifest state is per-user, under `$HOME/.config/cockpit/manifest/`:

| File | Purpose |
|---|---|
| `aria2.conf` | Generated aria2 daemon configuration |
| `aria2.session` | aria2's persisted download session |
| `settings.yml` | Manifest settings — port, limits, bookmarks, recents |
| `queue.json` | Staged (not-yet-started) download queue |

System-level files:

| Path | Purpose |
|---|---|
| `/usr/share/cockpit/manifest/` | Installed plugin files |
| `/etc/cockpit/manifest/installed-version` | Version recorded by `make install` |

## Self-update

Documented below in v6.
