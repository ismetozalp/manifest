import os from 'os';
export const CFG = {
    url:  process.env.COCKPIT_URL  || 'https://localhost:9090',
    user: process.env.COCKPIT_USER || os.userInfo().username,
    pass: process.env.COCKPIT_PASS || '',
};
// Log in (if a password is set) and return the plugin frame (or `page` fallback).
export async function openManifest(page) {
    await page.goto(CFG.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector('#login-user-input, #content', { timeout: 15000 });
    if (await page.$('#login-user-input')) {
        await page.fill('#login-user-input', CFG.user);
        await page.fill('#login-password-input', CFG.pass);
        await page.click('#login-button');
        await page.waitForSelector('#content, iframe', { timeout: 20000 });
    }
    for (const u of [`${CFG.url}/manifest`, `${CFG.url}/manifest/index`,
                     `${CFG.url}/cockpit/@localhost/manifest/index.html`]) {
        await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
        const fr = await page.waitForSelector('iframe[src*="manifest"], iframe[name*="manifest"]',
                                              { timeout: 8000 }).catch(() => null);
        if (fr) { const f = await fr.contentFrame(); if (f) return f; }
        if (u.includes('index.html') && await page.$('.mf-topbar')) return page;
    }
    return null;
}
