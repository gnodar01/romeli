import { BASE, checker, launch } from './lib.mjs';
const out = process.argv[2] ?? '.';
const browser = await launch();
const { done } = checker();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const type = async (s) => { await page.keyboard.type(s, { delay: 30 }); await sleep(150); };
const press = async (k) => { await page.keyboard.press(k); await sleep(150); };
const val = () => page.$eval('.tag-input input', (i) => i.value);
const comps = () => page.$$eval('.completions .row', (rs) => rs.map((r) => r.textContent.trim())).catch(() => []);

await page.setViewport({ width: 680, height: 420 });
await page.goto(BASE + '/create.html?url=' + encodeURIComponent('https://github.com/sharkdp/fd') + '&title=fd%20-%20a%20simple%20find');
await sleep(1000);
console.log('focused field is tags:', await page.evaluate(() => document.activeElement?.closest('.tag-input') !== null));
await type('lin');           console.log('lin →', (await comps()).slice(0, 3));
await press('Tab');          console.log('tab →', await val());
await type('term');          console.log('term →', (await comps()).slice(0, 2));
await press('Tab');          console.log('tab →', await val());
await type(', too');         console.log('too →', (await comps()).slice(0, 2));
await press('Tab');          console.log('tab →', await val());
await type('cl');            console.log('cl →', (await comps()).slice(0, 2));
await press('Tab');          console.log('tab →', await val());
await page.screenshot({ path: `${out}/10-create.png` });
await press('Enter');
console.log('Enter cycles to:', await page.evaluate(() => document.activeElement?.closest('label')?.textContent?.trim().slice(0, 4)));
await page.keyboard.down('Meta'); await press('Enter'); await page.keyboard.up('Meta');
await sleep(600);
console.log('locations:', await page.evaluate(() => window.__api.locations('https://github.com/sharkdp/fd')));
console.log('calls:', JSON.stringify(await page.evaluate(() => window.__calls)));

// existing URL → edit mode
await page.goto(BASE + '/create.html?url=' + encodeURIComponent('https://yazi-rs.github.io'));
await sleep(1000);
console.log('edit heading:', await page.$eval('.box-title', (e) => e.textContent), '| tags:', await val());

// jump ranking in browser
await page.setViewport({ width: 1180, height: 640 });
await page.goto(BASE + '/browser.html');
await sleep(1000);
await press('z'); await type('kern');
console.log('jump rows:', (await page.$$eval('.picker .row', (rs) => rs.map((r) => r.textContent.trim()))).slice(0, 3));
await press('Enter'); console.log('jumped to:', await page.$eval('header', (e) => e.textContent.trim()));
await page.screenshot({ path: `${out}/11-preview.png` });

await page.goto(BASE + '/options.html');
await sleep(1000);
await page.screenshot({ path: `${out}/12-options.png` });
console.log('option rows:', await page.$$eval('.table .row', (r) => r.length));
console.log('ERRORS:', errors);
done(errors);
await browser.close();
