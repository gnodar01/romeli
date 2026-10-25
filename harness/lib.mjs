// Shared setup for the drive scripts. TARGET=firefox (default) drives the Firefox harness in
// headless Firefox; TARGET=chrome drives the Chrome harness (npm run harness:chrome) in headless
// Chrome for Testing (npx @puppeteer/browsers install chrome@stable).
import puppeteer from 'puppeteer-core';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const TARGET = process.env.TARGET ?? 'firefox';
export const BASE = `http://localhost:${TARGET === 'chrome' ? 5198 : 5199}/harness`;

/** The newest Chrome for Testing in puppeteer's cache, or $CHROME. */
export function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const dir = join(homedir(), '.cache/puppeteer/chrome');
  const builds = existsSync(dir) ? readdirSync(dir).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })) : [];
  for (const b of builds.reverse()) {
    for (const exe of [
      `chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
      `chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
      `chrome-linux64/chrome`,
    ]) {
      if (existsSync(join(dir, b, exe))) return join(dir, b, exe);
    }
  }
  throw new Error('Chrome for Testing not found: run `npx @puppeteer/browsers install chrome@stable` or set CHROME');
}

export function launch(options = {}) {
  if (TARGET === 'chrome') return puppeteer.launch({ browser: 'chrome', executablePath: chromePath(), headless: true, ...options });
  return puppeteer.launch({
    browser: 'firefox',
    executablePath: process.env.FIREFOX ?? '/Applications/Firefox.app/Contents/MacOS/firefox',
    headless: true,
    ...options,
  });
}

/** Records failed expectations; call `done()` at the end to exit non-zero if any failed. */
export function checker() {
  const failures = [];
  return {
    check(ok, what) {
      if (!ok) {
        failures.push(what);
        console.log('FAIL:', what);
      }
    },
    done(errors = []) {
      if (errors.length) failures.push(`page errors: ${errors.join(' | ')}`);
      if (failures.length) {
        console.log(`${failures.length} check(s) failed`);
        process.exitCode = 1;
      }
    },
  };
}
