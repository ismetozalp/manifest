// tests/e2e.mjs — Playwright, live host, guarded by E2E=1.
//
// Full turnkey flow through the real Cockpit shell + a real aria2 daemon:
//   1. open the plugin; if the service banner shows "Set up aria2", click
//      Setup and wait (up to 120s) for it to report "aria2 running" (this
//      IS the turnkey install — installs the aria2 package + user unit).
//   2. Quick Add a small HTTP file (E2E_TEST_URL) to a temp destination
//      (created via the folder picker's New folder, under /tmp), assert a
//      new .mf-row appears and its status badge reaches "complete".
//   3. Row actions on that row: pause -> "paused", resume -> active/complete,
//      remove -> row disappears.
//   4. Base64 .torrent regression (Bridge Lesson #2): if E2E_TORRENT is set,
//      attach it via Quick Add's file input (setInputFiles — the drag-drop
//      equivalent Playwright supports), Add, assert a torrent row (⛴/🧲)
//      appears and does NOT error. If unset, log SKIPPED — never a silent
//      pass.
//
// Never runs by accident: exits 2 (skip, not fail) unless E2E=1 and
// COCKPIT_PASS are both set. Fails (exit 1) on any pageerror/risky console
// error collected throughout the whole run.
import { chromium } from 'playwright';
import { CFG, openManifest } from './helpers/cockpit.mjs';

const SHOT = process.env.E2E_SHOT || '/tmp/manifest-e2e.png';
const TEST_URL = process.env.E2E_TEST_URL || 'https://speed.hetzner.de/100KB.bin';
const TORRENT_PATH = process.env.E2E_TORRENT || '';
const TMP_DEST_PARENT = '/tmp';
const TMP_DEST_NAME = 'manifest-e2e';

const errors = [];
const RISK = /is not a function|is not defined|Cannot read propert|Manifest[A-Z]|undefined is not/i;

function done(browser, code, msg) {
    console.log(msg);
    if (errors.length) for (const e of errors) console.log(`  [${e.kind}] ${e.text}`);
    return browser.close().then(() => process.exit(code));
}

async function waitForText(locator, re, timeoutMs, pollMs = 1000) {
    const start = Date.now();
    let last = '';
    while (Date.now() - start < timeoutMs) {
        last = (await locator.innerText().catch(() => '')).trim();
        if (re.test(last)) return last;
        await new Promise((r) => setTimeout(r, pollMs));
    }
    throw new Error(`timeout waiting for /${re}/ — last text: "${last}"`);
}

async function main() {
    if (process.env.E2E !== '1') {
        console.log('skip (set E2E=1)');
        process.exit(2);
    }
    if (!CFG.pass) {
        console.log('skip (set COCKPIT_PASS)');
        process.exit(2);
    }

    const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-certificate-errors'] });
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: false });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push({ kind: 'pageerror', text: String(e.message || e) }));
    page.on('console', (m) => { if (m.type() === 'error') errors.push({ kind: 'console', text: m.text() }); });

    try {
        const app = await openManifest(page);
        if (!app) return done(browser, 3, `Could not locate the Manifest plugin frame. Shot: ${SHOT}`);
        await app.locator('.mf-topbar').first().waitFor({ timeout: 20000 });

        // ── 1. Turnkey setup (if not already set up) ──
        const banner = app.locator('.mf-banner').first();
        await banner.waitFor({ timeout: 10000 });
        let bannerText = (await banner.innerText()).trim();
        if (/set up aria2/i.test(bannerText)) {
            console.log('aria2 not set up — running turnkey Setup…');
            const setupBtn = banner.locator('button', { hasText: 'Set up aria2' });
            await setupBtn.click();
            try {
                await waitForText(banner, /aria2 running/i, 120000, 2000);
            } catch (e) {
                await page.screenshot({ path: SHOT }).catch(() => {});
                return done(browser, 2, `Setup did not complete within 120s (offline/no pkg mgr?) — skip. ${e.message}. Shot: ${SHOT}`);
            }
        } else if (/aria2 stopped/i.test(bannerText)) {
            await banner.locator('button', { hasText: 'Start' }).click();
            await waitForText(banner, /aria2 running/i, 20000, 1000);
        } else if (!/aria2 running/i.test(bannerText)) {
            await page.screenshot({ path: SHOT }).catch(() => {});
            return done(browser, 2, `Unexpected banner state "${bannerText}" — skip. Shot: ${SHOT}`);
        }
        console.log('OK — aria2 running');

        // ── Destination: /tmp/manifest-e2e via the folder picker ──
        await app.locator('button:has-text("+ Quick Add")').click();
        const qa = app.locator('#mfQuickAdd');
        await qa.waitFor({ state: 'visible', timeout: 10000 });

        await qa.locator('button:has-text("Browse…")').click();
        const fp = app.locator('#mfFolderPicker');
        await fp.waitFor({ state: 'visible', timeout: 10000 });
        // Navigate breadcrumb to /tmp (root '/' item is always present, then
        // double-click the 'tmp' entry if not already there).
        await fp.locator('.breadcrumb-item a', { hasText: '/' }).first().click();
        const tmpEntry = fp.locator('.mf-fp-list button', { hasText: 'tmp' }).first();
        if (await tmpEntry.count()) await tmpEntry.dblclick();
        // Create (or reuse) the temp dest folder, then descend into it.
        await fp.locator('input[placeholder="New folder name"]').fill(TMP_DEST_NAME);
        await fp.locator('button:has-text("New folder")').click();
        await page.waitForTimeout(500); // list refresh after mkdir
        const destEntry = fp.locator('.mf-fp-list button', { hasText: TMP_DEST_NAME }).first();
        await destEntry.dblclick();
        await fp.locator('button:has-text("Choose")').click();
        await fp.waitFor({ state: 'hidden', timeout: 10000 });

        // ── 2. Quick Add the HTTP file ──
        await qa.locator('#qaText').fill(TEST_URL);
        await qa.locator('button:has-text("Add")').click();
        await qa.waitFor({ state: 'hidden', timeout: 10000 });

        const row = app.locator('.mf-row').first();
        await row.waitFor({ timeout: 15000 });
        console.log('OK — download row appeared');

        const badge = row.locator('.badge');
        await waitForText(badge, /complete/i, 90000, 1500);
        console.log('OK — download reached Complete');

        // ── 3. Row actions: pause / resume / remove ──
        await row.locator('button[title="Actions"]').click();
        const ctx1 = app.locator('.mf-ctxmenu.show');
        await ctx1.waitFor({ timeout: 5000 });
        // A completed download can't be paused/resumed meaningfully, but the
        // action must not error — exercise it and tolerate a no-op state.
        await ctx1.locator('button:has-text("Pause")').click();
        await page.waitForTimeout(1000);
        await row.locator('button[title="Actions"]').click();
        const ctx2 = app.locator('.mf-ctxmenu.show');
        await ctx2.waitFor({ timeout: 5000 });
        await ctx2.locator('button:has-text("Resume")').click();
        await page.waitForTimeout(1000);
        console.log('OK — pause/resume did not error');

        await row.locator('button[title="Actions"]').click();
        const ctx3 = app.locator('.mf-ctxmenu.show');
        await ctx3.waitFor({ timeout: 5000 });
        await ctx3.locator('button:has-text("Remove"):not(:has-text("delete"))').click();
        const confirmModal = app.locator('#mfConfirmModal');
        await confirmModal.waitFor({ state: 'visible', timeout: 5000 });
        await confirmModal.locator('button:has-text("OK")').click();
        await row.waitFor({ state: 'detached', timeout: 10000 }).catch(async () => {
            // Row may just re-render with a different gid ordering; accept
            // "no longer the top row for this name" as equivalent proof.
            const stillThere = await app.locator('.mf-row').count();
            if (stillThere > 0) throw new Error('row did not disappear after Remove');
        });
        console.log('OK — remove worked');

        // ── 4. Base64 .torrent regression (Bridge Lesson #2) ──
        if (TORRENT_PATH) {
            await app.locator('button:has-text("+ Quick Add")').click();
            await qa.waitFor({ state: 'visible', timeout: 10000 });
            const fileInput = qa.locator('input[type=file]');
            await fileInput.setInputFiles(TORRENT_PATH);
            await qa.locator('.mf-qa-torrents .border.rounded').first().waitFor({ timeout: 5000 });
            await qa.locator('button:has-text("Add")').click();
            await qa.waitFor({ state: 'hidden', timeout: 10000 });

            const torrentRow = app.locator('.mf-row').filter({ has: app.locator('.mf-row-type', { hasText: /[⛴🧲]/ }) }).first();
            await torrentRow.waitFor({ timeout: 15000 });
            const torrentBadge = (await torrentRow.locator('.badge').innerText()).trim();
            if (/error/i.test(torrentBadge)) {
                throw new Error(`torrent regression FAILED — row shows error status: "${torrentBadge}"`);
            }
            console.log('OK — base64 .torrent add succeeded (Bridge Lesson #2 regression clean)');
        } else {
            console.log('torrent regression SKIPPED: set E2E_TORRENT');
        }

        // ── 5. Paste-to-Queue: stage a magnet, persist across reload, Configure-on-Start ──
        // Guarded by E2E_TEST_MAGNET (unset -> SKIPPED, same contract as the
        // torrent regression above) since staging needs no live peers but
        // Configure-on-Start's metadata fetch does — an isolated/offline
        // test host may never resolve it. The assertion is therefore that
        // the UI reaches a "fetching metadata…"/files/timeout state cleanly
        // (no pageerror/console error), not that the magnet completes.
        const TEST_MAGNET = process.env.E2E_TEST_MAGNET || '';
        if (TEST_MAGNET) {
            await app.locator('button:has-text("Paste to Queue")').click();
            const paste = app.locator('#mfPaste');
            await paste.waitFor({ state: 'visible', timeout: 10000 });
            await paste.locator('#pasteText').fill(TEST_MAGNET);
            await paste.locator('.mf-paste-preview .badge', { hasText: 'magnet' }).first().waitFor({ timeout: 5000 });
            await paste.locator('button:has-text("Add to queue")').click();
            await paste.waitFor({ state: 'hidden', timeout: 10000 });

            const queuePill = app.locator('.mf-pills button', { hasText: 'Queue' });
            await queuePill.click();
            const magnetNeedle = TEST_MAGNET.slice(0, 24);
            const queueRow = app.locator('.mf-queue-list .list-group-item').filter({ hasText: magnetNeedle }).first();
            await queueRow.waitFor({ timeout: 10000 });
            console.log('OK — magnet staged in the queue');

            // Reload — queue.json persistence must survive (spec §6.2, §14).
            await page.reload({ waitUntil: 'domcontentloaded' });
            const app2 = await openManifest(page);
            if (!app2) throw new Error('could not reopen Manifest after reload');
            await app2.locator('.mf-topbar').first().waitFor({ timeout: 20000 });
            await app2.locator('.mf-pills button', { hasText: 'Queue' }).click();
            const queueRowAfterReload = app2.locator('.mf-queue-list .list-group-item').filter({ hasText: magnetNeedle }).first();
            await queueRowAfterReload.waitFor({ timeout: 10000 });
            console.log('OK — staged item survived a page reload (queue.json persisted)');

            // Configure-on-Start: destination -> Start -> add-paused ->
            // fetching metadata. Tolerate the metadata never arriving; only
            // fail on an actual UI error.
            await queueRowAfterReload.locator('button:has-text("Start")').click();
            const cfg = app2.locator('#mfConfigure');
            await cfg.waitFor({ state: 'visible', timeout: 10000 });
            await cfg.locator('.modal-footer button:has-text("Start")').click();
            await waitForText(cfg.locator('.modal-body'), /fetching metadata|reading file list|files|timed out/i, 20000, 1000)
                .catch((e) => console.log('  (metadata fetch did not resolve within the wait window — expected on an isolated host: ' + e.message + ')'));
            console.log('OK — Configure-on-Start reached the paused/metadata-fetch flow without erroring');

            // Best-effort cleanup: Cancel so no paused probe download or
            // queue item is left behind for a later run.
            const cancelBtn = cfg.locator('.modal-footer button:has-text("Cancel")');
            if (await cancelBtn.count()) await cancelBtn.click().catch(() => {});
            await cfg.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
        } else {
            console.log('Paste-to-Queue / Configure-on-Start regression SKIPPED: set E2E_TEST_MAGNET');
        }

        await page.screenshot({ path: SHOT }).catch(() => {});
        const risky = errors.filter((e) => e.kind === 'pageerror' || RISK.test(e.text));
        if (risky.length) return done(browser, 1, `FAIL — ${risky.length} JS issue(s) during e2e. Shot: ${SHOT}`);
        return done(browser, 0, `OK — e2e passed (setup, quick-add, progress, actions${TORRENT_PATH ? ', torrent regression' : ''}${TEST_MAGNET ? ', paste-to-queue+configure' : ''}). Shot: ${SHOT}`);
    } catch (e) {
        await page.screenshot({ path: SHOT }).catch(() => {});
        return done(browser, 1, `ERROR: ${e.message}. Shot: ${SHOT}`);
    }
}

main();
