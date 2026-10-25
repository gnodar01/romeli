// Runs every drive script against the Firefox and the Chrome harness, starting (and stopping) the
// harness servers as needed. Screenshots go to <outdir>/<target>/.
// Usage: node harness/e2e.mjs [outdir] [firefox|chrome ...]   (default: a temp dir, both targets)
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'romeli-e2e-'));
const targets = process.argv.length > 3 ? process.argv.slice(3) : ['firefox', 'chrome'];
const SCRIPTS = ['drive', 'drive-create', 'drive-features', 'drive-theme'];
const port = (t) => (t === 'chrome' ? 5198 : 5199);

const up = async (t) => {
  try {
    return (await fetch(`http://localhost:${port(t)}/harness/browser.html`)).ok;
  } catch {
    return false;
  }
};

const run = (cmd, args, env) =>
  new Promise((done) => {
    const p = spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } });
    p.on('exit', (code) => done(code ?? 1));
  });

let failed = 0;
for (const t of targets) {
  let server;
  if (!(await up(t))) {
    server = spawn('npx', ['vite', '--config', 'harness/vite.config.ts'], { env: { ...process.env, TARGET: t }, stdio: 'ignore' });
    for (let i = 0; i < 60 && !(await up(t)); i++) await new Promise((r) => setTimeout(r, 250));
  }
  const dir = join(out, t);
  mkdirSync(dir, { recursive: true });
  for (const s of SCRIPTS) {
    console.log(`\n=== ${t}: ${s}`);
    const code = await run('node', [`harness/${s}.mjs`, dir], { TARGET: t });
    if (code) {
      failed++;
      console.log(`=== ${t}: ${s} FAILED (exit ${code})`);
    }
  }
  server?.kill();
}
console.log(`\nscreenshots: ${out}`);
if (failed) {
  console.log(`${failed} drive script(s) failed`);
  process.exitCode = 1;
}
