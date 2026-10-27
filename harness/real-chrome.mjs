// Real-extension test: loads dist/chrome into Chrome for Testing and drives the actual extension
// pages against the real bookmarks/storage/windows APIs (puppeteer can't do this for Firefox).
// Usage: npm run build:chrome && node harness/real-chrome.mjs [outdir] [--record]
//   --record rewrites tests/fixtures/chrome-bookmarks.json from this Chrome's behaviour.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { bookmarksContract } from '../tests/contract.mjs';
import { chromePath, checker } from './lib.mjs';
import puppeteer from 'puppeteer-core';

const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : mkdtempSync(join(tmpdir(), 'romeli-real-'));
const record = process.argv.includes('--record');
const FIXTURE = resolve(import.meta.dirname, '../tests/fixtures/chrome-bookmarks.json');
const { check, done } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

const browser = await puppeteer.launch({
  executablePath: chromePath(),
  headless: true,
  pipe: true,
  enableExtensions: [resolve(import.meta.dirname, '../dist/chrome')],
});
const swTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'));
const worker = await swTarget.worker();
const base = swTarget.url().replace(/\/background\.js$/, '');
log('extension:', base);

// 1. API contract: real Chrome must behave like the recorded fixture (and so like the mock).
const live = await worker.evaluate(bookmarksContract);
if (record) {
  writeFileSync(FIXTURE, JSON.stringify(live, null, 2) + '\n');
  log('recorded', FIXTURE);
} else {
  const want = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  for (const k of new Set([...Object.keys(want), ...Object.keys(live)])) {
    check(JSON.stringify(live[k]) === JSON.stringify(want[k]), `contract ${k}: got ${JSON.stringify(live[k])}, fixture ${JSON.stringify(want[k])}`);
  }
}

// 2. Seed real bookmarks.
await worker.evaluate(async () => {
  const b = chrome.bookmarks;
  const mk = (parentId, title, url) => b.create({ parentId, title, url });
  const linux = await mk('2', 'linux');
  const term = await mk(linux.id, 'terminal');
  await mk(term.id, 'Alacritty', 'https://alacritty.org/');
  await mk(term.id, 'kitty', 'https://sw.kovidgoyal.net/kitty/');
  const music = await mk('2', 'music');
  await mk(music.id, 'Bandcamp', 'https://bandcamp.com/');
  await mk('2', 'Hacker News', 'https://news.ycombinator.com/');
  await mk('1', 'On the bar', 'https://bar.example/');
});

const page = await browser.newPage();
await page.setViewport({ width: 1180, height: 640 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
// OpErrors are expected (refused operations are logged as well as shown in the status bar).
page.on('console', (m) => m.type() === 'error' && !/^OpError/.test(m.text()) && errors.push(m.text()));
const key = async (...ks) => {
  for (const k of ks) {
    if (k.length === 1) await page.keyboard.type(k);
    else if (k.includes('+')) {
      const [mod, last] = k.split('+');
      await page.keyboard.down(mod);
      await page.keyboard.press(last);
      await page.keyboard.up(mod);
    } else await page.keyboard.press(k);
    await sleep(60);
  }
  await sleep(400);
};
const text = (sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
const rows = () => page.$$eval('.current .row', (rs) => rs.map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
const locations = (url) =>
  worker.evaluate(async (url) => {
    const hits = await chrome.bookmarks.search({ url });
    const path = async (id) => {
      const [n] = await chrome.bookmarks.get(id);
      return n.parentId === '2' || n.parentId === '0' ? (n.parentId === '0' ? `<${n.title}>` : n.title) : `${await path(n.parentId)}/${n.title}`;
    };
    return (await Promise.all(hits.map((h) => (h.parentId === '2' ? '' : path(h.parentId))))).sort();
  }, url);
const goTo = async (title) => {
  await key('/');
  await page.keyboard.type(title);
  await key('Enter');
};

// 3. The browser UI on real bookmarks.
await page.goto(`${base}/ui/browser/index.html`);
await sleep(1200);
log('root rows:', await rows());
check(JSON.stringify(await rows()) === JSON.stringify(['▸ linux/ 1', '▸ music/ 1', '◆ toolbar/ 1', 'Hacker News']), 'root shows tags, toolbar/ (no menu/) and the untagged item');
const icon = await page.$eval('.current .row img.favicon', (i) => i.getAttribute('src')).catch(() => null);
log('favicon src:', icon);
check(icon?.startsWith(`${base}/_favicon/?pageUrl=`), 'favicons come from chrome _favicon');
await page.screenshot({ path: `${out}/real-01-root.png` });

// y + p: tag Alacritty with music/
await goTo('linux');
await key('l');
await goTo('terminal');
await key('l');
await goTo('Alacritty');
await key('y', 'g', 'h');
await goTo('music');
await key('l', 'p');
await sleep(400);
log('after paste:', await locations('https://alacritty.org/'));
check(JSON.stringify(await locations('https://alacritty.org/')) === JSON.stringify(['linux/terminal', 'music']), 'y+p adds a real bookmark copy');
await key('u');
await sleep(400);
check(JSON.stringify(await locations('https://alacritty.org/')) === JSON.stringify(['linux/terminal']), 'u removes the copy again');
await key('Control+r');
await sleep(400);
check(JSON.stringify(await locations('https://alacritty.org/')) === JSON.stringify(['linux/terminal', 'music']), 'C-r redoes it');

// d on the music copy, confirm with y, then undo
await goTo('Alacritty');
await key('d');
await sleep(200);
log('confirm:', await text('.confirm'));
await key('y');
await sleep(400);
check(JSON.stringify(await locations('https://alacritty.org/')) === JSON.stringify(['linux/terminal']), 'd removes one copy');
await key('u');
await sleep(400);
check(JSON.stringify(await locations('https://alacritty.org/')) === JSON.stringify(['linux/terminal', 'music']), 'undo of d restores it');

// x + p on a tag: move music/ under linux/, then undo
await key('g', 'h');
await goTo('music');
await key('x');
await goTo('linux');
await key('l', 'p');
await sleep(400);
check(JSON.stringify(await locations('https://bandcamp.com/')) === JSON.stringify(['linux/music']), 'x+p moves a real folder');
await key('u');
await sleep(400);
check(JSON.stringify(await locations('https://bandcamp.com/')) === JSON.stringify(['music']), 'undo moves it back');

// the toolbar root can't be deleted or renamed
await key('g', 'h');
await goTo('toolbar');
await key('d');
await sleep(300);
await key('y');
await sleep(400);
log('toolbar d+y:', await text('footer'));
check(/root folder/.test((await text('footer')) ?? ''), 'deleting toolbar/ is refused');
check(JSON.stringify(await locations('https://bar.example/')) === JSON.stringify(['<Bookmarks Bar>']), 'the bookmarks bar is untouched');
await key('Escape', 'r');
await sleep(300);
log('toolbar r:', await text('footer'));
check(/Chrome root folder/.test((await text('footer')) ?? ''), 'renaming toolbar/ is refused');
check(/Chrome root folder/.test((await text('footer')) ?? ''), 'renaming toolbar/ is refused');
await page.screenshot({ path: `${out}/real-02-after.png` });

// 3b. Batch ops vs Chrome's 120 writes/minute storage.sync quota: 150 items that each have a stored
// tag order (b before a). Deleting them all, undoing and redoing must not trip the quota.
const N = 150;
await worker.evaluate(async (N) => {
  const b = chrome.bookmarks;
  const a = await b.create({ parentId: '2', title: 'batch-a' });
  const bb = await b.create({ parentId: '2', title: 'batch-b' });
  const entries = [];
  for (let i = 0; i < N; i++) {
    const url = `https://batch-${i}.example/`;
    await b.create({ parentId: a.id, title: `item ${i}`, url });
    await b.create({ parentId: bb.id, title: `item ${i}`, url });
    entries.push([url, ['batch-b', 'batch-a']]);
  }
  // Same encoding as src/core/order.ts.
  const json = JSON.stringify(entries);
  const chunks = {};
  let n = 0;
  for (let i = 0; i < json.length; i += 2500) chunks[`order.${n++}`] = json.slice(i, i + 2500);
  await chrome.storage.sync.set({ ...chunks, 'order.count': n });
}, N);
// copies, stored overrides, and how many items have batch-b/ as their effective first tag
// (override first, else oldest copy; same tie-break as orderCopies in src/core/model.ts).
const batchState = () =>
  worker.evaluate(async () => {
    const hits = (await chrome.bookmarks.search('batch-')).filter((h) => h.url);
    const { ['order.count']: n = 0, ...rest } = await chrome.storage.sync.get(null);
    let json = '';
    for (let i = 0; i < n; i++) json += rest[`order.${i}`];
    const overrides = new Map(json ? JSON.parse(json).filter(([u]) => u.includes('batch-')) : []);
    const folders = new Map((await chrome.bookmarks.search('batch-')).filter((h) => !h.url).map((f) => [f.id, f.title]));
    const byUrl = new Map();
    for (const h of hits) byUrl.set(h.url, [...(byUrl.get(h.url) ?? []), h]);
    let bFirst = 0;
    for (const [url, copies] of byUrl) {
      const o = overrides.get(url);
      const oldest = [...copies].sort((x, y) => x.dateAdded - y.dateAdded || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))[0];
      if ((o ? o[0] : folders.get(oldest.parentId)) === 'batch-b') bFirst++;
    }
    return { copies: hits.length, overrides: overrides.size, bFirst };
  });
await page.reload();
await sleep(1500);
log('batch seeded:', await batchState());
check((await batchState()).bFirst === N, 'seeded orders put batch-b/ first');
await goTo('batch-a');
await key('l', 'Control+a', 'D');
await sleep(300);
await key('y');
await sleep(3000);
const footerAfterD = await text('footer');
log('batch D:', await batchState(), '|', footerAfterD);
check(!/quota/i.test(footerAfterD ?? ''), 'batch D does not hit the storage.sync quota');
check(JSON.stringify(await batchState()) === JSON.stringify({ copies: 0, overrides: 0, bFirst: 0 }), `D on ${N} items removes them and their stored orders`);
await key('u');
await sleep(4000);
log('batch undo:', await batchState(), '|', await text('footer'));
const undone = await batchState();
check(undone.copies === 2 * N && undone.bFirst === N, 'undo restores every copy, each still with batch-b/ first');
await key('Control+r');
await sleep(3000);
check(JSON.stringify(await batchState()) === JSON.stringify({ copies: 0, overrides: 0, bFirst: 0 }), 'redo removes them again');
await key('g', 'h');

// 4. Background: open-browser opens romeli in a single-instance popup window.
// (Commands can't be pressed from puppeteer, so use the runtime message the background also handles.)
const popups = () => worker.evaluate(async () => (await chrome.windows.getAll({ windowTypes: ['popup'], populate: true })).map((w) => w.tabs[0]?.url));
const popupsBefore = (await popups()).length;
await page.evaluate(() => chrome.runtime.sendMessage({ type: 'open-browser' }));
await sleep(800);
await page.evaluate(() => chrome.runtime.sendMessage({ type: 'open-browser' }));
await sleep(800);
const after = await popups();
log('popups:', after);
check(after.length === popupsBefore + 1 && after.every((u) => u.endsWith('/ui/browser/index.html')), 'open-browser opens exactly one popup window');

// 4b. Background: focused normal windows are tracked, popups aren't (Firefox's fallback for picking the window to open in).
// New windows get focus; windows.update({ focused }) fires no focus event while Chrome for Testing isn't the OS's front app.
const tracked = await worker.evaluate(async () => {
  const a = await chrome.windows.create({ type: 'normal', url: 'about:blank' });
  const b = await chrome.windows.create({ type: 'normal', url: 'about:blank' });
  await new Promise((r) => setTimeout(r, 500));
  const recent = (await chrome.storage.session.get('recentWindows')).recentWindows ?? [];
  const popupIds = (await chrome.windows.getAll({ windowTypes: ['popup'] })).map((w) => w.id);
  await chrome.windows.remove(a.id);
  await chrome.windows.remove(b.id);
  return { a: a.id, b: b.id, recent, popupIds };
});
log('tracked windows:', tracked);
check(tracked.recent[0] === tracked.b && tracked.recent[1] === tracked.a, 'focused normal windows are tracked, most recent first');
check(tracked.popupIds.length > 0 && !tracked.recent.some((id) => tracked.popupIds.includes(id)), "romeli's popup is not tracked");

// 5. Options page: read-only shortcuts.
await page.goto(`${base}/ui/options/index.html`);
await sleep(800);
const shortcuts = await text('section');
log('shortcuts:', shortcuts);
check(shortcuts?.includes('chrome://extensions/shortcuts'), 'options link to chrome://extensions/shortcuts');
check(!(await page.$('#key-goMenu')), 'goMenu is not offered on Chrome');
await page.screenshot({ path: `${out}/real-03-options.png` });

log('screenshots:', out);
log('ERRORS:', errors);
done(errors);
await browser.close();
