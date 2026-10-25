import { OrderStore } from '../core/order';
import { Store } from '../core/store';
import type { BookmarksApi, KVStore } from '../core/types';
import { mergeBindings, type Bindings } from '../core/keymap';
import { sanitizeTheme, themeCss, type Theme } from '../core/theme';
import { ext } from '../platform/ext';
import { platform } from '../platform';

export const bookmarksApi: BookmarksApi = {
  getTree: () => ext.bookmarks.getTree() as never,
  create: (d) => ext.bookmarks.create(d) as never,
  move: (id, dest) => ext.bookmarks.move(id, dest) as never,
  update: (id, c) => ext.bookmarks.update(id, c) as never,
  remove: (id) => ext.bookmarks.remove(id),
  removeTree: (id) => ext.bookmarks.removeTree(id),
};

export const syncKV: KVStore = {
  get: (keys) => ext.storage.sync.get(keys) as Promise<Record<string, unknown>>,
  set: (items) => ext.storage.sync.set(items),
  remove: (keys) => ext.storage.sync.remove(keys),
};

export function createStore(): Store {
  return new Store(bookmarksApi, new OrderStore(syncKV), platform.resolveRoots);
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
  const { settings } = await ext.storage.sync.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await ext.storage.sync.set({ settings: next });
  return next;
}

/** The effective bindings; actions this browser lacks (platform.hiddenActions) are left unbound. */
export function bindingsOf(s: Settings): Bindings {
  const b = mergeBindings(s.bindings);
  for (const a of platform.hiddenActions) b[a] = [];
  return b;
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
  const { [THEME_KEY]: raw } = await ext.storage.sync.get(THEME_KEY);
  return sanitizeTheme(raw, isCssColor).theme;
}

export async function saveTheme(theme: Theme): Promise<Theme> {
  const clean = sanitizeTheme(theme, isCssColor).theme;
  if (Object.keys(clean).length) await ext.storage.sync.set({ [THEME_KEY]: clean });
  else await ext.storage.sync.remove(THEME_KEY);
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
  ext.storage.onChanged.addListener((changes: Record<string, unknown>, area: string) => {
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

/** The icon to show for a bookmark: from the browser when it can provide one, else the captured one. */
export function faviconFor(favicons: Favicons, url: string): string | undefined {
  return platform.favicon?.(url) ?? favicons[hostOf(url)];
}

export async function loadFavicons(): Promise<Favicons> {
  const { favicons } = await ext.storage.local.get('favicons');
  return (favicons as Favicons | undefined) ?? {};
}

export async function saveFavicon(url: string, icon: string | undefined) {
  const host = hostOf(url);
  if (!host || !icon || icon.startsWith('chrome:')) return;
  const all = await loadFavicons();
  if (all[host] === icon) return;
  all[host] = icon;
  await ext.storage.local.set({ favicons: all });
}

// ------------------------------------------------------------------ change notifications

/** Calls `fn` (debounced) whenever bookmarks or romeli's synced data change. */
export function onExternalChange(fn: () => void, delay = 80): () => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  const fire = () => {
    clearTimeout(t);
    t = setTimeout(fn, delay);
  };
  const events = platform.bookmarkEvents();
  events.forEach((e) => e.addListener(fire));
  const onStorage = (_: unknown, area: string) => area === 'sync' && fire();
  ext.storage.onChanged.addListener(onStorage);
  return () => {
    events.forEach((e) => e.removeListener(fire));
    ext.storage.onChanged.removeListener(onStorage);
  };
}

// ------------------------------------------------------------------ tabs

/** The active tab of the most recently focused normal (non-popup) window. */
export async function activeNormalTab(): Promise<browser.tabs.Tab | undefined> {
  let win = await ext.windows.getLastFocused({ windowTypes: ['normal'], populate: true }).catch(() => undefined);
  // Never target romeli's own popup windows, even if the windowTypes filter is ignored.
  if (!win || win.type !== 'normal') {
    const all = await ext.windows.getAll({ windowTypes: ['normal'], populate: true });
    win = all.find((w) => w.type === 'normal' && w.focused) ?? all.find((w) => w.type === 'normal');
  }
  return win?.tabs?.find((t) => t.active);
}

export async function openUrl(url: string, where: 'current' | 'new' | 'background') {
  const tab = await activeNormalTab();
  if (where === 'current' && tab?.id !== undefined) {
    await ext.tabs.update(tab.id, { url });
    if (tab.windowId !== undefined) await ext.windows.update(tab.windowId, { focused: true });
  } else {
    await ext.tabs.create({ url, windowId: tab?.windowId, active: where === 'new' });
  }
}
