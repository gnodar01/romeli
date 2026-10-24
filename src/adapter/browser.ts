import { OrderStore } from '../core/order';
import { Store } from '../core/store';
import type { BookmarksApi, KVStore } from '../core/types';
import { mergeBindings, type Bindings } from '../core/keymap';

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
  bindings: Partial<Record<string, string[]>>;
}

export const DEFAULT_SETTINGS: Settings = { sort: 'alpha', reverse: false, tagsFirst: true, bindings: {} };

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
