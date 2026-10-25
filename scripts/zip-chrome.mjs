// Zips dist/chrome for upload to the Chrome Web Store: artifacts/romeli-chrome-<version>.zip
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const { version } = JSON.parse(readFileSync('dist/chrome/manifest.json', 'utf8'));
const zip = resolve('artifacts', `romeli-chrome-${version}.zip`);
mkdirSync('artifacts', { recursive: true });
rmSync(zip, { force: true });
execFileSync('zip', ['-qr', zip, '.', '-x', '.*'], { cwd: 'dist/chrome', stdio: 'inherit' });
console.log(zip);
