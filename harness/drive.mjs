// Usage: node harness/drive.mjs <outdir>  (requires `npx vite --config harness/vite.config.ts`)
import puppeteer from 'puppeteer-core';

const out = process.argv[2] ?? '.';
const browser = await puppeteer.launch({
  browser: 'firefox',
  executablePath: process.env.FIREFOX ?? '/Applications/Firefox.app/Contents/MacOS/firefox',
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 1180, height: 640 });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keys = async (...ks) => {
  for (const k of ks) {
    if (k.length > 1 && !k.includes('+')) await page.keyboard.press(k);
    else if (k.includes('+') && k.length > 1) {
      const parts = k.split('+');
      for (const p of parts.slice(0, -1)) await page.keyboard.down(p);
      await page.keyboard.press(parts.at(-1));
      for (const p of parts.slice(0, -1).reverse()) await page.keyboard.up(p);
    } else await page.keyboard.type(k);
    await sleep(40);
  }
  await sleep(250);
};
const type = async (s) => {
  await page.keyboard.type(s, { delay: 20 });
  await sleep(200);
};
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const text = (sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim());
const state = () => page.evaluate(() => JSON.stringify(window.__api.dump()));
const log = (...a) => console.log(...a);

await page.goto('http://localhost:5199/harness/browser.html');
await sleep(1200);
await keys('n'); // decline the folder-name normalization prompt
await shot('01-root');
log('header:', await text('header'));
log('footer:', await text('footer'));

// navigate into linux/terminal
await keys('j', 'j'); // tags-first alpha: toolbar? order check below
log('after jj footer:', await text('footer'));
await keys('g', 'g');
const rows = await page.$$eval('.current .row', (rs) => rs.map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
log('root rows:', rows);
const linuxIdx = rows.findIndex((r) => r.startsWith('▸ linux/'));
for (let i = 0; i < linuxIdx; i++) await keys('j');
await keys('l');
log('in linux:', await text('header'));
await keys('g', 'g', 'l'); // kernel? whichever first
log('entered:', await text('header'));
await keys('h');
// find terminal with /
await keys('/');
await type('term');
await keys('Enter');
await keys('l');
log('terminal:', await text('header'));
await shot('02-terminal');
const trows = await page.$$eval('.current .row', (rs) => rs.map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
log('terminal rows:', trows);

// which-key
await keys('g');
await shot('03-whichkey');
log('whichkey:', await text('.whichkey'));
await keys('Escape');

// hover yazi and check preview
await keys('/');
await type('yazi');
await keys('Enter');
log('preview:', await text('.preview'));

// yank yazi, go to music and paste -> adds tag music/
await keys('y');
await keys('g', 'h');
await keys('/');
await type('music');
await keys('Enter', 'l', 'p');
await sleep(400);
log('after paste footer:', await text('footer'));
log('music rows:', await page.$$eval('.current .row', (rs) => rs.map((r) => r.textContent.replace(/\s+/g, ' ').trim())));
const afterPaste = await state();

// undo
await keys('u');
await sleep(400);
log('after undo footer:', await text('footer'));
log('music rows after undo:', await page.$$eval('.current .row', (rs) => rs.map((r) => r.textContent.replace(/\s+/g, ' ').trim())));
await keys('Control+r');
await sleep(400);
log('redo restores:', (await state()) === afterPaste);

// visual select + delete with confirm
await keys('g', 'h', '/');
await type('tool');
await keys('Enter', 'l', '/');
await type('CLI');
await keys('Enter', 'l', 'v', 'j');
await shot('04-visual');
await keys('d');
await sleep(200);
await shot('05-confirm');
log('confirm:', await text('.confirm'));
await keys('n');
log('after n mode:', await text('footer .mode'));
await keys('Escape');

// rename via r
await keys('g', 'g', 'r');
await page.keyboard.down('Control');
await page.keyboard.press('u');
await page.keyboard.up('Control');
await type('rg — ripgrep');
await keys('Enter');
await sleep(300);
log('rows after rename:', await page.$$eval('.current .row', (rs) => rs.map((r) => r.textContent.replace(/\s+/g, ' ').trim())));

// edit tags with e: add ", lin" + Tab
await keys('/');
await type('rg');
await keys('Enter', 'e');
await sleep(300);
await type('lin');
await shot('06-edit-complete');
log('completions:', await text('.completions'));
await keys('Tab');
await type('term');
await keys('Tab');
log('tags field:', await page.$eval('.tag-input input', (i) => i.value));
await keys('Meta+Enter');
await sleep(500);
log('rg tags (preview):', await text('.preview'));

// jump picker
await keys('z');
await type('kern');
await shot('07-jump');
await keys('Enter');
log('jumped:', await text('header'));

// open with o and O
await keys('g', 'g', 'o');
await keys('O');
log('calls:', JSON.stringify(await page.evaluate(() => window.__calls)));

// create a tag via a
await keys('a');
await type('newtag/');
await keys('Enter');
await sleep(400);
log('rows after create tag:', await page.$$eval('.current .row', (rs) => rs.map((r) => r.textContent.replace(/\s+/g, ' ').trim())));

// help
await keys('?');
await shot('08-help');
log('help groups:', await page.$$eval('.help .group', (g) => g.map((x) => x.textContent)));
await keys('Escape');

// tabs
await keys('t');
await keys('g', 'h');
log('tabs:', await text('.tabs'));
await keys('1');
log('tab1 header:', await text('header'));

// delete a tag with confirm y, then undo
await keys('g', 'h', '/');
await type('linux');
await keys('Enter', 'd');
log('tag delete confirm:', await text('.confirm'));
const beforeDel = await state();
await keys('y');
await sleep(500);
log('root after tag delete:', await page.$$eval('.current .row', (rs) => rs.map((r) => r.textContent.replace(/\s+/g, ' ').trim())));
await keys('u');
await sleep(600);
log('undo tag delete exact:', (await state()) === beforeDel);
await shot('09-final');

log('ERRORS:', errors);
await browser.close();
