# Changelog

## 1.0.0 — unreleased

Initial release.

### Backend / provisioning
- Turnkey aria2 provisioning: package-manager detection (`dnf`/`apt`/`pacman`/
  `zypper`), EPEL-aware install plan on RHEL-family hosts, and a static-binary
  fallback when no supported package manager is available or install fails.
- aria2 runs as a per-user `systemctl --user` unit (`manifest-aria2.service`),
  driven entirely over JSON-RPC via the Cockpit bridge (`cockpit.http`) — the
  browser never talks to aria2 directly.
- RPC port auto-picked from the loopback range 16800–26800 (never the aria2
  default 6800), re-verified free on every service start.
- Per-user state under `~/.config/cockpit/manifest/`: `aria2.conf`,
  `aria2.session`, `settings.yml`, `queue.json`.

### Downloads
- Live download table with polling, aggregate stats, and a horizontal filter
  pill row (no side rail).
- **Quick Add** — single-item add with source auto-detection (magnet / HTTP /
  FTP / Metalink / `.torrent`), `.torrent` files sent base64-encoded through
  the bridge to avoid binary-upload corruption.
- **Paste-to-Queue** — stage many mixed sources at once, then Configure-on-
  Start with a shared destination and (for torrents) per-file selection and
  magnet metadata fetch.
- Row/context actions: pause, resume, remove, open destination in Explorer.
- Torrent detail view: General, Files (per-file select), Peers, and Trackers
  tabs.

### Settings
- Settings modal (no sidebar — a modal, stacked sections): Appearance,
  Destinations (default destination, bookmarks, recents), Limits &
  connections, RPC, and Updates.
- Limits & connections tuning: max concurrent downloads, max connections per
  server (1–16), splits per download, min split size, max peers per torrent,
  global download/upload limits, seed ratio, seed time — live-applied via
  `changeGlobalOption` where aria2 allows, the rest taking effect on new
  downloads.
- RPC port is editable and re-verified free before restart; poll interval is
  configurable.

### Appearance
- Theme system: System, Light, Dark (required), Aqua, Nord, Solarized, and
  Dracula, built on Bootstrap 5.3 `data-bs-theme` with CSS-variable overrides
  — no build step. Applied live from the Appearance section of Settings and
  follows OS/Cockpit preference when set to System.

### Self-update & release
- Version badge in the top bar checks the configured GitHub repo's latest
  release via the bridge (`curl` through `cockpit.spawn`, not browser
  `fetch`, respecting the `connect-src 'self'` CSP) and offers a one-click
  in-UI update: bridge-downloaded release zip, superuser `make install`, and
  a detached `systemd-run --no-block` Cockpit restart that survives the page
  disconnecting.
- `Makefile` release flow: `make zip` / `make publish` (GitHub release via
  `gh`), `make install` / `make uninstall`.
- Explorer-style README covering per-distro Cockpit install, plugin install
  (source, release zip, or self-update), aria2 provisioning, the settings
  file layout, and self-update mechanics.

### Testing
- Unit tests (`node --test`) for every pure module: `util`, `detect`,
  `rpcenvelope`, `aria2conf`, `portpick`, `installcmd`, `defaults`,
  `destlist`, `queuemodel`, `themes`.
- Smoke test (`tests/smoke.mjs`, Playwright) through the live Cockpit shell.
- e2e test (`tests/e2e.mjs`, Playwright) covering setup, add, progress, and
  actions, including the base64 `.torrent` bridge-quirk regression.
