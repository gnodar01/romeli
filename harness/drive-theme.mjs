// Usage: node harness/drive-theme.mjs <outdir>  (requires `npm run harness`)
// Drives the theme editor on the options page, then checks that the browser window follows stored themes live.
import { BASE, checker, launch } from './lib.mjs';

const out = process.argv[2] ?? '.';
const browser = await launch();
const { done } = checker();
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 900 });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const log = (...a) => console.log(...a);
const cssVar = (v) => page.evaluate((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim(), v);
const stored = () => page.evaluate(async () => JSON.stringify((await (globalThis.browser ?? globalThis.chrome).storage.sync.get('theme')).theme ?? {}));
const status = () => page.$eval('.status', (e) => e.textContent.trim()).catch(() => '(none)');
/** Replace an input's value as a user would and fire `change` (Tab away). */
const setInput = async (sel, value) => {
  await page.$eval(sel, (e) => (e.focus(), e.select()));
  await page.keyboard.press('Backspace');
  await page.keyboard.type(value);
  await page.keyboard.press('Tab');
  await sleep(250);
};
const clickButton = async (label) => {
  const buttons = await page.$$('button');
  for (const b of buttons) if ((await b.evaluate((e) => e.textContent.trim())) === label) return b.click().then(() => sleep(250));
  throw new Error(`no button "${label}"`);
};
const scrollTo = (sel) => page.$eval(sel, (e) => e.scrollIntoView({ block: 'start' }));

await page.goto(BASE + '/options.html');
await page.evaluate(() => localStorage.clear());
await page.reload();
await sleep(1000);

await scrollTo('.preview');
await shot('30-theme-default');
log('default --p-bg:', await cssVar('--p-bg'), '--tag:', await cssVar('--tag'), 'stored:', await stored());

// preset
await clickButton('Alucard');
log('alucard --p-bg:', await cssVar('--p-bg'), 'scheme:', await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme));
await scrollTo('.preview');
await shot('31-theme-alucard');

// role override with a palette name, then with a raw color, then an invalid one
await setInput('#role-tag', 'green');
log('tag -> green:', await cssVar('--tag'), '| status:', await status());
await setInput('#role-cursor-tag-bg', '#ff0000');
log('cursor-tag-bg -> #ff0000:', await cssVar('--cursor-tag-bg'));
await setInput('#role-url', 'banana');
log('invalid role status:', await status(), '| url still:', await cssVar('--url'));
await page.keyboard.press('Escape');

// palette slot
await setInput('#pal-pink', 'rgb(0, 128, 255)');
log('pink slot:', await cssVar('--p-pink'), '| accent follows:', await cssVar('--accent'));

// font size & row height
await setInput('#font-size', '15');
await setInput('#row-height', '26');
log('font-size:', await cssVar('--font-size'), 'row:', await cssVar('--row'));
log('stored:', await stored());
await scrollTo('.preview');
await shot('32-theme-custom');

// role filter
await page.type('.filter[placeholder="filter roles…"]', 'badge');
log('filtered roles:', await page.$$eval('[id^="role-"]', (es) => es.map((e) => e.id.slice(5)).join(' ')));
await scrollTo('.filter[placeholder="filter roles…"]');
await shot('33-theme-roles-filtered');

// JSON import (partial + one bad key)
await page.$eval('textarea.json', (t) => {
  t.value = JSON.stringify({ palette: { bg: '#102030' }, roles: { tag: 'yellow', nope: 'red' } });
  t.dispatchEvent(new Event('input', { bubbles: true }));
});
await clickButton('apply JSON');
await sleep(200);
log('import status:', await status(), '| stored:', await stored());
await page.keyboard.press('Escape');

// native controls follow the background role's brightness
await setInput('.filter[placeholder="filter roles…"]', '');
await setInput('#role-bg', '#f0f0f0');
log('light bg role -> scheme:', await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme));

// reset
await clickButton('reset theme');
log('after reset scheme:', await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme));
log('after reset stored:', await stored(), '--p-bg:', await cssVar('--p-bg'), '--row:', await cssVar('--row'));

// The browser window follows a theme written to storage (as another window would).
await page.goto(BASE + '/browser.html');
await sleep(1200);
await page.keyboard.press('n'); // decline the normalization prompt
await sleep(200);
const alucard = await page.evaluate(async () => {
  await (globalThis.browser ?? globalThis.chrome).storage.sync.set({
    theme: {
      palette: { bg: '#fffbeb', 'bg-dark': '#f4efd9', 'bg-darker': '#e9e3ca', cur: '#cfcfde', fg: '#1f1f1f', comment: '#635d97', cyan: '#036a96', green: '#14710a', orange: '#a34d14', pink: '#a3144d', purple: '#644ac9', red: '#cb3a2a', yellow: '#846e15' },
    },
  });
  await new Promise((r) => setTimeout(r, 400));
  return getComputedStyle(document.body).backgroundColor;
});
log('browser body bg after live theme change:', alucard, 'scheme:', await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme));
for (const k of ['j', 'j', 'l', 'v']) await page.keyboard.press(k);
await page.keyboard.press('j');
await sleep(300);
await shot('34-browser-alucard');
await page.keyboard.press('Escape');
await page.keyboard.press('?');
await sleep(300);
await shot('35-help-alucard');

await page.evaluate(() => localStorage.clear());
log('ERRORS:', errors);
done(errors);
await browser.close();
