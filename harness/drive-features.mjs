// Checks: normalize prompt, yazi-style find, help pane, two-line delete confirm, s/S + Shift+Enter, form keys, settings errors.
import { BASE, TARGET, checker, launch } from './lib.mjs';
const out = process.argv[2] ?? '.';
const browser = await launch();
const { check, done } = checker();
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
const URL = BASE + '/browser.html';

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
const helpText = await text('.help');
check(helpText.includes('Sort by ' + (TARGET === 'chrome' ? 'Chrome' : 'Firefox') + ' order'), 'help names the browser in sort labels');
check(helpText.includes('Go to menu/') === (TARGET !== 'chrome'), 'Go to menu/ is listed only on Firefox');
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

// 7b. reveal: the shortcut opens romeli at the current tab's primary tag, or moves an open window there
const header = () => text('header');
const hoveredRow = () => page.$eval('.current .row.cursor', (r) => r.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
await page.goto(URL + '?reveal=' + encodeURIComponent('https://yazi-rs.github.io')); await sleep(1200);
await press('n'); // decline normalization
console.log('7b reveal on open:', await header(), '|', await hoveredRow());
check((await header()).includes('tool/CLI/'), 'reveal on open goes to the primary tag');
check((await hoveredRow())?.includes('yazi'), 'reveal on open puts the cursor on the item');
await page.evaluate(() => window.__message({ type: 'reveal', url: 'https://sw.kovidgoyal.net/kitty/' })); await sleep(300);
console.log('7b reveal message:', await header(), '|', await hoveredRow());
check((await header()).includes('linux/terminal/') && (await hoveredRow())?.includes('kitty'), 'reveal message moves an open window');
await page.evaluate(() => window.__message({ type: 'reveal', url: 'https://not-bookmarked.example' })); await sleep(300);
check((await header()).includes('linux/terminal/'), 'revealing an unbookmarked page stays put');
await shot('23b-reveal');

// 7c. g[ / g]: cycle through the hovered item's tags (yazi: tool/CLI/ primary, linux/terminal/ second)
await page.evaluate(() => window.__message({ type: 'reveal', url: 'https://yazi-rs.github.io' })); await sleep(300);
const where = async () => `${await header()} | ${await hoveredRow()}`;
await press('g'); await press(']'); console.log('7c g]:', await where());
check((await header()).includes('linux/terminal/') && (await hoveredRow())?.includes('yazi'), 'g] goes to the next tag, cursor on the item');
check((await text('footer'))?.includes('[2/2]'), 'g] reports the position among the tags');
await press('g'); await press(']'); console.log('7c g] again:', await where());
check((await header()).includes('tool/CLI/'), 'g] wraps around');
await press('g'); await press('['); console.log('7c g[:', await where());
check((await header()).includes('linux/terminal/') && (await hoveredRow())?.includes('yazi'), 'g[ goes to the previous tag');
await press('H'); check((await header()).includes('tool/CLI/'), 'H goes back from a tag jump');
await shot('23c-tag-cycle');

// 8. settings
await page.goto(BASE + '/options.html'); await sleep(1000);
console.log('8 bad names:', await text('section:nth-of-type(3)'));
await page.focus('#key-down'); await sleep(100);
await shot('24-settings-focus');
check(!(await page.$('#key-goMenu')) === (TARGET === 'chrome'), 'goMenu is configurable only on Firefox');

// 8b. keys JSON: export lists every action; import keeps the differences, reports junk and OS problems
const keysBox = 'section:nth-of-type(2) textarea';
const exported = JSON.parse(await page.$eval(keysBox, (t) => t.value));
check(exported.nextTagLocation?.[0] === 'g]' && ('goMenu' in exported) === (TARGET !== 'chrome'), 'keys JSON exports every available action');
const setKeysJson = (v) => page.$eval(keysBox, (t, v) => { t.value = v; t.dispatchEvent(new Event('input')); }, v);
await setKeysJson(JSON.stringify({ ...exported, up: ['K'], down: ['<A-˚>'], bogus: ['x'] }));
await page.$$eval('section:nth-of-type(2) button', (bs) => bs.find((b) => b.textContent === 'apply JSON').click());
await sleep(400);
const notes = await page.$$eval('section:nth-of-type(2) > .conflict', (n) => n.map((x) => x.textContent));
console.log('8b import notes:', notes);
check((await page.$eval('#key-up', (i) => i.value)) === 'K', 'imported keys are applied');
check(notes.some((n) => n.includes('bogus')) && notes.some((n) => n.includes('<A-˚>')), 'import reports unknown actions and ⌥ characters');
check(Object.keys(JSON.parse(await page.$eval(keysBox, (t) => t.value))).length === Object.keys(exported).length, 'JSON is rewritten after import');
await page.$eval(keysBox, (t) => t.scrollIntoView({ block: 'center' }));
await shot('24b-keys-json');
await page.evaluate(() => window.scrollTo(0, 0));
await page.$$eval('section:nth-of-type(2) button', (bs) => bs.find((b) => b.textContent === 'reset all').click());
await sleep(300);
check((await page.$eval('#key-up', (i) => i.value)) === 'k <Up>' && JSON.parse(await page.$eval(keysBox, (t) => t.value)).up[0] === 'k', 'reset all also resets the JSON');
if (TARGET === 'chrome') {
  // Chrome can't change extension shortcuts itself: read-only list + link to its settings page.
  const shortcuts = await text('section:nth-of-type(1)');
  console.log('8 shortcuts:', shortcuts);
  check(shortcuts.includes('chrome://extensions/shortcuts'), 'shortcuts section points to chrome://extensions/shortcuts');
  check((await page.$('#cmd-open-browser')) === null, 'no editable shortcut inputs on Chrome');
  await page.$$eval('button', (bs) => bs.find((b) => b.textContent.includes('open shortcut settings')).click());
  await sleep(200);
  const calls = await page.evaluate(() => JSON.stringify(window.__calls));
  console.log('8 calls:', calls);
  check(calls.includes('chrome://extensions/shortcuts'), 'button opens chrome://extensions/shortcuts');
  await shot('25-settings-shortcuts');
} else {
  await page.evaluate(() => {
    browser.commands.update = async () => { throw new Error('Type error for parameter detail'); };
  });
  await page.focus('#cmd-open-browser');
  await page.keyboard.down('Meta'); await page.keyboard.press('a'); await page.keyboard.up('Meta');
  await type('Bogus+Q'); await press('Tab');
  await sleep(4500);
  console.log('8 status after 4.5s:', await text('.status'), '| inline:', await text('.error-line'));
  await shot('25-settings-error');
}
console.log('ERRORS:', errors);
done(errors);
await browser.close();
