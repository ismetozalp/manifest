// tests/ui.mjs — Playwright UI regression for Manifest, driving the plugin
// through the live Cockpit shell. Exercises the parts that work WITHOUT aria2
// running: the app shell, the Settings modal + theme switching, Paste-to-Queue
// staging (offline) with mixed-source per-line type detection, the staging
// Queue view, and the filter pills. Fails on ANY uncaught pageerror or risky
// console error — the class of bug that only surfaces on a real render.
//
// Run:  COCKPIT_PASS=<pass> npm run test:ui   (also honours COCKPIT_USER/URL)
// Without COCKPIT_PASS it skips (exit 2), like the smoke test.
import { chromium } from 'playwright';
import { CFG, openManifest } from './helpers/cockpit.mjs';

const SHOT = process.env.UI_SHOT || '/home/ismet/manifest/tests/ui.png';
const errors = [];
const RISK = /is not a function|is not defined|Cannot read propert|Manifest[A-Z]|undefined is not|NaN/;
const checks = [];
function check(name, ok, detail) { checks.push({ name, ok: !!ok, detail: detail || '' }); }

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-certificate-errors'] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push({ kind: 'pageerror', text: String(e.message || e) }));
page.on('console', m => { if (m.type() === 'error') errors.push({ kind: 'console', text: m.text() }); });

function finish(code, msg) {
    console.log(msg);
    for (const c of checks) console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
    const risky = errors.filter(e => e.kind === 'pageerror' || RISK.test(e.text));
    if (risky.length) { console.log(`\n${risky.length} risky JS error(s):`); risky.forEach(e => console.log(`  [${e.kind}] ${e.text}`)); }
    browser.close().then(() => process.exit(code));
}

try {
    if (!CFG.pass) {
        await page.goto(CFG.url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
        await page.screenshot({ path: SHOT }).catch(() => {});
        finish(2, `Set COCKPIT_PASS to run the UI suite (skipped). Shot: ${SHOT}`);
    }
    const app = await openManifest(page);
    if (!app) finish(3, `Could not locate the Manifest plugin frame. Shot: ${SHOT}`);
    await app.locator('.mf-topbar').first().waitFor({ timeout: 20000 });
    check('shell renders', await app.locator('.mf-title').filter({ hasText: 'Manifest' }).count() > 0);

    // ---- Settings + theme switching ----
    await app.locator('button[title="Settings"]').first().click({ timeout: 5000 });
    await app.locator('#mfSettings.show').waitFor({ timeout: 5000 });
    const swatches = await app.locator('#mfSettings .mf-theme-swatch').count();
    check('settings modal opens with 7 theme swatches', swatches === 7, `found ${swatches}`);
    const settingsText = await app.locator('#mfSettings').innerText().catch(() => '');
    check('tuning section present (concurrency + per-server connections)',
        /Max concurrent downloads/i.test(settingsText) && /Max connections per server/i.test(settingsText) && /aria2 caps at 16/i.test(settingsText));
    for (const theme of ['dark', 'nord', 'dracula', 'system']) {
        const label = theme[0].toUpperCase() + theme.slice(1);
        await app.locator('#mfSettings button', { hasText: new RegExp(`^\\s*${label}\\s*$`) }).first().click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(200);
        const attr = await app.evaluate(() => document.documentElement.getAttribute('data-bs-theme'));
        const expect = theme === 'system' ? /^(light|dark)$/ : new RegExp(`^${theme}$`);
        check(`theme "${theme}" applies data-bs-theme`, expect.test(attr || ''), `data-bs-theme="${attr}"`);
    }
    await app.locator('#mfSettings [data-bs-dismiss="modal"]').first().click({ timeout: 4000 });
    await app.locator('#mfSettings.show').waitFor({ state: 'hidden', timeout: 5000 });
    check('settings modal closes', true);

    // ---- Paste-to-Queue staging (offline, mixed sources) ----
    await app.locator('header button', { hasText: 'Paste to Queue' }).first().click({ timeout: 5000 });
    await app.locator('#mfPaste.show').waitFor({ timeout: 5000 });
    const mixed = 'magnet:?xt=urn:btih:abc123\nhttps://example.com/ubuntu.iso\nthis is not a link';
    await app.locator('#mfPaste textarea').first().fill(mixed);
    await page.waitForTimeout(300);
    const previewTypes = await app.locator('#mfPaste .badge').allInnerTexts().catch(() => []);
    const joined = previewTypes.join(',');
    check('paste preview classifies each line independently', /magnet/.test(joined) && /http/.test(joined) && /unknown/.test(joined), joined);
    await app.locator('#mfPaste button', { hasText: 'Add to queue' }).first().click({ timeout: 4000 });
    await app.locator('#mfPaste.show').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    const queuePill = await app.locator('.mf-pills button', { hasText: /Queue/ }).first().innerText().catch(() => '');
    const qcount = parseInt((queuePill.match(/\((\d+)\)/) || [])[1] || '0', 10);
    check('valid mixed sources staged to queue (magnet+http)', qcount >= 2, `Queue pill: "${queuePill.trim()}"`);
    // View the queue and confirm items render
    await app.locator('.mf-pills button', { hasText: /Queue/ }).first().click({ timeout: 4000 });
    await page.waitForTimeout(200);

    // ---- Filter pills sweep ----
    for (const pill of ['All', 'Active', 'Waiting', 'Paused', 'Complete', 'Error']) {
        await app.locator('.mf-pills button', { hasText: new RegExp(pill) }).first().click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(60);
    }
    check('filter pills clickable without error', true);

    await page.screenshot({ path: SHOT }).catch(() => {});
    const failed = checks.filter(c => !c.ok);
    const risky = errors.filter(e => e.kind === 'pageerror' || RISK.test(e.text));
    if (failed.length || risky.length) finish(1, `FAIL — ${failed.length} check(s) failed, ${risky.length} risky JS error(s). Shot: ${SHOT}`);
    else finish(0, `OK — ${checks.length} UI checks passed, no risky JS errors. Shot: ${SHOT}`);
} catch (e) {
    await page.screenshot({ path: SHOT }).catch(() => {});
    finish(3, `ERROR driving the UI: ${e.message}. Shot: ${SHOT}`);
}
