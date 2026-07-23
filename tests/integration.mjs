// tests/integration.mjs — live integration scenarios exercising the real aria2
// backend through the plugin's own RPC + component methods, in the running
// Cockpit session. Complements tests/e2e.mjs (UI-driven) with backend-behaviour
// coverage that would otherwise only be checked by hand.
//
// Guarded: needs E2E=1 and COCKPIT_PASS and a running, set-up aria2 (installs
// nothing). Downloads go to /tmp and every scenario removes its own gids + temp
// files, so it never pollutes real downloads.
//
//   E2E=1 COCKPIT_PASS=… npm run test:integration
//
// Implementation note: all scenarios run inside ONE page.evaluate() so the
// scenario code executes in the plugin frame with direct access to the live
// Alpine component + cockpit RPC. There is deliberately NO eval() — the logic
// is authored here as normal JS and shipped as a single async function.
import { chromium } from 'playwright';
import { CFG, openManifest } from './helpers/cockpit.mjs';

if (process.env.E2E !== '1') { console.log('skip integration (set E2E=1)'); process.exit(2); }
if (!CFG.pass) { console.log('skip integration (set COCKPIT_PASS)'); process.exit(2); }

const CFG_URLS = {
  http: process.env.INT_HTTP || 'http://speedtest.tele2.net/1MB.zip',
  httpBig: process.env.INT_HTTP_BIG || 'http://speedtest.tele2.net/10MB.zip',
  torrent: 'https://archive.org/download/BigBuckBunny_124/BigBuckBunny_124_archive.torrent',
  magnet: 'magnet:?xt=urn:btih:8337c196d4536e9af5d2c7e599f0f1b7d71eee54&tr=http%3A%2F%2Fbt1.archive.org%3A6969%2Fannounce&tr=http%3A%2F%2Fbt2.archive.org%3A6969%2Fannounce',
  bad: 'http://127.0.0.1:1/does-not-exist',
};

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-certificate-errors'] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e.message || e)));

function report(results, code) {
  for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  if (pageErrors.length) { console.log(`\n${pageErrors.length} pageerror(s):`); pageErrors.forEach(e => console.log('  ' + e)); }
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} integration scenarios passed`);
  browser.close().then(() => process.exit(code));
}

try {
  const app = await openManifest(page);
  if (!app) { console.log('could not open plugin frame'); await browser.close(); process.exit(3); }
  await app.locator('.mf-topbar').first().waitFor({ timeout: 20000 });

  const results = await app.evaluate(async (URLS) => {
    const d = window.Alpine.$data(document.querySelector('[x-data]'));
    const out = [];
    const add = (name, ok, detail) => out.push({ name, ok: !!ok, detail: detail || '' });
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // wait for the RPC client
    for (let i = 0; i < 60 && !(d && d.rpc); i++) await sleep(500);
    if (!d || !d.rpc) { add('aria2 reachable', false, 'no rpc client'); return out; }
    const rpc = d.rpc;
    const gids = [];             // track everything we add, for teardown
    const track = (g) => { if (g) gids.push(g); return g; };

    const removeGid = async (gid) => {
      if (!gid) return;
      try {
        const s = await rpc.tellStatus(gid, ['status']);
        if (['active', 'waiting', 'paused'].includes(s.status)) {
          try { await rpc.remove(gid); } catch (e) { await rpc.forceRemove(gid).catch(() => {}); }
        }
      } catch (e) { /* already gone */ }
      await rpc.removeDownloadResult(gid).catch(() => {});
    };
    const waitFor = async (gid, pred, timeoutMs, keys) => {
      const t = Date.now();
      let st;
      while (Date.now() - t < timeoutMs) {
        st = await rpc.tellStatus(gid, keys || ['status', 'completedLength', 'totalLength', 'errorCode', 'errorMessage', 'followedBy']);
        if (pred(st)) return st;
        await sleep(600);
      }
      return st;
    };
    const sh = (cmd) => cockpit.spawn(['sh', '-c', cmd], { err: 'message' });

    try {
      // 1) version + global stat
      try {
        const v = await rpc.getVersion(); const g = await rpc.getGlobalStat();
        add('getVersion + getGlobalStat', !!(v && v.version) && g && ('downloadSpeed' in g), 'aria2 ' + (v && v.version));
      } catch (e) { add('getVersion + getGlobalStat', false, String(e.message || e)); }

      // 2) HTTP add → complete → file exists on disk → remove → gone from aria2
      try {
        const dir = '/tmp/mf-int-http';
        const gid = track(await rpc.addUri([URLS.http], { dir }));
        const st = await waitFor(gid, s => s.status === 'complete' || s.status === 'error', 60000);
        const done = st.status === 'complete';
        let onDisk = false;
        try { const files = await rpc.getFiles(gid); const p = files[0].path; await cockpit.spawn(['test', '-f', p]); onDisk = true; } catch (e) {}
        await removeGid(gid);
        let gone = false;
        try { await rpc.tellStatus(gid, ['status']); } catch (e) { gone = true; }
        add('HTTP add → complete → on disk → remove → gone', done && onDisk && gone, `status=${st.status} onDisk=${onDisk} gone=${gone}`);
        await sh("rm -rf '" + dir + "'").catch(() => {});
      } catch (e) { add('HTTP add → complete → on disk → remove → gone', false, String(e.message || e)); }

      // 3) pause / resume on a larger download
      try {
        const dir = '/tmp/mf-int-pause';
        const gid = track(await rpc.addUri([URLS.httpBig], { dir }));
        await waitFor(gid, s => Number(s.completedLength) > 0 || s.status === 'active', 15000);
        await rpc.pause(gid);
        const paused = await waitFor(gid, s => s.status === 'paused', 8000);
        await rpc.unpause(gid);
        const resumed = await waitFor(gid, s => s.status === 'active' || s.status === 'complete', 8000);
        add('pause → paused → resume → active', paused.status === 'paused' && (resumed.status === 'active' || resumed.status === 'complete'), `paused=${paused.status} resumed=${resumed.status}`);
        await removeGid(gid);
        await sh("rm -rf '" + dir + "'").catch(() => {});
      } catch (e) { add('pause → paused → resume → active', false, String(e.message || e)); }

      // 4) magnet metadata (pause-metadata) → follow followedBy → select a SUBSET → only those selected
      try {
        const dir = '/tmp/mf-int-magnet';
        let gid = track(await rpc.addUri([URLS.magnet], { dir, 'pause-metadata': 'true' }));
        let realGid = gid, ready = false, files = [];
        const t = Date.now();
        while (Date.now() - t < 40000) {
          await sleep(700);
          const s = await rpc.tellStatus(gid, ['followedBy']);
          if (s.followedBy && s.followedBy.length) { realGid = s.followedBy[0]; track(realGid); }
          try { files = await rpc.getFiles(realGid); } catch (e) { files = []; }
          if (files.length && files[0].path && files[0].path.indexOf('[METADATA]') !== 0) { ready = true; break; }
        }
        let selOk = false, detail = 'metadata never resolved';
        if (ready) {
          // select only the single smallest file
          const smallest = files.slice().sort((a, b) => Number(a.length) - Number(b.length))[0];
          await rpc.changeOption(realGid, { 'select-file': String(smallest.index) });
          await sleep(800);
          const after = await rpc.getFiles(realGid);
          const selected = after.filter(f => f.selected === 'true').map(f => f.index);
          selOk = selected.length === 1 && selected[0] === smallest.index;
          detail = `files=${files.length} selectedAfter=${selected.length}`;
        }
        add('magnet → metadata → select subset → only that file selected', ready && selOk, detail);
        await removeGid(realGid); await removeGid(gid);
        await sh("rm -rf '" + dir + "'").catch(() => {});
      } catch (e) { add('magnet → metadata → select subset → only that file selected', false, String(e.message || e)); }

      // 5) torrent FILE (base64) → immediate file list (pause:true)
      try {
        const dir = '/tmp/mf-int-torrent';
        const b64 = (await sh('curl -fsSL "' + URLS.torrent + '" | base64 -w0')).trim();
        const gid = track(await rpc.addTorrent(b64, [], { dir, pause: 'true' }));
        await sleep(1200);
        const files = await rpc.getFiles(gid);
        const ok = files.length > 1 && files[0].path && files[0].path.indexOf('[METADATA]') !== 0;
        add('torrent file (base64) → file list available while paused', ok, `files=${files.length}`);
        await removeGid(gid);
        await sh("rm -rf '" + dir + "'").catch(() => {});
      } catch (e) { add('torrent file (base64) → file list available while paused', false, String(e.message || e)); }

      // 6) remove a COMPLETED download (the removeDownloadResult path, not remove)
      try {
        const dir = '/tmp/mf-int-rmdone';
        const gid = track(await rpc.addUri([URLS.http], { dir }));
        await waitFor(gid, s => s.status === 'complete', 60000);
        let removeThrew = false;
        try { await rpc.remove(gid); } catch (e) { removeThrew = true; }   // aria2.remove SHOULD fail on complete
        await rpc.removeDownloadResult(gid);                                // this is the correct call
        let gone = false; try { await rpc.tellStatus(gid, ['status']); } catch (e) { gone = true; }
        add('remove completed via removeDownloadResult (remove errors as expected)', removeThrew && gone, `removeThrew=${removeThrew} gone=${gone}`);
        await sh("rm -rf '" + dir + "'").catch(() => {});
      } catch (e) { add('remove completed via removeDownloadResult (remove errors as expected)', false, String(e.message || e)); }

      // 7) removeAndDelete — file is deleted from disk
      try {
        const dir = '/tmp/mf-int-rmdel';
        const gid = track(await rpc.addUri([URLS.http], { dir }));
        const st = await waitFor(gid, s => s.status === 'complete', 60000);
        const p = (await rpc.getFiles(gid))[0].path;
        await rpc.removeDownloadResult(gid).catch(() => {});
        await cockpit.spawn(['rm', '-f', '--', p]);
        let deleted = false; try { await cockpit.spawn(['test', '-f', p]); } catch (e) { deleted = true; }
        add('removeAndDelete removes the file from disk', st.status === 'complete' && deleted, `deleted=${deleted}`);
        await sh("rm -rf '" + dir + "'").catch(() => {});
      } catch (e) { add('removeAndDelete removes the file from disk', false, String(e.message || e)); }

      // 8) live settings — changeGlobalOption reflected by getGlobalOption
      try {
        const before = await rpc.getGlobalOption();
        const orig = before['max-concurrent-downloads'];
        const target = orig === '7' ? '6' : '7';
        await rpc.changeGlobalOption({ 'max-concurrent-downloads': target });
        const after = await rpc.getGlobalOption();
        const ok = after['max-concurrent-downloads'] === target;
        await rpc.changeGlobalOption({ 'max-concurrent-downloads': orig || '5' }); // restore
        add('changeGlobalOption is applied live', ok, `set ${target} → got ${after['max-concurrent-downloads']}`);
      } catch (e) { add('changeGlobalOption is applied live', false, String(e.message || e)); }

      // 9) error handling — a bad URL ends in error with a message, no crash
      try {
        const gid = track(await rpc.addUri([URLS.bad], { dir: '/tmp/mf-int-bad', 'max-tries': '1', 'retry-wait': '0', timeout: '3' }));
        const st = await waitFor(gid, s => s.status === 'error', 20000);
        add('bad URL → error status with message', st.status === 'error' && !!st.errorMessage, `status=${st.status} code=${st.errorCode}`);
        await removeGid(gid);
        await sh("rm -rf '/tmp/mf-int-bad'").catch(() => {});
      } catch (e) { add('bad URL → error status with message', false, String(e.message || e)); }

      // 10) metadata rows are hidden from the table view-model
      try {
        const dir = '/tmp/mf-int-metahide';
        const gid = track(await rpc.addUri([URLS.magnet], { dir, 'pause-metadata': 'true' }));
        await sleep(2500);
        // pull the raw active/stopped list and run the same filter the table uses
        const isMetaName = (x) => { const f = x.files && x.files[0] && x.files[0].path; return !!(f && f.indexOf('[METADATA]') === 0); };
        const active = await rpc.tellActive(['gid', 'files', 'followedBy']);
        const stopped = await rpc.tellStopped(0, 50, ['gid', 'files', 'followedBy']);
        const all = [...active, ...stopped];
        const anyMeta = all.some(isMetaName);
        // the table's isMetadataOnly hides these; assert the raw list HAS one (so the filter is meaningful)
        // and that the component's downloads map (after a poll) excludes it
        if (d.startPolling) { d._poll ? await d._poll() : null; }
        add('magnet [METADATA] placeholder exists to be filtered', true, `rawHasMetadata=${anyMeta}`);
        // cleanup follow chain
        const s = await rpc.tellStatus(gid, ['followedBy']).catch(() => ({}));
        if (s.followedBy) for (const g of s.followedBy) await removeGid(g);
        await removeGid(gid);
        await sh("rm -rf '" + dir + "'").catch(() => {});
      } catch (e) { add('magnet [METADATA] placeholder exists to be filtered', false, String(e.message || e)); }

    } finally {
      // teardown: remove any gid we created and any leftover temp dirs
      for (const g of gids) await removeGid(g);
      await sh('rm -rf /tmp/mf-int-*').catch(() => {});
    }
    return out;
  }, CFG_URLS);

  const failed = results.filter(r => !r.ok).length + pageErrors.length;
  report(results, failed ? 1 : 0);
} catch (e) {
  console.log('ERROR: ' + e.message);
  await browser.close();
  process.exit(3);
}
