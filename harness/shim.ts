/**
 * Dev-only stand-in for the WebExtension `browser` global, so the UI can run as a plain page
 * (vite dev server + puppeteer) with a seeded in-memory bookmark tree.
 */
import { MemoryKV, MockBookmarks } from '../tests/mock';

type Listener = (...args: unknown[]) => void;
const event = () => {
  const ls = new Set<Listener>();
  return {
    addListener: (f: Listener) => ls.add(f),
    removeListener: (f: Listener) => ls.delete(f),
    fire: (...a: unknown[]) => ls.forEach((f) => f(...a)),
  };
};

const api = new MockBookmarks();
api.seed({
  linux: {
    terminal: { Alacritty: 'https://alacritty.org', 'kitty terminal': 'https://sw.kovidgoyal.net/kitty/' },
    kernel: { 'The Linux Kernel Archives': 'https://kernel.org' },
    'Arch Wiki': 'https://wiki.archlinux.org',
  },
  linus: { 'Linus on GitHub': 'https://github.com/torvalds' },
  tool: {
    CLI: { ripgrep: 'https://github.com/BurntSushi/ripgrep', yazi: 'https://yazi-rs.github.io' },
    cloud: {},
  },
  music: { Bandcamp: 'https://bandcamp.com' },
  'news, blogs': { 'LWN / Linux Weekly News': 'https://lwn.net' },
  'a / b testing': {},
  'Hacker News': 'https://news.ycombinator.com',
});
// a second tag for yazi
await api.create({ parentId: [...api.nodes.values()].find((n) => n.title === 'terminal')!.id, title: 'yazi', url: 'https://yazi-rs.github.io' });

const onCreated = event(), onRemoved = event(), onChanged = event(), onMoved = event(), storageChanged = event();
const wrap = <A extends unknown[], R>(f: (...a: A) => Promise<R>, ev: { fire: Listener }) =>
  async (...a: A) => {
    const r = await f(...a);
    setTimeout(() => ev.fire(), 0);
    return r;
  };

const kv = (area: string) => {
  const m = new MemoryKV();
  return {
    get: (k: string | string[] | null) => m.get(typeof k === 'string' ? [k] : k),
    set: async (items: Record<string, unknown>) => {
      await m.set(items);
      storageChanged.fire(items, area);
    },
    remove: async (keys: string[]) => {
      await m.remove(keys);
      storageChanged.fire({}, area);
    },
  };
};

const calls: unknown[] = [];
(globalThis as any).__calls = calls;
(globalThis as any).__api = api;

(globalThis as any).browser = {
  bookmarks: {
    getTree: () => api.getTree(),
    create: wrap(api.create.bind(api), onCreated),
    move: wrap(api.move.bind(api), onMoved),
    update: wrap(api.update.bind(api), onChanged),
    remove: wrap(api.remove.bind(api), onRemoved),
    removeTree: wrap(api.removeTree.bind(api), onRemoved),
    onCreated,
    onRemoved,
    onChanged,
    onMoved,
  },
  storage: { sync: kv('sync'), local: kv('local'), session: kv('session'), onChanged: storageChanged },
  windows: {
    getLastFocused: async () => ({ id: 1, type: 'normal', tabs: [{ id: 10, windowId: 1, active: true, url: 'about:blank' }] }),
    getAll: async () => [],
    update: async () => ({}),
  },
  tabs: {
    update: async (id: number, p: unknown) => calls.push(['tabs.update', id, p]),
    create: async (p: unknown) => calls.push(['tabs.create', p]),
  },
  commands: {
    getAll: async () => [
      { name: 'open-browser', description: 'Open the romeli bookmark browser', shortcut: 'Alt+Shift+M' },
      { name: 'create-bookmark', description: 'Bookmark the current page with romeli', shortcut: 'Alt+Shift+B' },
    ],
    update: async () => {},
    reset: async () => {},
  },
  runtime: { getURL: (p: string) => '/' + p },
};
window.close = () => calls.push(['window.close']);
