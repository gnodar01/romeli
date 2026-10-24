// Bumps the version in package.json, package-lock.json and public/manifest.json together.
// Usage: npm run bump [-- patch|minor|major|<x.y.z>]   (default: patch)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

execFileSync('npm', ['version', process.argv[2] ?? 'patch', '--no-git-tag-version'], { stdio: 'inherit' });
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

const path = 'public/manifest.json';
const manifest = JSON.parse(readFileSync(path, 'utf8'));
manifest.version = version;
writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
