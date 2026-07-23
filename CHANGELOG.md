# Changelog

## 1.1.3

### Changed
- The destination picker (Quick Add and Paste-to-Queue's Configure step) now
  splits its chips into two labelled groups — **Saved** (your bookmarks) and
  **Recent** — instead of one mixed row. A path that's already a saved bookmark
  no longer also shows under Recent.

## 1.1.2

### Fixed
- Removing (or Remove & delete) an actively-downloading torrent took two
  clicks: the first stopped it but left the row behind. `aria2.remove` does a
  graceful stop that contacts trackers first, so the download was still
  transitioning when the purge ran and the row came back on the next poll.
  Active downloads are now stopped with `aria2.forceRemove` (immediate, no
  tracker wait) and the purge retries briefly, so it clears in one pass.

## 1.1.1

### Fixed
- Detail dialog: the minimize (–) and close (×) buttons were rendering next to
  the title instead of at the header's right edge (wrapping the close button in
  a group dropped Bootstrap's implicit `margin-left:auto`). They're now
  right-aligned and vertically centred, and long titles truncate again.

## 1.1.0

### Download detail
- **Minimize to a bottom bar.** The detail dialog now has a minimize button
  that docks it to a fixed taskbar at the bottom of the window (like Explorer's
  file preview/editor). Click a chip to restore the dialog, × to dismiss it;
  multiple details can be minimized at once. Minimized chips are pruned
  automatically when their download is removed.
- **Percent on the progress bar (General tab).** The General tab's progress now
  shows the percentage centered on the bar, matching the main table, instead of
  as separate text below it. The bar is also coloured by status (green complete
  / red error).

### Download table
- **Details in the selection bar.** When exactly one row is selected, the
  bulk-action bar shows a **Details** button that opens that download's dialog.

## 1.0.2

### Download table
- **Row selection checkboxes + bulk actions.** Each row now has a checkbox
  (with a header select-all/indeterminate checkbox); selecting one or more rows
  reveals a bulk-action bar. Every operation aria2 supports per-row can be
  applied across the selection at once: **Resume, Pause, Retry, Remove, and
  Remove & delete files** (the two destructive ones confirm first, naming the
  count). A per-row failure is toasted without aborting the rest of the batch.
- Selection is pruned automatically as rows are removed/purged, so the bar's
  count never drifts above what's on screen.
- A checkbox column was added, so the table now has 10 columns. A column-width
  layout saved by 1.0.1 (9 columns) safely resets to the new defaults on first
  load rather than rendering misaligned.

## 1.0.1

### Download table
- **Resizable columns** — every column has a drag grip on its right edge;
  widths are stored as percentages in `settings.yml` (`columns.widths`) and
  restored on load. A corrupt or out-of-date saved layout falls back to the
  defaults rather than breaking the table.
- **Fixed table layout** — the table now uses `table-layout: fixed`, so a
  column's width no longer depends on its cell content. This fixes rows
  shaking left/right when a speed value flipped between one and two digits
  (e.g. `9 MiB/s` → `11 MiB/s`); cell content that overflows a column is
  ellipsized instead of widening it.

## 1.0.0

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
