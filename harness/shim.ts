/**
 * Dev-only stand-in for the WebExtension API, so the UI can run as a plain page (vite dev server +
 * puppeteer) with a seeded in-memory bookmark tree. With TARGET=chrome it imitates Chrome: the tree
 * has Chrome's shape, the API is exposed as `chrome` (not `browser`), and there's no commands.update.
 */
import { MemoryKV, MockBookmarks } from '../tests/mock';

const isChrome = __TARGET__ === 'chrome';

type Listener = (...args: unknown[]) => void;
const event = () => {
  const ls = new Set<Listener>();
  return {
    addListener: (f: Listener) => ls.add(f),
    removeListener: (f: Listener) => ls.delete(f),
    fire: (...a: unknown[]) => ls.forEach((f) => f(...a)),
  };
};

const api = new MockBookmarks(isChrome ? 'chrome' : 'firefox');
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
const onChildrenReordered = event(), onImportEnded = event(), onMessage = event();
/** Lets drive scripts send a runtime message, as the background does. */
(globalThis as any).__message = (msg: unknown) => onMessage.fire(msg);
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
    remove: async (keys: string | string[]) => {
      await m.remove([keys].flat());
      storageChanged.fire(Object.fromEntries([keys].flat().map((k) => [k, {}])), area);
    },
  };
};

const calls: unknown[] = [];
(globalThis as any).__calls = calls;
(globalThis as any).__api = api;

/** Stand-in for Chrome's `_favicon` endpoint: a coloured square per host. */
const fakeFavicon = (path: string) => {
  const host = new URL(new URLSearchParams(path.split('?')[1]).get('pageUrl') ?? '').host;
  const hue = [...host].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="hsl(${hue},60%,60%)"/></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
};

const commands = [
  { name: 'open-browser', description: 'Open the romeli bookmark browser', shortcut: isChrome ? '⌃⇧M' : 'Alt+Shift+M' },
  { name: 'create-bookmark', description: 'Bookmark the current page with romeli', shortcut: isChrome ? '⌃⇧B' : 'Alt+Shift+B' },
];

const ext = {
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
  commands: isChrome
    ? { getAll: async () => commands }
    : { getAll: async () => commands, update: async () => {}, reset: async () => {} },
  runtime: { getURL: (p: string) => (p.startsWith('/_favicon/') ? fakeFavicon(p) : '/' + p), onMessage },
};
if (isChrome) Object.assign(ext.bookmarks, { onChildrenReordered, onImportEnded });
(globalThis as any)[isChrome ? 'chrome' : 'browser'] = ext;
window.close = () => calls.push(['window.close']);
