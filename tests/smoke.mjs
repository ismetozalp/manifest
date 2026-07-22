import { chromium } from 'playwright';
import { CFG, openManifest } from './helpers/cockpit.mjs';

const SHOT = process.env.SMOKE_SHOT || '/tmp/manifest-smoke.png';
const errors = [];
const RISK = /is not a function|is not defined|Cannot read propert|Manifest[A-Z]|undefined is not/i;

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-certificate-errors'] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push({ kind: 'pageerror', text: String(e.message || e) }));
page.on('console', m => { if (m.type() === 'error') errors.push({ kind: 'console', text: m.text() }); });

function done(code, msg) {
    console.log(msg);
    if (errors.length) for (const e of errors) console.log(`  [${e.kind}] ${e.text}`);
    browser.close().then(() => process.exit(code));
}

try {
    if (!CFG.pass) {
        await page.goto(CFG.url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
        await page.screenshot({ path: SHOT }).catch(() => {});
        done(2, `Reached ${CFG.url} login. Set COCKPIT_PASS to run the full smoke. Shot: ${SHOT}`);
    } else {
        const app = await openManifest(page);
        if (!app) done(3, `Could not locate the Manifest plugin frame. Shot: ${SHOT}`);
        await app.locator('.mf-topbar').first().waitFor({ timeout: 20000 });
        await app.locator('.mf-title').filter({ hasText: 'Manifest' }).first().waitFor({ timeout: 5000 });
        await page.screenshot({ path: SHOT }).catch(() => {});
        const risky = errors.filter(e => e.kind === 'pageerror' || RISK.test(e.text));
        if (risky.length) done(1, `FAIL — ${risky.length} JS issue(s). Shot: ${SHOT}`);
        else done(0, `OK — shell rendered, no risky JS errors. Shot: ${SHOT}`);
    }
} catch (e) {
    await page.screenshot({ path: SHOT }).catch(() => {});
    done(3, `ERROR: ${e.message}. Shot: ${SHOT}`);
}
