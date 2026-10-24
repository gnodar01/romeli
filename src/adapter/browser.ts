import { OrderStore } from '../core/order';
import { Store } from '../core/store';
import type { BookmarksApi, KVStore } from '../core/types';
import { mergeBindings, type Bindings } from '../core/keymap';
import { sanitizeTheme, themeCss, type Theme } from '../core/theme';

export const bookmarksApi: BookmarksApi = {
  getTree: () => browser.bookmarks.getTree() as never,
  create: (d) => browser.bookmarks.create(d) as never,
  move: (id, dest) => browser.bookmarks.move(id, dest) as never,
  update: (id, c) => browser.bookmarks.update(id, c) as never,
  remove: (id) => browser.bookmarks.remove(id),
  removeTree: (id) => browser.bookmarks.removeTree(id),
};

export const syncKV: KVStore = {
  get: (keys) => browser.storage.sync.get(keys) as Promise<Record<string, unknown>>,
  set: (items) => browser.storage.sync.set(items),
  remove: (keys) => browser.storage.sync.remove(keys),
};

export function createStore(): Store {
  return new Store(bookmarksApi, new OrderStore(syncKV));
}

// ------------------------------------------------------------------ settings

export type SortKey = 'alpha' | 'created' | 'modified' | 'native';

export interface Settings {
  sort: SortKey;
  reverse: boolean;
  tagsFirst: boolean;
  /** Offer to normalize folder names containing ',' or '/' when the browser opens. */
  askNormalize: boolean;
  bindings: Partial<Record<string, string[]>>;
}

export const DEFAULT_SETTINGS: Settings = { sort: 'alpha', reverse: false, tagsFirst: true, askNormalize: true, bindings: {} };

export async function loadSettings(): Promise<Settings> {
  const { settings } = await browser.storage.sync.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await browser.storage.sync.set({ settings: next });
  return next;
}

export function bindingsOf(s: Settings): Bindings {
  return mergeBindings(s.bindings);
}

// ------------------------------------------------------------------ theme

/** Stored in its own `storage.sync` key (not in `settings`) to keep each item well under the quota. */
const THEME_KEY = 'theme';
/** Synchronous copy of the generated CSS, so pages paint with the custom theme from the first frame. */
const THEME_CACHE = 'romeli-theme-css';

export const isCssColor = (v: string): boolean => CSS.supports('color', v);

let ctx: CanvasRenderingContext2D | null = null;
/** Any CSS color as #rrggbb (alpha dropped), via the canvas's color normalization. */
export function cssColorToHex(c: string): string {
  ctx ??= document.createElement('canvas').getContext('2d')!;
  ctx.fillStyle = '#000000';
  ctx.fillStyle = c;
  const v = ctx.fillStyle;
  if (v.startsWith('#')) return v;
  const m = v.match(/[\d.]+/g);
  return m ? '#' + m.slice(0, 3).map((n) => Math.round(+n).toString(16).padStart(2, '0')).join('') : '#000000';
}

export async function loadTheme(): Promise<Theme> {
  const { [THEME_KEY]: raw } = await browser.storage.sync.get(THEME_KEY);
  return sanitizeTheme(raw, isCssColor).theme;
}

export async function saveTheme(theme: Theme): Promise<Theme> {
  const clean = sanitizeTheme(theme, isCssColor).theme;
  if (Object.keys(clean).length) await browser.storage.sync.set({ [THEME_KEY]: clean });
  else await browser.storage.sync.remove(THEME_KEY);
  applyTheme(clean);
  return clean;
}

function styleEl(): HTMLStyleElement {
  let el = document.getElementById('romeli-theme') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'romeli-theme';
    document.head.append(el);
  }
  return el;
}

export function applyTheme(theme: Theme) {
  const css = themeCss(theme, cssColorToHex);
  styleEl().textContent = css;
  try {
    localStorage.setItem(THEME_CACHE, css);
  } catch {
    // storage may be unavailable; the theme still applies once storage.sync answers
  }
}

/** Apply the cached theme now, then the stored one, and follow later changes (from any window). */
export function initTheme() {
  let cached: string | null = null;
  try {
    cached = localStorage.getItem(THEME_CACHE);
  } catch {
    // ignore
  }
  styleEl().textContent = cached ?? themeCss({}, cssColorToHex);
  void loadTheme().then(applyTheme);
  browser.storage.onChanged.addListener((changes: Record<string, unknown>, area: string) => {
    if (area === 'sync' && THEME_KEY in changes) void loadTheme().then(applyTheme);
  });
}

// ------------------------------------------------------------------ favicons

export type Favicons = Record<string, string>;

export const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
};

export async function loadFavicons(): Promise<Favicons> {
  const { favicons } = await browser.storage.local.get('favicons');
  return (favicons as Favicons | undefined) ?? {};
}

export async function saveFavicon(url: string, icon: string | undefined) {
  const host = hostOf(url);
  if (!host || !icon || icon.startsWith('chrome:')) return;
  const all = await loadFavicons();
  if (all[host] === icon) return;
  all[host] = icon;
  await browser.storage.local.set({ favicons: all });
}

// ------------------------------------------------------------------ change notifications

/** Calls `fn` (debounced) whenever bookmarks or romeli's synced data change. */
export function onExternalChange(fn: () => void, delay = 80): () => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  const fire = () => {
    clearTimeout(t);
    t = setTimeout(fn, delay);
  };
  const events = [
    browser.bookmarks.onCreated,
    browser.bookmarks.onRemoved,
    browser.bookmarks.onChanged,
    browser.bookmarks.onMoved,
  ] as { addListener(f: () => void): void; removeListener(f: () => void): void }[];
  events.forEach((e) => e.addListener(fire));
  const onStorage = (_: unknown, area: string) => area === 'sync' && fire();
  browser.storage.onChanged.addListener(onStorage);
  return () => {
    events.forEach((e) => e.removeListener(fire));
    browser.storage.onChanged.removeListener(onStorage);
  };
}

// ------------------------------------------------------------------ tabs

/** The active tab of the most recently focused normal (non-popup) window. */
export async function activeNormalTab(): Promise<browser.tabs.Tab | undefined> {
  let win = await browser.windows.getLastFocused({ windowTypes: ['normal'], populate: true }).catch(() => undefined);
  // Never target romeli's own popup windows, even if the windowTypes filter is ignored.
  if (!win || win.type !== 'normal') {
    const all = await browser.windows.getAll({ windowTypes: ['normal'], populate: true });
    win = all.find((w) => w.type === 'normal' && w.focused) ?? all.find((w) => w.type === 'normal');
  }
  return win?.tabs?.find((t) => t.active);
}

export async function openUrl(url: string, where: 'current' | 'new' | 'background') {
  const tab = await activeNormalTab();
  if (where === 'current' && tab?.id !== undefined) {
    await browser.tabs.update(tab.id, { url });
    if (tab.windowId !== undefined) await browser.windows.update(tab.windowId, { focused: true });
  } else {
    await browser.tabs.create({ url, windowId: tab?.windowId, active: where === 'new' });
  }
}
