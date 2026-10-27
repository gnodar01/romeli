// Checks that each build only contains its own browser's code (the other platform must be
// tree-shaken away) and that every file its manifest references exists.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = {
  // Chrome-only code paths
  firefox: ['_favicon', 'onImportEnded', 'chrome://extensions'],
  // Firefox-only code paths (favicon capture, Firefox root ids). The options page's shortcut editor
  // is shared UI hidden at runtime by platform.shortcuts, so commands.update may appear.
  chrome: ['tabs.onUpdated', 'root________', 'unfiled_____'],
};

const files = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
let failed = 0;
const fail = (msg) => {
  failed++;
  console.log('FAIL:', msg);
};

for (const [target, needles] of Object.entries(FORBIDDEN)) {
  const dir = `dist/${target}`;
  if (!existsSync(dir)) {
    fail(`${dir} missing; run npm run build`);
    continue;
  }
  for (const f of files(dir).filter((f) => /\.(js|html)$/.test(f))) {
    const src = readFileSync(f, 'utf8');
    for (const n of needles) if (src.includes(n)) fail(`${f} contains "${n}"`);
  }
  const m = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'));
  const refs = [
    ...Object.values(m.icons ?? {}),
    ...(typeof m.action?.default_icon === 'string' ? [m.action.default_icon] : Object.values(m.action?.default_icon ?? {})),
    m.background?.service_worker,
    ...(m.background?.scripts ?? []),
    m.options_ui?.page,
  ].filter(Boolean);
  for (const r of refs) if (!existsSync(join(dir, r))) fail(`${dir}/manifest.json references missing ${r}`);
  // Firefox friends update through updates.json (scripts/release-firefox.mjs); a build without it strands them.
  const updateUrl = m.browser_specific_settings?.gecko?.update_url;
  if (target === 'firefox' && !updateUrl?.startsWith('https://')) fail(`${dir}/manifest.json has no https update_url`);
  if (target === 'chrome' && (updateUrl || m.update_url)) fail(`${dir}/manifest.json has an update_url`);
  console.log(`${target}: checked ${refs.length} manifest references`);
}
process.exitCode = failed ? 1 : 0;
