import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTIONS, ACTION_GROUPS } from '../src/core/keymap';
import { chrome } from '../src/platform/chrome';
import { firefox } from '../src/platform/firefox';
import { buildManifest } from '../src/platform/manifest';
import { bookmarksContract } from './contract.mjs';
import { MockBookmarks } from './mock';

const root = resolve(import.meta.dirname, '..');
const json = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));
const manifest = (target: string) =>
  buildManifest(json('src/platform/manifest.base.json'), json(`src/platform/${target}/manifest.json`), '1.2.3') as Record<
    string,
    any
  >;

describe('platforms', () => {
  it.each([firefox, chrome])('$name hides only real actions', (p) => {
    for (const a of p.hiddenActions) expect(ACTIONS).toHaveProperty(a);
  });

  it('only chrome hides goMenu, and every visible action is still in a help group', () => {
    expect(firefox.hiddenActions).toEqual([]);
    expect(chrome.hiddenActions).toEqual(['goMenu']);
    const grouped = ACTION_GROUPS.flatMap(([, as]) => as);
    for (const a of Object.keys(ACTIONS)) expect(grouped).toContain(a);
  });
});

describe('manifests', () => {
  it('firefox is the pre-Chrome manifest plus the self-hosted update_url', () => {
    expect(manifest('firefox')).toEqual({
      manifest_version: 3,
      name: 'romeli',
      version: '1.2.3',
      description: 'Keyboard-driven hierarchical-tag bookmark manager with a yazi-like interface.',
      browser_specific_settings: {
        gecko: {
          id: 'romeli@gnodar',
          strict_min_version: '140.0',
          update_url: 'https://raw.githubusercontent.com/gnodar01/romeli/main/updates.json',
          data_collection_permissions: { required: ['none'] },
        },
      },
      permissions: ['bookmarks', 'storage', 'tabs', 'clipboardWrite'],
      background: { scripts: ['background.js'], type: 'module' },
      action: { default_title: 'romeli', default_icon: 'icons/romeli.svg' },
      icons: { '48': 'icons/romeli.svg', '96': 'icons/romeli.svg' },
      options_ui: { page: 'ui/options/index.html', open_in_tab: true },
      commands: {
        'open-browser': {
          suggested_key: { default: 'Alt+Shift+M', mac: 'MacCtrl+Shift+M' },
          description: 'Open the romeli bookmark browser',
        },
        'create-bookmark': {
          suggested_key: { default: 'Alt+Shift+B', mac: 'MacCtrl+Shift+B' },
          description: 'Bookmark the current page with romeli',
        },
      },
    });
  });

  it('chrome uses a service worker, PNG icons, activeTab + favicon, and no Firefox keys', () => {
    const m = manifest('chrome');
    expect(m.background).toEqual({ service_worker: 'background.js', type: 'module' });
    expect(m.permissions).toEqual(['bookmarks', 'storage', 'activeTab', 'favicon', 'clipboardWrite']);
    expect(m.browser_specific_settings).toBeUndefined();
    expect(m.minimum_chrome_version).toBe('134');
    expect(m.commands).toEqual(manifest('firefox').commands);
    expect(m.action.default_title).toBe('romeli');
    for (const icon of [...Object.values(m.icons), ...Object.values(m.action.default_icon)] as string[]) {
      expect(icon).toMatch(/\.png$/);
      expect(existsSync(resolve(root, 'src/platform/chrome', icon))).toBe(true);
    }
  });
});

describe('chrome mock matches real Chrome', () => {
  // The fixture is recorded from real Chrome by `node harness/real-chrome.mjs <out> --record`, and
  // every real-chrome run re-checks it against the live API.
  it('behaves like the recorded fixture', async () => {
    expect(await bookmarksContract(new MockBookmarks('chrome'))).toEqual(json('tests/fixtures/chrome-bookmarks.json'));
  });
});
