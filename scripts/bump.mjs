// Bumps the version in package.json and package-lock.json; the build stamps it into each manifest.
// Usage: npm run bump [-- patch|minor|major|<x.y.z>]   (default: patch)
import { execFileSync } from 'node:child_process';

execFileSync('npm', ['version', process.argv[2] ?? 'patch', '--no-git-tag-version'], { stdio: 'inherit' });
