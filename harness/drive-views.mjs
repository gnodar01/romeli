// Checks views: the T dialog, read-only view tabs and g., the K editor (add, pick tags, parent
// replace, ! ~, undo/redo, rename var, x/p), tag renames rewriting references (and their undo),
// delete-tag warnings, and the options page's text import/export. Seeded views: harness/shim.ts.
import { BASE, checker, launch } from './lib.mjs';
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
  await sleep(150);
};
const type = async (s) => { await page.keyboard.type(s, { delay: 25 }); await sleep(250); };
const text = (sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
const all = (sel) => page.$$eval(sel, (rs) => rs.map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const rows = () => all('.current .row');
const listRows = () => all('.editor .col:first-child .row');
const exprRows = () => all('.editor .col:last-child .row');

await page.goto(BASE + '/browser.html'); await sleep(1200);
await press('n'); // dismiss the tidy-up prompt

// 1. T: the dialog lists the seeded views with counts
await press('T'); await sleep(200);
const dlg = await all('.dialog .row');
console.log('1 dialog:', dlg);
check(dlg.length === 2 && dlg[0] === 'linux stuff 5' && dlg[1] === 'cli 2', 'dialog lists views with counts');
await shot('40-views-dialog');
// keys don't reach the browser underneath: j moves the dialog cursor only
const before = await text('header .path');
await press('j');
check((await text('header .path')) === before, 'dialog keys do not move the browser');
await press('k');
// select both and open them as tabs
await press(' '); await press(' '); await press('Enter'); await sleep(300);
const tabs = await all('header .tab');
console.log('1 tabs:', tabs);
check(tabs.length === 3 && tabs[1].includes('◇linux stuff') && tabs[2].includes('◇cli'), 'Enter opens the selected views as tabs');
check(!(await page.$('.dialog')), 'the dialog closes');

// 2. the cli view tab (active): its projection, read-only, g.
console.log('2 cli root:', await rows());
check((await rows()).join('|') === '▸ linux/ 1|▸ tool/ 1', 'cli view shows only its scope');
await press('l'); await sleep(100);
console.log('2 cli first tag:', await text('header .path'), await rows());
await press('d'); await sleep(100);
check((await text('footer'))?.includes('read-only'), 'd is refused in a view tab');
await shot('41-view-tab');
// tool/CLI holds ripgrep and yazi; go there and put the cursor on yazi
await press('h'); await press('j'); await press('l'); await press('l'); await sleep(100);
console.log('2 tool/CLI in view:', await rows());
check((await rows()).length === 2, 'tool/CLI in the view holds ripgrep and yazi');
await press('/'); await type('yazi'); await press('Enter');
await press('g'); await press('.'); await sleep(200);
const afterG = await all('header .tab');
console.log('2 after g.:', afterG, await text('header .path'));
check(afterG[0].includes('CLI') && (await page.$eval('header .tab.active', (e) => e.textContent)).startsWith('1'), 'g. switches to tab 1 at the primary tag');
check((await text('header .path'))?.endsWith('tool/CLI/yazi'), 'g. puts the cursor on the item');

// 3. linux stuff tab: ! on a var excludes linux/kernel/
await press('2'); await sleep(100);
await press('/'); await type('linux'); await press('Enter'); await press('l'); await sleep(100);
console.log('3 linux stuff / linux:', await rows());
check((await rows()).some((r) => r.includes('terminal')) && !(await rows()).some((r) => r.includes('kernel')), 'linux stuff hides linux/kernel/');

// C-c closes the active tab, also the last one, and keys keep working
await press('3'); await press('c', 'Control'); await sleep(150);
const afterClose = await all('header .tab');
console.log('3 after C-c:', afterClose);
check(afterClose.length === 2 && (await page.$eval('header .tab.active', (e) => e.textContent)).startsWith('2'), 'C-c closes the last tab and activates the previous one');
await press('1'); await press('2'); await press('c', 'Control'); await sleep(150);
check((await all('header .tab')).length === 1, 'C-c closes a tab in the middle');
await press('j'); await press('k');
check(!!(await text('header .path')), 'browser still responds after closing tabs');

// 4. K: the editor
await press('1');
await press('K'); await sleep(200);
console.log('4 viewset:', await listRows(), await exprRows());
check((await listRows()).join('|') === 'linux stuff 5|cli 2', 'editor lists views with counts');
check((await exprRows()).join('|') === '{linuxy} 6|& ! linux/kernel/ 1', 'expression rows show operator, ! and counts');
await shot('42-editor-viewset');

// varset: add a var, pick tags, ~ and !
await press(']'); await sleep(100);
await press('a'); await type('music_only'); await press('Enter'); await sleep(200);
console.log('4 vars:', await listRows());
check((await listRows()).join('|').includes('music_only 0'), 'a adds a var below the cursor');
await press('a'); await sleep(150); await type('music'); await press('Enter'); await sleep(200);
await press('a'); await sleep(150); await type('linux/kernel'); await press('Enter'); await sleep(200);
console.log('4 rows:', await exprRows());
check((await exprRows()).join('|') === 'music/ 1|+ linux/kernel/ 1', 'picked tags become rows below the cursor');
// adding an operand that's already there is a no-op
await press('a'); await sleep(150); await type('music'); await press('Enter'); await sleep(200);
check((await exprRows()).length === 2 && (await text('footer'))?.includes('already in music_only'), 'adding a repeated tag is a no-op');
check((await text('.editor .col:last-child .row.cursor'))?.startsWith('music/'), 'the cursor goes to the existing row');
await press('j');
await press('~'); await press('!'); await sleep(200);
console.log('4 ~ !:', await exprRows());
check((await exprRows())[1] === '& ! linux/kernel/ 1', '~ cycles the operator and ! negates');
await shot('43-editor-varset');
await press('u'); await sleep(200);
check((await exprRows())[1] === '& linux/kernel/ 1', 'u undoes the !');
await press('r', 'Control'); await sleep(200);
check((await exprRows())[1] === '& ! linux/kernel/ 1', 'C-r redoes it');
// a long tag path: the picker title ends in …, the query wraps below it
const LONG = 'Intro to C and Unix|Linux Programming and Web Interfaces | CSCI E-26';
await page.evaluate(async (name) => {
  const b = window.browser ?? window.chrome;
  const cloud = [...window.__api.nodes.values()].find((n) => n.title === 'cloud' && !n.url);
  const f = await b.bookmarks.create({ parentId: cloud.id, title: 'fall 2017 courses' });
  const g = await b.bookmarks.create({ parentId: f.id, title: name });
  await b.bookmarks.create({ parentId: g.id, title: 'CSCI E-26 syllabus', url: 'https://example.edu/cscie26' });
}, LONG);
await sleep(400);
await press('a'); await sleep(150); await type('CSCI');
const pick = await page.$eval('.picker .row.sel', (r) => {
  const label = r.querySelector('.label'), sub = r.querySelector('.sub');
  return { h: r.offsetHeight, cut: label.scrollWidth > label.clientWidth, gap: sub.getBoundingClientRect().left - label.getBoundingClientRect().right };
});
console.log('4 picker selected row:', pick);
check(pick.h > 30 && !pick.cut, 'the selected picker row wraps instead of ending in …');
check(pick.gap < 20, 'no blank space between the label and its count');
await shot('48-picker-long');
await press('Enter'); await sleep(200);
check((await exprRows())[2]?.includes('CSCI E-26'), 'the long tag is added');
const cols = () => page.$$eval('.editor .col', (cs) => cs.map((c) => Math.round(c.getBoundingClientRect().left)));
const rowGeo = (sel) => page.$eval(sel, (r) => ({ h: r.offsetHeight, name: r.querySelector('.name').scrollWidth > r.querySelector('.name').clientWidth }));
const longCursor = await rowGeo('.editor .col:last-child .row.cursor');
console.log('4 long row (cursor):', longCursor, await cols());
check((await cols())[0] === 0, 'a long expression row does not push the list column away');
check(longCursor.h > 30 && !longCursor.name, 'the long row wraps on the cursor');
await shot('47a-long-row-cursor');
await press('k');
const longOther = await rowGeo('.editor .col:last-child .row:nth-child(3)');
check(longOther.h <= 22 && longOther.name, 'off the cursor it ends in …');
await shot('47-long-row');
await press('j');
await press('r'); await sleep(200);
const geo = await page.evaluate(() => {
  const title = document.querySelector('.picker .box-title');
  const q = document.querySelector('.picker textarea');
  const row = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row'));
  return { row, titleH: title.offsetHeight, truncated: title.scrollWidth > title.clientWidth, titleBottom: title.getBoundingClientRect().bottom, qTop: q.getBoundingClientRect().top, qH: q.clientHeight, qText: q.value };
});
console.log('4 replace picker:', geo);
check(geo.truncated && geo.titleH <= geo.row, 'a long picker title stays on one line, ending in …');
check(geo.qH > geo.row * 1.5 && geo.titleBottom <= geo.qTop + 1, 'the long query wraps below the title, not under it');
await shot('46-replace-long');
await press('Escape');

// a parent of linux/kernel/ asks to replace it
await press('a'); await sleep(150); await type('linux/'); await press('Enter'); await sleep(200);
console.log('4 confirm:', await text('.confirm'));
check((await text('.confirm'))?.includes('Replace linux/kernel/ with linux/'), 'adding a parent tag offers to replace the child');
await press('y'); await sleep(200);
console.log('4 after replace:', await exprRows());
check((await exprRows())[1]?.includes('linux/ ') && !(await exprRows()).join().includes('kernel'), 'y replaces the child');

// rename a var: views referencing it follow
await press('h');
await press('G'); await sleep(100);
await press('r'); await press('u', 'Control'); await type('lin'); await press('Enter'); await sleep(200);
console.log('4 vars after rename:', await listRows());
await press('['); await sleep(150);
console.log('4 linux stuff expr:', await exprRows());
check((await exprRows())[0].startsWith('{lin}'), 'renaming a var rewrites its references');

// x/p reorders views
await press('x'); await press('j'); await press('p'); await sleep(200);
console.log('4 views after x/p:', await listRows());
check((await listRows()).join('|').startsWith('cli'), 'x then p moves a view below the cursor');
await press('u'); await sleep(200);
check((await listRows()).join('|').startsWith('linux stuff'), 'u undoes the move');
await press('q'); await sleep(200);
check(!!(await page.$('.app')), 'q leaves the editor');

// 5. renaming a tag rewrites references; bookmark undo reverts them
await press('g'); await press('h'); await sleep(100);
await press('/'); await type('linux'); await press('Enter');
await press('l'); await press('/'); await type('terminal'); await press('Enter');
await press('r'); await press('u', 'Control'); await type('term'); await press('Enter'); await sleep(500);
console.log('5 after rename:', await rows());
await press('K'); await press(']'); await sleep(200);
console.log('5 term_cli:', await exprRows());
check((await exprRows())[0]?.startsWith('linux/term/'), 'a tag rename rewrites var references');
await press('q'); await press('u'); await sleep(500);
await press('K'); await press(']'); await sleep(200);
check((await exprRows())[0]?.startsWith('linux/terminal/'), 'bookmark undo reverts the rewrite');
await press('q');

// 6. deleting a referenced tag warns
await press('g'); await press('h'); await press('/'); await type('tool'); await press('Enter');
await press('d'); await sleep(200);
const conf = await text('.confirm');
console.log('6 confirm:', conf);
check(conf?.includes('used by') && conf.includes('cli'), 'deleting a referenced tag names its users');
await shot('44-delete-referenced');
await press('n');

// 7. help in the editor lists editor keys only
await press('K'); await press('?'); await sleep(200);
const help = await text('.help');
check(help.includes('Cycle operator') && !help.includes('Sort alphabetically'), 'editor help shows editor keys');
await press('Escape'); await press('q');

// 8. options: export, edit and import the text form
await page.goto(BASE + '/options.html'); await sleep(1000);
const textOf = () => page.$eval('textarea[rows="16"]', (t) => t.value);
const exported = await textOf();
console.log('8 exported:\n' + exported);
check(exported.includes('linux stuff :=') && exported.includes('  & !linux/kernel/'), 'options exports views as text');
await page.$eval('textarea[rows="16"]', (t, v) => {
  t.value = v;
  t.dispatchEvent(new Event('input', { bubbles: true }));
}, exported.replace('[views]', '[views]\nmusic := music/ | {nope}'));
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'apply')?.click());
await sleep(300);
const notes = await all('.conflict, .error-line');
console.log('8 notes:', notes);
check(notes.some((n) => n.includes('unknown var {nope}')), 'import warns about unknown vars');
check((await textOf()).includes('music :=\n    music/\n  + {nope}'), 'import applies and reformats');
await page.$eval('textarea[rows="16"]', (t) => {
  t.value = '[vars]\nbad name := a/';
  t.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'apply')?.click());
await sleep(300);
check((await all('.error-line')).some((n) => n.startsWith('line 2')), 'import reports problems by line and does not apply');
await shot('45-options-views');

if (errors.length) console.log('page errors:', errors);
done(errors);
await browser.close();
