// The whole release, after `npm run bump` and a `## [<version>]` section in CHANGELOG.md:
//   checks → npm run verify → AMO sign (unlisted) → Chrome zip → draft GitHub Release + updates.json
//   → date the CHANGELOG heading and fix its links → commit "[release] <version>" → y/N → publish + push.
// Nothing is public until the y/N: the release stays a draft and the commit stays local. Pushing updates.json
// to main is what ships the update to friends.
// Re-running resumes: an already signed .xpi skips verify and sign (AMO never signs a version twice), and an
// unpushed "[release] <version>" commit goes straight to the y/N.
// Usage: npm run release
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import * as changelog from './changelog.mjs';
import { REPO, releaseFirefox, signedXpis } from './release-firefox.mjs';

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts }).trim();
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
const ok = (cmd, args) => {
  try {
    execFileSync(cmd, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
const die = (msg) => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};
const step = (msg) => console.log(`\n▸ ${msg}`);
async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\n${question} [y/N] `);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const tag = `v${version}`;
const subject = `[release] ${version}`;
const signedFrom = `artifacts/romeli-${version}.commit`;

async function finish() {
  console.log(`\nReady to ship ${version}:`);
  console.log(`  - publish the draft GitHub Release ${tag} (creates the tag; releases/latest starts offering it)`);
  console.log(`  - push "${subject}" to main (updates.json: installed copies update within about a day)`);
  if (!(await ask('Publish and push now?'))) {
    console.log('\nNothing published. To ship later, run npm run release again, or by hand:');
    console.log(`  gh release edit ${tag} --draft=false --repo ${REPO} && git push`);
    console.log(`To abandon: gh release delete ${tag} --repo ${REPO} && git reset --hard HEAD~1`);
    return;
  }
  sh('gh', ['release', 'edit', tag, '--draft=false', '--repo', REPO]);
  sh('git', ['push']);
  sh('git', ['fetch', '--tags']);
  console.log(`\n✓ ${version} is out: https://github.com/${REPO}/releases/tag/${tag}`);
  console.log('  Chrome Web Store (once listed): upload artifacts/romeli-chrome-' + version + '.zip in the dashboard.');
}

// ---- checks -------------------------------------------------------------------------------------------------
if (!ok('gh', ['auth', 'status'])) die('gh is not logged in (gh auth login)');
if (run('git', ['branch', '--show-current']) !== 'main') die('release from main');
if (run('git', ['status', '--porcelain'])) die('the working tree has uncommitted changes');
step('git fetch');
sh('git', ['fetch', 'origin']);
if (run('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`])) die(`${tag} is already released; npm run bump first`);

const head = run('git', ['rev-parse', 'HEAD']);
const upstream = run('git', ['rev-parse', 'origin/main']);
if (head !== upstream) {
  // A release commit made by an earlier run that stopped at the y/N.
  const resumable = run('git', ['log', '-1', '--format=%s']) === subject && run('git', ['rev-parse', 'HEAD~1']) === upstream;
  if (!resumable) die('HEAD must equal origin/main: push (or pull) first; the release tag points at the pushed HEAD');
  step(`found the unpushed "${subject}" commit from an earlier run`);
  await finish();
  process.exit(0);
}

const notes = changelog.section(changelog.read(), version);
if (!notes) die(`${changelog.CHANGELOG} has no "## [${version}]" section with entries; write it and commit first`);
if (existsSync('.env')) process.loadEnvFile('.env');
if (!process.env.WEB_EXT_API_KEY || !process.env.WEB_EXT_API_SECRET) die('WEB_EXT_API_KEY / WEB_EXT_API_SECRET missing (.env)');

// ---- verify + sign ------------------------------------------------------------------------------------------
const signed = signedXpis(version);
if (signed.length > 1) die(`several signed artifacts/*-${version}.xpi; keep one`);
if (signed.length === 1) {
  step(`artifacts/${signed[0]} is already signed; skipping verify and sign (AMO never signs ${version} again)`);
  const from = existsSync(signedFrom) ? readFileSync(signedFrom, 'utf8').trim() : null;
  if (from !== head) {
    console.log(from ? `  It was signed from ${from.slice(0, 7)}, but HEAD is ${head.slice(0, 7)}; the tag would point at code that differs from the .xpi.` : '  There is no record of which commit it was signed from.');
    if (!(await ask(`Release it with the tag on ${head.slice(0, 7)} anyway? (otherwise: npm run bump and start over)`))) process.exit(1);
  }
} else {
  step('npm run verify');
  sh('npm', ['run', 'verify']);
  step('sign on AMO (unlisted)');
  // verify just built dist/firefox from HEAD and linted it.
  writeFileSync(signedFrom, head + '\n');
  sh('node', ['node_modules/web-ext/bin/web-ext.js', 'sign', '--source-dir', 'dist/firefox', '--artifacts-dir', 'artifacts', '--channel', 'unlisted']);
  if (signedXpis(version).length !== 1) die('web-ext sign produced no .xpi. If it timed out, download it from Developer Hub → Manage Status & Versions into artifacts/ and re-run');
}

// ---- assets, draft release, release commit ------------------------------------------------------------------
step('Chrome zip');
sh('npm', ['run', 'package:chrome']);

step('draft GitHub Release + updates.json');
releaseFirefox(['--draft']);

step(`${changelog.CHANGELOG}: date the heading, fix the compare links`);
const today = new Date().toLocaleDateString('sv'); // YYYY-MM-DD, local time
writeFileSync(changelog.CHANGELOG, changelog.finalize(changelog.read(), version, today));

sh('git', ['add', 'updates.json', changelog.CHANGELOG]);
sh('git', ['commit', '-q', '-m', subject]);
console.log(run('git', ['show', '--stat', '--format=%h %s', 'HEAD']));

await finish();
