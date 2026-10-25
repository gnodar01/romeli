import { OrderStore } from '../src/core/order';
import { Store } from '../src/core/store';
import type { BNode, BookmarksApi, KVStore, RootResolver } from '../src/core/types';
import { chromeRoots } from '../src/platform/chrome/roots';
import { FIREFOX_ROOT_IDS, firefoxRoots } from '../src/platform/firefox/roots';

/**
 * Native tree shapes the mock imitates:
 * - firefox: `root________` holding menu, toolbar, unfiled and mobile; nodes carry `type`.
 * - chrome: `0` holding the bookmarks bar (`1`) and other bookmarks (`2`); no `type`, but `folderType`
 *   and `syncing`. An empty mobile folder is absent, as in real Chrome.
 * - chrome-account: signed in without full sync, so local permanent folders plus account ones
 *   (`syncing: true`, unpredictable ids). Romeli must use the account set.
 */
export type Flavor = 'firefox' | 'chrome' | 'chrome-account';
export const FLAVORS: Flavor[] = ['firefox', 'chrome', 'chrome-account'];

export const resolverFor = (flavor: Flavor): RootResolver => (flavor === 'firefox' ? firefoxRoots : chromeRoots);

interface Permanent {
  id: string;
  title: string;
  folderType?: BNode['folderType'];
  syncing?: boolean;
}

const LAYOUTS: Record<Flavor, { root: string; other: string; permanent: Permanent[] }> = {
  firefox: {
    root: FIREFOX_ROOT_IDS.root,
    other: FIREFOX_ROOT_IDS.unfiled,
    permanent: [FIREFOX_ROOT_IDS.menu, FIREFOX_ROOT_IDS.toolbar, FIREFOX_ROOT_IDS.unfiled, FIREFOX_ROOT_IDS.mobile].map(
      (id) => ({ id, title: id }),
    ),
  },
  chrome: {
    root: '0',
    other: '2',
    permanent: [
      { id: '1', title: 'Bookmarks Bar', folderType: 'bookmarks-bar', syncing: false },
      { id: '2', title: 'Other Bookmarks', folderType: 'other', syncing: false },
    ],
  },
  'chrome-account': {
    root: '0',
    other: '41',
    permanent: [
      { id: '1', title: 'Bookmarks Bar', folderType: 'bookmarks-bar', syncing: false },
      { id: '2', title: 'Other Bookmarks', folderType: 'other', syncing: false },
      { id: '40', title: 'Bookmarks Bar', folderType: 'bookmarks-bar', syncing: true },
      { id: '41', title: 'Other Bookmarks', folderType: 'other', syncing: true },
    ],
  },
};

/** In-memory imitation of the bookmarks API, matching the given browser's tree shape and quirks. */
export class MockBookmarks implements BookmarksApi {
  nodes = new Map<string, BNode>();
  /** The folder holding top-level tags ("Other Bookmarks"); default parent for seed/locations/dump. */
  readonly otherId: string;
  readonly rootId: string;
  private permanent = new Set<string>();
  private chrome: boolean;
  private seq: number;
  private clock = 1000;

  constructor(readonly flavor: Flavor = 'firefox') {
    const layout = LAYOUTS[flavor];
    this.chrome = flavor !== 'firefox';
    this.seq = this.chrome ? 100 : 0;
    this.rootId = layout.root;
    this.otherId = layout.other;
    const root = this.add({ id: layout.root, title: '', children: [], ...this.folderType() });
    this.permanent.add(root.id);
    for (const p of layout.permanent) {
      const n = this.add({ ...p, children: [], parentId: root.id, ...this.folderType() });
      root.children!.push(n);
      this.permanent.add(n.id);
    }
    this.reindex(root);
  }

  /** Firefox tags every node with `type`; Chrome nodes have none (folders simply lack `url`). */
  private folderType(): Partial<BNode> {
    return this.chrome ? {} : { type: 'folder' };
  }

  private newId(): string {
    return this.chrome ? String(++this.seq) : `n${++this.seq}`;
  }

  /** Both browsers refuse to change their root folders. */
  private assertMutable(id: string) {
    if (this.permanent.has(id)) throw new Error("Can't modify the root bookmark folders.");
  }

  private add(n: BNode): BNode {
    n.dateAdded ??= this.clock++;
    this.nodes.set(n.id, n);
    return n;
  }

  private reindex(folder: BNode) {
    folder.children!.forEach((c, i) => (c.index = i));
  }

  private get(id: string): BNode {
    const n = this.nodes.get(id);
    if (!n) throw new Error(`no node ${id}`);
    return n;
  }

  async getTree(): Promise<BNode[]> {
    return [structuredClone(this.get(this.rootId))];
  }

  async create(d: { parentId: string; title: string; url?: string; index?: number }): Promise<BNode> {
    const parent = this.get(d.parentId);
    if (d.parentId === this.rootId) this.assertMutable(d.parentId);
    if (d.index !== undefined && (d.index < 0 || d.index > parent.children!.length)) throw new Error('bad index');
    const n = this.add({
      id: this.newId(),
      parentId: d.parentId,
      title: d.title,
      ...(d.url !== undefined
        ? { url: d.url, ...(this.chrome ? {} : { type: 'bookmark' as const }) }
        : { children: [], ...this.folderType() }),
    });
    parent.children!.splice(d.index ?? parent.children!.length, 0, n);
    this.reindex(parent);
    return structuredClone(n);
  }

  async move(id: string, dest: { parentId?: string; index?: number }): Promise<BNode> {
    this.assertMutable(id);
    const n = this.get(id);
    const from = this.get(n.parentId!);
    const to = this.get(dest.parentId ?? n.parentId!);
    if (to.id === this.rootId) this.assertMutable(to.id);
    let index = dest.index;
    if (index !== undefined) {
      // Chrome counts a same-folder index before removing the node (moving a to 2 in abcd gives bacd);
      // Firefox counts it after.
      const max = this.chrome || from !== to ? to.children!.length : to.children!.length - 1;
      if (index < 0 || index > max) throw new Error('bad index');
      if (this.chrome && from === to && index > n.index!) index--;
    }
    from.children!.splice(from.children!.indexOf(n), 1);
    this.reindex(from);
    to.children!.splice(index ?? to.children!.length, 0, n);
    n.parentId = to.id;
    this.reindex(to);
    return structuredClone(n);
  }

  async update(id: string, c: { title?: string; url?: string }): Promise<BNode> {
    this.assertMutable(id);
    const n = this.get(id);
    if (c.title !== undefined) n.title = c.title;
    if (c.url !== undefined) n.url = c.url;
    return structuredClone(n);
  }

  async remove(id: string) {
    const n = this.get(id);
    if (n.children?.length) throw new Error('folder not empty');
    await this.removeTree(id);
  }

  async removeTree(id: string) {
    this.assertMutable(id);
    const n = this.get(id);
    const parent = this.get(n.parentId!);
    parent.children!.splice(parent.children!.indexOf(n), 1);
    this.reindex(parent);
    const drop = (x: BNode) => {
      this.nodes.delete(x.id);
      x.children?.forEach(drop);
    };
    drop(n);
  }

  // -- test helpers

  /** Seed from a nested object: { linux: { terminal: { 'Alacritty': 'https://...' } } } */
  seed(spec: Spec, parentId: string = this.otherId) {
    for (const [title, v] of Object.entries(spec)) {
      if (typeof v === 'string') {
        void this.create({ parentId, title, url: v });
      } else {
        const parent = this.get(parentId);
        const n = this.add({ id: this.newId(), parentId, title, children: [], ...this.folderType() });
        parent.children!.push(n);
        this.reindex(parent);
        this.seed(v, n.id);
      }
    }
  }

  /** Paths ('linux/terminal') of every folder holding a bookmark for url. */
  locations(url: string): string[] {
    const out: string[] = [];
    const walk = (n: BNode, path: string[]) => {
      for (const c of n.children ?? []) {
        if (c.url === url) out.push(path.join('/'));
        if (c.children) walk(c, [...path, c.title]);
      }
    };
    walk(this.get(this.otherId), []);
    return out.sort();
  }

  /** A stable dump of the unfiled tree for before/after comparisons. */
  dump(id: string = this.otherId): unknown {
    const n = this.get(id);
    return (n.children ?? []).map((c) => (c.children ? { [c.title]: this.dump(c.id) } : `${c.title} ${c.url}`));
  }
}

export interface Spec {
  [title: string]: string | Spec;
}

export class MemoryKV implements KVStore {
  data = new Map<string, unknown>();
  async get(keys: string[] | null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of this.data) if (!keys || keys.includes(k)) out[k] = structuredClone(v);
    return out;
  }
  async set(items: Record<string, unknown>) {
    for (const [k, v] of Object.entries(items)) this.data.set(k, structuredClone(v));
  }
  async remove(keys: string[]) {
    keys.forEach((k) => this.data.delete(k));
  }
}

export async function setup(spec: Spec = {}, flavor: Flavor = 'firefox') {
  const api = new MockBookmarks(flavor);
  api.seed(spec);
  const kv = new MemoryKV();
  const store = new Store(api, new OrderStore(kv), resolverFor(flavor));
  await store.load();
  return { api, kv, store };
}
