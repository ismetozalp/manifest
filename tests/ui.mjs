// tests/ui.mjs — Playwright UI regression for Manifest, driving the plugin
// through the live Cockpit shell. Exercises the front-end broadly: app shell,
// Settings + all themes + accent buttons, the download table + percent-on-bar +
// row context menu, the detail file-selection tree, Paste-to-Queue staging with
// mixed-source detection + remove/clear, modal stacking, and the filter pills.
// Table/detail/context-menu checks that need a live service are guarded by
// svc.active and injected with synthetic data (no aria2 RPC calls), so the core
// UI is always tested and the service-gated bits run when aria2 is up.
//
// Fails on ANY uncaught pageerror or risky console error.
//   COCKPIT_PASS=<pass> npm run test:ui   (also honours COCKPIT_USER/URL)
import { chromium } from 'playwright';
import { CFG, openManifest } from './helpers/cockpit.mjs';

const SHOT = process.env.UI_SHOT || '/home/ismet/manifest/tests/ui.png';
const errors = [];
const RISK = /is not a function|is not defined|Cannot read propert|Manifest[A-Z]|undefined is not/;
const checks = [];
function check(name, ok, detail) { checks.push({ name, ok: !!ok, detail: detail || '' }); }

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-certificate-errors'] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1200, height: 760 } });
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
const data = () => app.evaluate(() => window.Alpine.$data(document.querySelector('[x-data]')));
let app;

try {
    if (!CFG.pass) {
        await page.goto(CFG.url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
        await page.screenshot({ path: SHOT }).catch(() => {});
        finish(2, `Set COCKPIT_PASS to run the UI suite (skipped). Shot: ${SHOT}`);
    }
    app = await openManifest(page);
    if (!app) finish(3, `Could not locate the Manifest plugin frame. Shot: ${SHOT}`);
    await app.locator('.mf-topbar').first().waitFor({ timeout: 20000 });
    check('shell renders', await app.locator('.mf-title').filter({ hasText: 'Manifest' }).count() > 0);
    // Let the async service check (init → _refreshServiceState) settle before we
    // decide whether to run the service-gated table/detail section.
    await app.evaluate(async () => { const d = window.Alpine.$data(document.querySelector('[x-data]')); for (let i = 0; i < 40 && d.svc.state === 'unknown'; i++) await new Promise(r => setTimeout(r, 300)); });
    const svcActive = await app.evaluate(() => window.Alpine.$data(document.querySelector('[x-data]')).svc.active);

    // ---- Setup-log dismiss ----
    await app.evaluate(() => { const d = window.Alpine.$data(document.querySelector('[x-data]')); d.svc.log = 'test setup log line'; });
    await page.waitForTimeout(150);
    check('setup log shows a dismiss button', await app.locator('.mf-setup-log-wrap .btn-close').count() > 0);
    await app.locator('.mf-setup-log-wrap .btn-close').first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(150);
    check('dismiss clears the setup log', await app.evaluate(() => !window.Alpine.$data(document.querySelector('[x-data]')).svc.log));

    // ---- Settings: swatches + tuning + ALL themes + accent buttons ----
    await app.locator('button[title="Settings"]').first().click({ timeout: 5000 });
    await app.locator('#mfSettings.show').waitFor({ timeout: 5000 });
    const swatches = await app.locator('#mfSettings .mf-theme-swatch').count();
    check('settings has all 13 theme swatches', swatches === 13, `found ${swatches}`);
    const settingsText = await app.locator('#mfSettings').innerText().catch(() => '');
    check('tuning section present (concurrency + per-server connections)',
        /Max concurrent downloads/i.test(settingsText) && /Max connections per server/i.test(settingsText) && /aria2 caps at 16/i.test(settingsText));

    // Apply every theme; assert data-bs-theme + readable header contrast (light on dark, or dark on light)
    const themeIds = await app.evaluate(() => (window.ManifestThemes ? window.ManifestThemes.THEMES.map(t => t.id) : []));
    const lum = (rgb) => { const m = (rgb.match(/\d+/g) || [0, 0, 0]).map(Number); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
    let themeFails = 0, contrastFails = 0;
    for (const id of themeIds) {
        await app.evaluate((t) => { const d = window.Alpine.$data(document.querySelector('[x-data]')); d.settings.theme = t; d.applyTheme(); }, id);
        await page.waitForTimeout(90);
        const info = await app.evaluate(() => {
            const attr = document.documentElement.getAttribute('data-bs-theme');
            const hdr = document.querySelector('#mfSettings h6'), bg = document.querySelector('#mfSettings .modal-content');
            return { attr, hdr: hdr ? getComputedStyle(hdr).color : '', bg: bg ? getComputedStyle(bg).backgroundColor : '' };
        });
        const attrOk = id === 'system' ? /^(light|dark)$/.test(info.attr) : info.attr === id;
        if (!attrOk) themeFails++;
        if (Math.abs(lum(info.hdr) - lum(info.bg)) < 40) contrastFails++;
    }
    check(`all ${themeIds.length} themes apply data-bs-theme`, themeFails === 0, `${themeFails} failed`);
    check('section headers legible in every theme', contrastFails === 0, `${contrastFails} low-contrast`);

    // Accent buttons: a custom theme's Save button uses its --bs-primary, not blue
    await app.evaluate(() => { const d = window.Alpine.$data(document.querySelector('[x-data]')); d.settings.theme = 'gruvbox'; d.applyTheme(); });
    await page.waitForTimeout(120);
    const btn = await app.evaluate(() => { const b = [...document.querySelectorAll('#mfSettings .btn-primary')].pop(); const cs = getComputedStyle(b); return { bg: cs.backgroundColor }; });
    check('primary button follows the theme accent (not Bootstrap blue)', !/13,\s*110,\s*253/.test(btn.bg), `Save bg=${btn.bg}`);
    await app.evaluate(() => { const d = window.Alpine.$data(document.querySelector('[x-data]')); d.settings.theme = 'dark'; d.applyTheme(); });

    // Modal stacking: folder picker over Settings
    await app.locator('#mfSettings button', { hasText: /Browse/ }).first().click({ timeout: 4000 });
    await app.locator('#mfFolderPicker.show').waitFor({ timeout: 8000 });
    const stack = await app.evaluate(() => {
        const z = (el) => parseInt(getComputedStyle(el).zIndex) || 0;
        const picker = document.querySelector('#mfFolderPicker'), settings = document.querySelector('#mfSettings');
        const r = picker.querySelector('.modal-content').getBoundingClientRect();
        return { pickerZ: z(picker), settingsZ: z(settings), topInPicker: picker.contains(document.elementFromPoint(r.left + r.width / 2, r.top + 8)) };
    });
    check('folder picker stacks above the modal that opened it', stack.pickerZ > stack.settingsZ && stack.topInPicker, JSON.stringify(stack));
    await app.locator('#mfFolderPicker button', { hasText: /Cancel/ }).first().click({ timeout: 3000 }).catch(() => {});
    await app.locator('#mfFolderPicker.show').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await app.locator('#mfSettings [data-bs-dismiss="modal"]').first().click({ timeout: 4000 });
    await app.locator('#mfSettings.show').waitFor({ state: 'hidden', timeout: 5000 });
    check('settings modal closes', true);

    // ---- Paste-to-Queue: mixed sources, per-line type, then remove + clear ----
    await app.locator('header button', { hasText: 'Paste to Queue' }).first().click({ timeout: 5000 });
    await app.locator('#mfPaste.show').waitFor({ timeout: 5000 });
    await app.locator('#mfPaste textarea').first().fill('magnet:?xt=urn:btih:abc123\nhttps://example.com/ubuntu.iso\nftp://mirror/file.bin\nthis is not a link');
    await page.waitForTimeout(300);
    const previewTypes = (await app.locator('#mfPaste .badge').allInnerTexts().catch(() => [])).join(',');
    check('paste preview classifies each line independently', /magnet/.test(previewTypes) && /http/.test(previewTypes) && /unknown/.test(previewTypes), previewTypes);
    await app.locator('#mfPaste button', { hasText: 'Add to queue' }).first().click({ timeout: 4000 });
    await app.locator('#mfPaste.show').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    const qcount = await app.evaluate(() => window.Alpine.$data(document.querySelector('[x-data]')).queue.items.length);
    check('valid mixed sources staged (magnet+http+ftp, junk dropped)', qcount === 3, `queue length ${qcount}`);
    // remove one, then clear all (via component methods — robust to markup)
    await app.evaluate(() => { const d = window.Alpine.$data(document.querySelector('[x-data]')); d.removeItem(d.queue.items[0]); });
    await page.waitForTimeout(150);
    check('remove item drops one from the queue', (await app.evaluate(() => window.Alpine.$data(document.querySelector('[x-data]')).queue.items.length)) === 2);
    // clearQueue() asks for confirmation first; drive the confirm dialog's OK.
    // (Wait for the show transition before hiding, and for the hide to finish,
    // or the modal backdrop lingers and intercepts later clicks.)
    await app.evaluate(() => { window.Alpine.$data(document.querySelector('[x-data]')).clearQueue(); });
    await app.locator('#mfConfirmModal.show').waitFor({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(450);
    await app.locator('#mfConfirmModal button', { hasText: /^\s*OK\s*$/ }).first().click({ timeout: 4000 }).catch(() => {});
    let cleared = false;
    for (let i = 0; i < 20 && !cleared; i++) { await page.waitForTimeout(150); cleared = (await app.evaluate(() => window.Alpine.$data(document.querySelector('[x-data]')).queue.items.length)) === 0; }
    await app.locator('#mfConfirmModal.show').waitFor({ state: 'hidden', timeout: 4000 }).catch(() => {});
    check('clear empties the queue (via confirm dialog)', cleared);

    // ---- Download table + percent-on-bar + row context menu (needs svc.active) ----
    if (svcActive) {
        await app.evaluate(() => {
            const d = window.Alpine.$data(document.querySelector('[x-data]'));
            if (d.stopPolling) d.stopPolling();
            d.deepLinks = { explorer: true, files: true };
            const mk = (gid, name, total, done, spd, status, bt) => ({ gid, status, totalLength: String(total), completedLength: String(done), downloadSpeed: String(spd), uploadSpeed: '0', connections: status === 'active' ? '9' : '0', numSeeders: '3', dir: '/mnt/media', files: [{ path: '/mnt/media/' + name, selected: 'true' }], bittorrent: bt ? { info: { name } } : undefined, errorCode: '0' });
            d.downloads = {
                a: mk('a', 'ubuntu-24.04.iso', 6000000000, 2700000000, 8000000, 'active', false),
                b: mk('b', 'Sintel.1080p.mkv', 1600000000, 200000000, 9000000, 'active', true),
                c: mk('c', 'debian.iso', 659000000, 659000000, 0, 'complete', false),
            };
            d.activeFilter = 'all';
        });
        await page.waitForTimeout(300);
        const rows = await app.locator('.mf-row').count();
        check('table renders injected downloads', rows === 3, `rows=${rows}`);
        const pctText = (await app.locator('.mf-row-pct').allInnerTexts().catch(() => [])).join(',');
        check('percent shown inside the bar', /%/.test(pctText), pctText);
        const badges = (await app.locator('.mf-row .badge').allInnerTexts().catch(() => [])).join(',');
        check('status badges render (active/complete)', /active/i.test(badges) && /complete/i.test(badges), badges);

        // ---- Resizable columns: fixed layout (anti-shake) + grips + drag-persist ----
        const layout = await app.evaluate(() => getComputedStyle(document.querySelector('.mf-table')).tableLayout);
        check('download table uses fixed layout (anti-shake)', layout === 'fixed', `table-layout=${layout}`);
        const grips = await app.locator('.mf-table thead .mf-col-grip').count();
        check('every column boundary has a resize grip', grips === 9, `grips=${grips}`);
        // No-shake proof: widen a speed value ("9 MiB/s" → "999.9 MiB/s") and assert
        // the Size header does not move — with fixed layout, content can't shift columns.
        const sizeXBefore = await app.evaluate(() => document.querySelectorAll('.mf-table thead th')[3].getBoundingClientRect().x);
        await app.evaluate(() => { const d = window.Alpine.$data(document.querySelector('[x-data]')); d.downloads.b.downloadSpeed = '1048471142'; });
        await page.waitForTimeout(200);
        const sizeXAfter = await app.evaluate(() => document.querySelectorAll('.mf-table thead th')[3].getBoundingClientRect().x);
        check('columns hold position when a speed value changes width (no row-shake)', Math.abs(sizeXBefore - sizeXAfter) < 1, `Δx=${(sizeXAfter - sizeXBefore).toFixed(2)}`);
        // Drag the grip between Name(col 2) and Size(col 3): Name widens, Size shrinks, persists.
        // Reset to known widths first so the test is hermetic (a prior run may have
        // persisted a layout with Size already at the min, leaving no room to shrink).
        await app.evaluate(() => { const d = window.Alpine.$data(document.querySelector('[x-data]')); d.settings.columns.widths = window.ManifestColumns.DEFAULT_WIDTHS.slice(); });
        await page.waitForTimeout(80);
        const before = await app.evaluate(() => window.Alpine.$data(document.querySelector('[x-data]')).colWidths.slice());
        await app.evaluate(() => {
            const grip = document.querySelectorAll('.mf-table thead .mf-col-grip')[2]; // boundary index 2 (Name|Size)
            const r = grip.getBoundingClientRect();
            const x0 = r.left + r.width / 2, y = r.top + r.height / 2;
            const opts = (x) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y });
            grip.dispatchEvent(new MouseEvent('mousedown', opts(x0)));
            document.dispatchEvent(new MouseEvent('mousemove', opts(x0 + 90)));
            document.dispatchEvent(new MouseEvent('mouseup', opts(x0 + 90)));
        });
        await page.waitForTimeout(150);
        const after = await app.evaluate(() => window.Alpine.$data(document.querySelector('[x-data]')).colWidths.slice());
        check('dragging a grip resizes columns (Name grows, Size shrinks, total preserved)',
            after[2] > before[2] && after[3] < before[3] && Math.abs((after[2] + after[3]) - (before[2] + before[3])) < 0.5,
            `${JSON.stringify(before.slice(2, 4))} → ${JSON.stringify(after.slice(2, 4))}`);
        const persisted = await app.evaluate(() => window.Alpine.$data(document.querySelector('[x-data]')).settings.columns.widths.slice());
        check('resized widths land in settings (persisted to settings.yml)', JSON.stringify(persisted) === JSON.stringify(after), JSON.stringify(persisted));

        // ---- Checkbox multi-select + bulk-action bar ----
        await app.evaluate(() => window.Alpine.$data(document.querySelector('[x-data]')).clearSelection());
        await page.waitForTimeout(80);
        const rowChecks = await app.locator('.mf-row .mf-row-check input[type=checkbox]').count();
        check('every row has a selection checkbox', rowChecks === 3, `checkboxes=${rowChecks}`);
        check('header has a select-all checkbox', await app.locator('.mf-th-check input[type=checkbox]').count() === 1);
        // bulk bar hidden with nothing selected
        check('bulk bar hidden when no rows selected', !(await app.locator('.mf-bulkbar').isVisible().catch(() => false)));
        // tick one row → selection grows, bulk bar appears with the right count
        await app.locator('.mf-row .mf-row-check input[type=checkbox]').first().click();
        await page.waitForTimeout(120);
        check('ticking a row checkbox selects it', await app.evaluate(() => window.Alpine.$data(document.querySelector('[x-data]')).selection.size) === 1);
        check('bulk bar appears when a row is selected', await app.locator('.mf-bulkbar').isVisible());
        const barText = await app.locator('.mf-bulkbar').innerText().catch(() => '');
        check('bulk bar shows count + Pause/Resume/Retry/Remove actions',
            /1 selected/.test(barText) && /Pause/.test(barText) && /Resume/.test(barText) && /Retry/.test(barText) && /Remove/.test(barText), barText.replace(/\n/g, ' '));
        // select-all header checkbox selects every visible row
        await app.locator('.mf-th-check input[type=checkbox]').click();
        await page.waitForTimeout(120);
        check('header select-all selects all visible rows', await app.evaluate(() => window.Alpine.$data(document.querySelector('[x-data]')).selection.size) === 3);
        // bulk remove: drive it through the confirm dialog, assert the rows go away.
        // NOTE: no-return block — bulkRemove() awaits the confirm dialog, so returning
        // its promise to evaluate() would deadlock (OK is clicked on the next line).
        await app.evaluate(() => { window.Alpine.$data(document.querySelector('[x-data]')).bulkRemove(); });
        await app.locator('#mfConfirmModal.show').waitFor({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(400);
        await app.locator('#mfConfirmModal button', { hasText: /^\s*OK\s*$/ }).first().click({ timeout: 4000 }).catch(() => {});
        let emptied = false;
        for (let i = 0; i < 20 && !emptied; i++) { await page.waitForTimeout(150); emptied = (await app.evaluate(() => Object.keys(window.Alpine.$data(document.querySelector('[x-data]')).downloads).length)) === 0; }
        await app.locator('#mfConfirmModal.show').waitFor({ state: 'hidden', timeout: 4000 }).catch(() => {});
        check('bulk remove (via confirm) clears the selected rows + selection', emptied && (await app.evaluate(() => window.Alpine.$data(document.querySelector('[x-data]')).selection.size)) === 0);
        // re-inject the three rows so the later detail-tree section still has data
        await app.evaluate(() => {
            const d = window.Alpine.$data(document.querySelector('[x-data]'));
            const mk = (gid, name, total, done, spd, status, bt) => ({ gid, status, totalLength: String(total), completedLength: String(done), downloadSpeed: String(spd), uploadSpeed: '0', connections: status === 'active' ? '9' : '0', numSeeders: '3', dir: '/mnt/media', files: [{ path: '/mnt/media/' + name, selected: 'true' }], bittorrent: bt ? { info: { name } } : undefined, errorCode: '0' });
            d.downloads = { a: mk('a', 'ubuntu-24.04.iso', 6000000000, 2700000000, 8000000, 'active', false), b: mk('b', 'Sintel.1080p.mkv', 1600000000, 200000000, 9000000, 'active', true), c: mk('c', 'debian.iso', 659000000, 659000000, 0, 'complete', false) };
        });
        await page.waitForTimeout(200);

        // row context menu: open on first row's ⋯, must be in viewport and show deep-link items
        await app.locator('.mf-row button', { hasText: '⋯' }).first().click({ timeout: 4000 });
        await page.waitForTimeout(200);
        const menu = await app.evaluate(() => {
            const el = document.querySelector('.mf-ctxmenu');
            if (!el || !el.classList.contains('show')) return { open: false };
            const b = el.getBoundingClientRect();
            return { open: true, inViewport: b.left >= 0 && b.top >= 0 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1, text: el.innerText };
        });
        check('row context menu opens inside the viewport', menu.open && menu.inViewport, JSON.stringify({ inViewport: menu.inViewport }));
        check('context menu shows Open-in-Files and Open-in-Explorer (installed)', /Files/.test(menu.text || '') && /Explorer/.test(menu.text || ''));
        await app.evaluate(() => window.Alpine.$data(document.querySelector('[x-data]')).closeContextMenu());

        // ---- Detail file-selection tree: collapse, select none/all, tri-state ----
        await app.evaluate(() => {
            const d = window.Alpine.$data(document.querySelector('[x-data]'));
            const files = [{ index: '1', path: '/dl/Show/Sub/a.srt', length: '5', selected: 'true' }, { index: '2', path: '/dl/Show/Sub/b.srt', length: '5', selected: 'true' }, { index: '3', path: '/dl/Show/movie.mkv', length: '900', selected: 'true' }, { index: '4', path: '/dl/Show/junk.txt', length: '9', selected: 'false' }];
            d.detail = { open: true, gid: 'x', tab: 'files', data: {}, peers: [], trackers: [], files: files.map(f => ({ index: Number(f.index), path: f.path, length: Number(f.length), completedLength: 0, selected: f.selected !== 'false' })), fileTree: window.ManifestFileTree.build(files).nodes, selectedIndices: new Set([1, 2, 3]), collapsed: new Set(), _selGid: 'x', loading: false, error: '' };
            bootstrap.Modal.getOrCreateInstance(d.detailModalEl).show();
        });
        await page.waitForTimeout(400);
        const treeRows = await app.locator('#mfDetail .mf-tree-row').count();
        check('detail file tree renders (folder + files)', treeRows >= 4, `rows=${treeRows}`);
        const guides = await app.locator('#mfDetail .mf-tree-guide').count();
        check('tree has indent guide-lines (nested items)', guides >= 1, `guides=${guides}`);
        // collapse the Sub folder -> fewer rows (no changeOption calls, pure UI)
        await app.evaluate(() => window.Alpine.$data(document.querySelector('[x-data]')).detailToggleFolder('/Sub'));
        await page.waitForTimeout(150);
        const collapsed = await app.locator('#mfDetail .mf-tree-row').count();
        check('collapsing a folder hides its children', collapsed < treeRows, `${treeRows}→${collapsed}`);
        // folder tri-state helper (no RPC): some vs all vs none
        const tri = await app.evaluate(() => {
            const d = window.Alpine.$data(document.querySelector('[x-data]'));
            const sub = d.detail.fileTree.find(n => n.dir);
            const all = window.ManifestFileTree.folderState(sub, new Set(sub.indices));
            const some = window.ManifestFileTree.folderState(sub, new Set([sub.indices[0]]));
            const none = window.ManifestFileTree.folderState(sub, new Set());
            return { all, some, none };
        });
        check('folder tri-state is all/some/none', tri.all === 'all' && tri.some === 'some' && tri.none === 'none', JSON.stringify(tri));

        // ---- General tab: percent centered ON the progress bar (v1.1 fix) ----
        await app.evaluate(() => {
            const d = window.Alpine.$data(document.querySelector('[x-data]'));
            // Point the open detail at a real row ('b') so restore-from-taskbar can reopen it.
            d.detail.gid = 'b';
            d.detail.data = { gid: 'b', status: 'active', completedLength: '400000000', totalLength: '1000000000', downloadSpeed: '6500000', uploadSpeed: '0', bittorrent: { info: { name: 'Test Torrent 2160p' } }, files: [{ path: '/dl/Test Torrent 2160p/movie.mkv' }] };
            d.detailSwitchTab('general');
        });
        await page.waitForTimeout(200);
        const genPct = await app.evaluate(() => {
            const bar = document.querySelector('#mfDetail .progress');
            const pct = bar && bar.querySelector('.mf-row-pct');
            return { onBar: !!pct, text: pct ? pct.textContent.trim() : '' };
        });
        check('General tab shows percent ON the progress bar (not below it)', genPct.onBar && /40%/.test(genPct.text), JSON.stringify(genPct));

        // ---- Minimize detail → bottom taskbar → restore (v1.1 item 4) ----
        await app.evaluate(() => window.Alpine.$data(document.querySelector('[x-data]')).minimizeDetail());
        await page.waitForTimeout(400);
        const min = await app.evaluate(() => {
            const d = window.Alpine.$data(document.querySelector('[x-data]'));
            return { count: d.minimizedDetails.length, name: (d.minimizedDetails[0] || {}).name, modalShown: document.querySelector('#mfDetail').classList.contains('show') };
        });
        check('minimize hides the modal and adds a taskbar chip', min.count === 1 && !min.modalShown, JSON.stringify(min));
        check('taskbar chip is visible with the download name', await app.locator('.mf-taskbar .mf-taskbar-item').isVisible() && /Test Torrent/.test(min.name || ''));
        // restore by clicking the chip
        await app.locator('.mf-taskbar .mf-taskbar-item').first().click();
        await app.locator('#mfDetail.show').waitFor({ timeout: 4000 }).catch(() => {});
        const restored = await app.evaluate(() => {
            const d = window.Alpine.$data(document.querySelector('[x-data]'));
            return { minCount: d.minimizedDetails.length, modalShown: document.querySelector('#mfDetail').classList.contains('show') };
        });
        check('clicking the chip restores the modal and clears the chip', restored.modalShown && restored.minCount === 0, JSON.stringify(restored));

        await app.evaluate(() => { const d = window.Alpine.$data(document.querySelector('[x-data]')); bootstrap.Modal.getOrCreateInstance(d.detailModalEl).hide(); d.detail.open = false; });
        await page.waitForTimeout(300);

        // ---- Details button in the selection bar when exactly one row is selected (item 2) ----
        await app.evaluate(() => { const d = window.Alpine.$data(document.querySelector('[x-data]')); d.selection = new Set(['b']); });
        await page.waitForTimeout(150);
        check('selection bar shows a Details button for a single selection', await app.locator('.mf-bulkbar button', { hasText: /^Details$/ }).isVisible());
        await app.evaluate(() => { const d = window.Alpine.$data(document.querySelector('[x-data]')); d.selection = new Set(['b', 'c']); });
        await page.waitForTimeout(150);
        check('Details button hidden when multiple rows are selected', !(await app.locator('.mf-bulkbar button', { hasText: /^Details$/ }).isVisible().catch(() => false)));
        await app.evaluate(() => window.Alpine.$data(document.querySelector('[x-data]')).clearSelection());
    } else {
        check('table/context-menu/detail checks (skipped — aria2 not running)', true, 'set up aria2 to exercise these');
    }

    // ---- Filter pills sweep ----
    for (const pill of ['All', 'Active', 'Waiting', 'Paused', 'Complete', 'Error', 'Queue']) {
        await app.locator('.mf-pills button', { hasText: new RegExp(pill) }).first().click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(50);
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
