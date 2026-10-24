import { OrderStore } from '../src/core/order';
import { Store } from '../src/core/store';
import { ROOT_IDS, type BNode, type BookmarksApi, type KVStore } from '../src/core/types';

/** In-memory imitation of browser.bookmarks with Firefox's root folders. */
export class MockBookmarks implements BookmarksApi {
  nodes = new Map<string, BNode>();
  private seq = 0;
  private clock = 1000;

  constructor() {
    const root = this.add({ id: ROOT_IDS.root, title: '', children: [], type: 'folder' });
    for (const id of [ROOT_IDS.menu, ROOT_IDS.toolbar, ROOT_IDS.unfiled, ROOT_IDS.mobile]) {
      const n = this.add({ id, title: id, children: [], type: 'folder', parentId: root.id });
      root.children!.push(n);
    }
    this.reindex(root);
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
    return [structuredClone(this.get(ROOT_IDS.root))];
  }

  async create(d: { parentId: string; title: string; url?: string; index?: number }): Promise<BNode> {
    const parent = this.get(d.parentId);
    if (d.index !== undefined && (d.index < 0 || d.index > parent.children!.length)) throw new Error('bad index');
    const n = this.add({
      id: `n${++this.seq}`,
      parentId: d.parentId,
      title: d.title,
      ...(d.url !== undefined ? { url: d.url, type: 'bookmark' as const } : { children: [], type: 'folder' as const }),
    });
    parent.children!.splice(d.index ?? parent.children!.length, 0, n);
    this.reindex(parent);
    return structuredClone(n);
  }

  async move(id: string, dest: { parentId?: string; index?: number }): Promise<BNode> {
    const n = this.get(id);
    const from = this.get(n.parentId!);
    from.children!.splice(from.children!.indexOf(n), 1);
    this.reindex(from);
    const to = this.get(dest.parentId ?? n.parentId!);
    if (dest.index !== undefined && (dest.index < 0 || dest.index > to.children!.length)) {
      from.children!.splice(n.index!, 0, n);
      this.reindex(from);
      throw new Error('bad index');
    }
    to.children!.splice(dest.index ?? to.children!.length, 0, n);
    n.parentId = to.id;
    this.reindex(to);
    return structuredClone(n);
  }

  async update(id: string, c: { title?: string; url?: string }): Promise<BNode> {
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
  seed(spec: Spec, parentId: string = ROOT_IDS.unfiled) {
    for (const [title, v] of Object.entries(spec)) {
      if (typeof v === 'string') {
        void this.create({ parentId, title, url: v });
      } else {
        const parent = this.get(parentId);
        const n = this.add({ id: `n${++this.seq}`, parentId, title, children: [], type: 'folder' });
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
    walk(this.get(ROOT_IDS.unfiled), []);
    return out.sort();
  }

  /** A stable dump of the unfiled tree for before/after comparisons. */
  dump(id: string = ROOT_IDS.unfiled): unknown {
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

export async function setup(spec: Spec = {}) {
  const api = new MockBookmarks();
  api.seed(spec);
  const kv = new MemoryKV();
  const store = new Store(api, new OrderStore(kv));
  await store.load();
  return { api, kv, store };
}
