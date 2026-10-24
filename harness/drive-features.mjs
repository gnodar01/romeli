// Checks: normalize prompt, yazi-style find, help pane, two-line delete confirm, s/S + Shift+Enter, form keys, settings errors.
import puppeteer from 'puppeteer-core';
const out = process.argv[2] ?? '.';
const browser = await puppeteer.launch({ browser: 'firefox', executablePath: '/Applications/Firefox.app/Contents/MacOS/firefox', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1180, height: 640 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const press = async (k, mod) => {
  if (mod) await page.keyboard.down(mod);
  await page.keyboard.press(k);
  if (mod) await page.keyboard.up(mod);
  await sleep(120);
};
const type = async (s) => { await page.keyboard.type(s, { delay: 25 }); await sleep(200); };
const text = (sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
const rows = () => page.$$eval('.current .row', (rs) => rs.map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const URL = 'http://localhost:5199/harness/browser.html';

// 1. normalize prompt
await page.goto(URL); await sleep(1200);
console.log('1 prompt:', await text('.confirm'));
await shot('20-normalize');
await press('y'); await sleep(600);
console.log('1 after y rows:', (await rows()).filter((r) => /news|testing/.test(r)));
await press('u'); await sleep(600);
console.log('1 after undo rows:', (await rows()).filter((r) => /news|testing/.test(r)));
// harness storage is in-memory, so test "no" within one page life: settings flag flips
await page.goto(URL); await sleep(1200);
await press('n'); await sleep(300);
console.log('1 after n footer:', await text('footer'));

// 2. find
await press('/'); await type('in');
await press('Enter'); await sleep(200);
console.log('2 found spans:', await page.$$eval('.current .found', (f) => f.map((x) => x.textContent)));
console.log('2 footer:', await text('footer'));
await press('n'); console.log('2 after n:', await text('footer .find'));
await press('N'); console.log('2 after N:', await text('footer .find'));
await shot('21-find');
await press('Escape'); console.log('2 after Esc spans:', (await page.$$('.current .found')).length);

// 3. help pane
await press('?'); await sleep(200);
const st = () => page.$eval('.help .body', (b) => b.scrollTop);
console.log('3 help open, scrollTop', await st());
await press('j'); await press('j'); console.log('3 after jj', await st());
await press('J'); console.log('3 after J', await st());
await press('K'); console.log('3 after K', await st());
await shot('22-help');
await press('Escape'); console.log('3 closed:', (await page.$('.help')) === null);

// 4. long-name delete confirm
await press('g'); await press('h');
await press('/'); await type('news'); await press('Enter'); await press('l');
await press('d'); await sleep(200);
console.log('4 confirm entries:', await page.$$eval('.confirm .entry', (es) => es.map((e) => [...e.querySelectorAll('.line')].map((l) => l.textContent))));
await shot('23-delete');
await press('n');

// 5. S tags + Shift+Enter → new romeli tab
await press('S'); await type('term');
console.log('5 S rows:', (await page.$$eval('.picker .row', (r) => r.map((x) => x.textContent.trim()))).slice(0, 3));
await press('Enter', 'Shift'); await sleep(200);
console.log('5 tabs:', await text('.tabs'), '| header:', await text('header .path'));

// 6. s items + Shift+Enter → browser tab
await press('s'); await type('alac');
await press('Enter', 'Shift'); await sleep(200);
console.log('6 calls:', JSON.stringify(await page.evaluate(() => window.__calls)));

// 7. edit form keys
await press('/'); await type('Alac'); await press('Enter');
await press('e'); await sleep(300);
const focusedLabel = () => page.evaluate(() => document.activeElement?.closest('.field')?.querySelector('.label')?.textContent);
console.log('7 initial focus:', await focusedLabel());
await press('Enter'); console.log('7 Enter →', await focusedLabel());
await press('Enter'); console.log('7 Enter →', await focusedLabel());
await press('Enter'); console.log('7 Enter →', await focusedLabel());
console.log('7 form still open:', (await page.$('.form')) !== null);
await press('Enter', 'Meta'); await sleep(500);
console.log('7 after Cmd+Enter form open:', (await page.$('.form')) !== null);

// 8. settings
await page.goto('http://localhost:5199/harness/options.html'); await sleep(1000);
console.log('8 bad names:', await text('section:nth-of-type(3)'));
await page.focus('#key-down'); await sleep(100);
await shot('24-settings-focus');
await page.evaluate(() => {
  browser.commands.update = async () => { throw new Error('Type error for parameter detail'); };
});
await page.focus('#cmd-open-browser');
await page.keyboard.down('Meta'); await page.keyboard.press('a'); await page.keyboard.up('Meta');
await type('Bogus+Q'); await press('Tab');
await sleep(4500);
console.log('8 status after 4.5s:', await text('.status'), '| inline:', await text('.error-line'));
await shot('25-settings-error');
console.log('ERRORS:', errors);
await browser.close();
