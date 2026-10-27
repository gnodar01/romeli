// Publishes the signed .xpi from `npm run sign` as a GitHub Release and adds it to updates.json, the file
// Firefox polls through the manifest's update_url. Push updates.json afterwards to roll the update out.
// `npm run release` runs this as one step (with a draft release); run it alone to redo just this step.
// Usage: npm run release:firefox [-- --notes "what changed"]   (extra args go to `gh release create`;
// the notes default to the version's CHANGELOG.md section)
// The Chrome zip (artifacts/romeli-chrome-<version>.zip) is attached too when it exists.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as changelog from './changelog.mjs';

export const REPO = 'gnodar01/romeli';
const UPDATES = 'updates.json';
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts });
const die = (msg) => {
  console.error(msg);
  process.exit(1);
};

// web-ext sign names the file <hash>-<version>.xpi.
export const signedXpis = (version) =>
  existsSync('artifacts') ? readdirSync('artifacts').filter((f) => f.endsWith(`-${version}.xpi`) && !f.startsWith('romeli-')) : [];

export function releaseFirefox(extra = []) {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
  const tag = `v${version}`;

  const signed = signedXpis(version);
  if (signed.length !== 1) die(`expected one signed artifacts/*-${version}.xpi, found ${signed.length}; run npm run sign`);
  const xpi = `artifacts/romeli-${version}.xpi`;
  copyFileSync(`artifacts/${signed[0]}`, xpi);

  // The update entry must match what's inside the signed file, not the current dist/.
  const manifest = JSON.parse(run('unzip', ['-p', xpi, 'manifest.json']));
  const gecko = manifest.browser_specific_settings.gecko;
  if (manifest.version !== version) die(`${xpi} is version ${manifest.version}, package.json says ${version}`);
  if (!gecko.update_url?.endsWith(`/${UPDATES}`)) die(`${xpi} has no update_url; friends would never get the next update`);

  const head = run('git', ['rev-parse', 'HEAD']).trim();
  if (!run('git', ['branch', '-r', '--contains', head]).trim()) die(`push ${head.slice(0, 7)} first; the release tag points at it`);

  const assets = [xpi];
  const chromeZip = `artifacts/romeli-chrome-${version}.zip`;
  if (existsSync(chromeZip)) assets.push(chromeZip);

  let exists = true;
  try {
    run('gh', ['release', 'view', tag, '--repo', REPO], { stdio: 'ignore' });
  } catch {
    exists = false;
  }
  if (exists) run('gh', ['release', 'upload', tag, ...assets, '--clobber', '--repo', REPO], { stdio: 'inherit' });
  else {
    const notes = extra.some((a) => /^--(notes|notes-file|generate-notes)\b/.test(a))
      ? []
      : ['--notes', changelog.section(changelog.read(), version) ?? `romeli ${version}`];
    run('gh', ['release', 'create', tag, ...assets, '--repo', REPO, '--target', head, '--title', `romeli ${version}`, ...notes, ...extra], {
      stdio: 'inherit',
    });
  }

  const entry = {
    version,
    update_link: `https://github.com/${REPO}/releases/download/${tag}/romeli-${version}.xpi`,
    update_hash: `sha256:${createHash('sha256').update(readFileSync(xpi)).digest('hex')}`,
    browser_specific_settings: { gecko: { strict_min_version: gecko.strict_min_version } },
  };
  const updates = existsSync(UPDATES) ? JSON.parse(readFileSync(UPDATES, 'utf8')) : { addons: {} };
  const list = (updates.addons[gecko.id] ??= { updates: [] }).updates;
  const i = list.findIndex((u) => u.version === version);
  if (i >= 0) list[i] = entry;
  else list.push(entry);
  writeFileSync(UPDATES, JSON.stringify(updates, null, 2) + '\n');
  return { version, tag };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { version } = releaseFirefox(process.argv.slice(2));
  console.log(`\n${UPDATES} now offers ${version}. Firefox sees it once it's on main:`);
  console.log(`  git add ${UPDATES} && git commit -m "[release] ${version}" && git push`);
}
