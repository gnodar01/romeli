import { Model, findChild, orderCopies, type Copy, type Overrides, type TagNode } from './model';
import { OrderStore } from './order';
import {
  addTag,
  formatPath,
  isAncestorOrSelf,
  normalizeTags,
  parsePath,
  pathKey,
  rebase,
  removeTag,
  replaceTag,
} from './tags';
import type { BookmarksApi, RootResolver, TagPath } from './types';

/** Everything needed to recreate an item. `tags: []` means the item did not exist. */
export interface ItemSnapshot {
  url: string;
  title: string;
  tags: TagPath[];
  indexes: Record<string, number>;
}

export interface UndoEntry {
  label: string;
  undo(): Promise<void>;
  redo(): Promise<void>;
}

export interface OpResult {
  entry?: UndoEntry;
  warnings: string[];
}

export interface CopyRef {
  url: string;
  path: TagPath;
}

export class OpError extends Error {}

/**
 * The single place that mutates bookmarks. Every public op re-reads the native tree first
 * (native tree wins), applies the change, and returns an undo entry expressed in terms of
 * URLs and tag paths, which stay meaningful after ids change.
 */
export class Store {
  model: Model = new Model();
  overrides: Overrides = new Map();
  private orders: OrderStore;
  /** Nesting depth of `batched` calls, and whether overrides changed inside them. */
  private batchDepth = 0;
  private ordersDirty = false;

  constructor(
    private api: BookmarksApi,
    orders: OrderStore,
    private resolveRoots: RootResolver,
  ) {
    this.orders = orders;
  }

  async load(): Promise<Model> {
    this.overrides = await this.orders.load();
    return this.reload();
  }

  async reload(): Promise<Model> {
    this.model = new Model(this.resolveRoots(await this.api.getTree()), this.overrides);
    return this.model;
  }

  // ---------------------------------------------------------------- primitives

  /** mkdir -p: resolve a tag path, creating missing folders. */
  async ensureTag(path: TagPath, created?: TagPath[]): Promise<TagNode> {
    let cur = this.model.root;
    for (let i = 0; i < path.length; i++) {
      let next = findChild(cur, path[i]);
      if (!next) {
        const node = await this.api.create({ parentId: cur.id, title: path[i] });
        created?.push(path.slice(0, i + 1));
        await this.reload();
        next = this.model.tagsById.get(node.id);
        if (!next) throw new OpError(`could not create tag ${formatPath(path.slice(0, i + 1))}`);
      }
      cur = next;
    }
    return cur;
  }

  snapshot(url: string): ItemSnapshot {
    const item = this.model.item(url);
    if (!item) return { url, title: '', tags: [], indexes: {} };
    const indexes: Record<string, number> = {};
    for (const c of item.copies) indexes[c.tag.key] = c.index;
    return { url, title: item.title, tags: item.tags, indexes };
  }

  /**
   * Make the set of copies of `url` match `tags` exactly (in order). Copies that move between
   * tags are moved natively rather than recreated, so dateAdded (and the default order) survive.
   * An empty list deletes the item.
   */
  async setItemTags(url: string, title: string, tags: TagPath[], indexes: Record<string, number> = {}) {
    return this.batched(() => this.reconcile(url, title, tags, indexes));
  }

  private async reconcile(url: string, title: string, tags: TagPath[], indexes: Record<string, number>) {
    await this.reload();
    const want = normalizeTags(tags);
    const existing = this.model.item(url)?.copies ?? [];
    const wantKeys = want.map(pathKey);

    const keep = new Map<string, Copy>();
    for (const c of existing) if (wantKeys.includes(c.tag.key) && !keep.has(c.tag.key)) keep.set(c.tag.key, c);
    const spare = existing.filter((c) => keep.get(c.tag.key) !== c);
    const missing = want.filter((p) => !keep.has(pathKey(p)));

    for (const path of missing) {
      const tag = await this.ensureTag(path);
      const index = indexes[pathKey(path)];
      const reuse = spare.shift();
      if (reuse) {
        await this.withIndex(index, (i) => this.api.move(reuse.id, { parentId: tag.id, index: i }));
        if (reuse.title !== title) await this.api.update(reuse.id, { title });
      } else {
        await this.withIndex(index, (i) => this.api.create({ parentId: tag.id, title, url, index: i }));
      }
    }
    for (const c of spare) await this.api.remove(c.id);
    for (const c of keep.values()) if (c.title !== title) await this.api.update(c.id, { title });

    // Persist the order only when it differs from the natural (dateAdded) one.
    await this.reload();
    const copies = this.model.item(url)?.copies ?? [];
    const natural = [...new Set(orderCopies(copies).map((c) => c.tag.key))];
    const had = this.overrides.has(url);
    if (!wantKeys.length || natural.join('\n') === wantKeys.join('\n')) this.overrides.delete(url);
    else this.overrides.set(url, wantKeys);
    if (had || this.overrides.has(url)) await this.saveOrders();
  }

  private async withIndex<T>(index: number | undefined, fn: (i?: number) => Promise<T>): Promise<T> {
    if (index === undefined) return fn();
    try {
      return await fn(index);
    } catch {
      return fn();
    }
  }

  /** Persist the overrides, or, inside `batched`, mark them for one write when the batch ends. */
  private async saveOrders() {
    this.ordersDirty = true;
    if (!this.batchDepth) await this.flushOrders();
    await this.reload();
  }

  private async flushOrders() {
    if (!this.ordersDirty) return;
    this.ordersDirty = false;
    await this.orders.save(this.overrides);
  }

  /**
   * Run `fn` with order saves deferred to its end, so an op costs at most one storage.sync write
   * however many items it touches (Chrome rejects writes beyond 120 per minute). Also flushes when
   * `fn` throws, so storage keeps matching the overrides of whatever was already changed.
   */
  private async batched<T>(fn: () => Promise<T>): Promise<T> {
    this.batchDepth++;
    try {
      return await fn();
    } finally {
      if (--this.batchDepth === 0) await this.flushOrders();
    }
  }

  async restore(snaps: ItemSnapshot[]) {
    await this.batched(async () => {
      for (const s of snaps) await this.setItemTags(s.url, s.title, s.tags, s.indexes);
    });
  }

  /** Run an item-level mutation and build an undo entry from before/after snapshots. */
  private async itemOp(label: string, urls: string[], body: () => Promise<string[]>): Promise<OpResult> {
    await this.reload();
    const all = [...new Set(urls)];
    const before = all.map((u) => this.snapshot(u));
    const warnings = await this.batched(body);
    await this.reload();
    const after = all.map((u) => this.snapshot(u));
    const entry: UndoEntry = {
      label,
      undo: () => this.restore(before),
      redo: () => this.restore(after),
    };
    return { entry, warnings };
  }

  private requireItem(url: string) {
    const item = this.model.item(url);
    if (!item) throw new OpError(`no bookmark for ${url}`);
    return item;
  }

  // ---------------------------------------------------------------- item ops

  /** `d` on items: remove these copies; an item losing its last copy is deleted. */
  removeCopies(refs: CopyRef[]): Promise<OpResult> {
    const urls = [...new Set(refs.map((r) => r.url))];
    return this.itemOp(`delete ${plural(refs.length, 'copy', 'copies')}`, urls, async () => {
      for (const url of urls) {
        const item = this.requireItem(url);
        let tags = item.tags;
        for (const r of refs) if (r.url === url) tags = removeTag(tags, r.path);
        await this.setItemTags(url, item.title, tags);
      }
      return [];
    });
  }

  /** `D`: delete every copy of these items. */
  deleteItems(urls: string[]): Promise<OpResult> {
    return this.itemOp(`delete ${plural(urls.length, 'item')}`, urls, async () => {
      for (const url of urls) await this.setItemTags(url, '', []);
      return [];
    });
  }

  /** `y` + `p`: add `dest` as an additional tag. */
  addTag(urls: string[], dest: TagPath): Promise<OpResult> {
    return this.itemOp(`tag ${plural(urls.length, 'item')} ${formatPath(dest)}`, urls, async () => {
      const warnings: string[] = [];
      for (const url of urls) {
        const item = this.requireItem(url);
        const res = addTag(item.tags, dest);
        if (res.redundant) {
          warnings.push(`${item.title}: already tagged ${formatPath(res.redundant)}`);
          continue;
        }
        await this.setItemTags(url, item.title, res.tags);
      }
      return warnings;
    });
  }

  /** `x` + `p`: replace the tag each copy was cut from with `dest`, keeping its position. */
  moveCopies(refs: CopyRef[], dest: TagPath): Promise<OpResult> {
    const urls = [...new Set(refs.map((r) => r.url))];
    return this.itemOp(`move ${plural(refs.length, 'item')} to ${formatPath(dest)}`, urls, async () => {
      const warnings: string[] = [];
      for (const url of urls) {
        const item = this.requireItem(url);
        let tags = item.tags;
        for (const r of refs) {
          if (r.url !== url) continue;
          const res = replaceTag(tags, r.path, dest);
          if (res.redundant) warnings.push(`${item.title}: already tagged ${formatPath(res.redundant)}`);
          tags = res.redundant ? removeTag(tags, r.path) : res.tags;
        }
        await this.setItemTags(url, item.title, tags.length ? tags : [dest]);
      }
      return warnings;
    });
  }

  renameItem(url: string, title: string): Promise<OpResult> {
    return this.itemOp(`rename ${title}`, [url], async () => {
      const item = this.requireItem(url);
      await this.setItemTags(url, title, item.tags);
      return [];
    });
  }

  /**
   * Create or edit an item from the tag-list form. `oldUrl` is the url being edited (if any);
   * changing it rewrites every copy's url.
   */
  saveItem(oldUrl: string | null, url: string, title: string, tags: TagPath[]): Promise<OpResult> {
    const urls = oldUrl && oldUrl !== url ? [oldUrl, url] : [url];
    const label = oldUrl ? `edit ${title}` : `create ${title}`;
    return this.itemOp(label, urls, async () => {
      const want = normalizeTags(tags.length ? tags : [[]]);
      if (oldUrl && oldUrl !== url) {
        const item = this.model.item(oldUrl);
        for (const c of item?.copies ?? []) await this.api.update(c.id, { url });
        const order = this.overrides.get(oldUrl);
        if (order) {
          this.overrides.delete(oldUrl);
          this.overrides.set(url, order);
        }
      }
      await this.setItemTags(url, title, want);
      return [];
    });
  }

  // ---------------------------------------------------------------- tag ops

  private requireTag(path: TagPath, mutable = true): TagNode {
    const tag = this.model.tag(path);
    if (!tag) throw new OpError(`no tag ${formatPath(path)}`);
    if (mutable && tag.fixed) throw new OpError(`${formatPath(path)} is a built-in root folder and cannot be changed`);
    return tag;
  }

  private async removeEmptyTags(paths: TagPath[]) {
    await this.reload();
    for (const p of [...paths].sort((a, b) => b.length - a.length)) {
      const t = this.model.tag(p);
      if (t && !t.fixed && !t.tags.length && !t.copies.length) {
        await this.api.remove(t.id);
        await this.reload();
      }
    }
  }

  private async rewriteOrders(from: TagPath, to: TagPath) {
    let changed = false;
    for (const [url, keys] of this.overrides) {
      const next = keys.map((k) => pathKey(rebase(parsePath(k), from, to)));
      if (next.join('\n') !== keys.join('\n')) {
        this.overrides.set(url, next);
        changed = true;
      }
    }
    if (changed) await this.saveOrders();
  }

  async createTag(path: TagPath): Promise<OpResult> {
    await this.reload();
    const created: TagPath[] = [];
    await this.ensureTag(path, created);
    if (!created.length) return { warnings: [`${formatPath(path)} already exists`] };
    return {
      warnings: [],
      entry: {
        label: `create ${formatPath(path)}`,
        undo: () => this.removeEmptyTags(created),
        redo: async () => {
          await this.reload();
          await this.ensureTag(path);
        },
      },
    };
  }

  async renameTag(path: TagPath, name: string): Promise<OpResult> {
    await this.reload();
    const tag = this.requireTag(path);
    if (!name || /[/,]/.test(name)) throw new OpError('tag names cannot be empty or contain "/" or ","');
    const parent = tag.parent!;
    if (parent.tags.some((t) => t !== tag && t.name === name)) throw new OpError(`${name}/ already exists here`);
    const oldName = tag.name;
    const to = [...parent.path, name];
    const apply = async (from: TagPath, dest: TagPath, title: string) => {
      await this.reload();
      await this.api.update(this.requireTag(from).id, { title });
      await this.rewriteOrders(from, dest);
    };
    await apply(path, to, name);
    return {
      warnings: [],
      entry: {
        label: `rename ${formatPath(path)} → ${name}/`,
        undo: () => apply(to, path, oldName),
        redo: () => apply(path, to, name),
      },
    };
  }

  /** `x` + `p` on a tag: move the folder (and everything in it) under `dest`. */
  async moveTag(path: TagPath, dest: TagPath): Promise<OpResult> {
    await this.reload();
    const tag = this.requireTag(path);
    if (isAncestorOrSelf(path, dest)) throw new OpError('cannot move a tag into itself');
    const to = [...dest, tag.name];
    if (this.model.tag(to)) throw new OpError(`${formatPath(to)} already exists`);
    const origin = { parent: tag.parent!.path, index: tag.index };
    const apply = async (from: TagPath, parent: TagPath, index?: number) => {
      await this.reload();
      const t = this.requireTag(from);
      const target = await this.ensureTag(parent);
      await this.withIndex(index, (i) => this.api.move(t.id, { parentId: target.id, index: i }));
      await this.rewriteOrders(from, [...parent, t.name]);
    };
    await apply(path, dest);
    return {
      warnings: [],
      entry: {
        label: `move ${formatPath(path)} → ${formatPath(dest)}`,
        undo: () => apply(to, origin.parent, origin.index),
        redo: () => apply(path, dest),
      },
    };
  }

  /** `y` + `p` on a tag: mirror the subtree under `dest`, tagging every item accordingly. */
  async copyTag(path: TagPath, dest: TagPath): Promise<OpResult> {
    await this.reload();
    const tag = this.requireTag(path, false);
    const base = [...dest, tag.name || 'untagged'];
    if (isAncestorOrSelf(path, dest)) throw new OpError('cannot copy a tag into itself');
    const sub = this.model.subtree(tag);
    const urls = [...new Set(sub.flatMap((t) => t.copies.map((c) => c.url)))];
    const created: TagPath[] = [];
    const res = await this.itemOp(`copy ${formatPath(path)} → ${formatPath(dest)}`, urls, async () => {
      for (const t of sub) await this.ensureTag(rebase(t.path, path, base), created);
      for (const t of sub) {
        for (const c of t.copies) {
          const item = this.requireItem(c.url);
          const added = addTag(item.tags, rebase(t.path, path, base));
          if (!added.redundant) await this.setItemTags(c.url, item.title, added.tags);
        }
      }
      return [];
    });
    const entry = res.entry!;
    return {
      warnings: res.warnings,
      entry: {
        label: entry.label,
        undo: async () => {
          await entry.undo();
          await this.removeEmptyTags(created);
        },
        redo: async () => {
          for (const p of created) await this.ensureTag(p);
          await entry.redo();
        },
      },
    };
  }

  /**
   * `d` on a tag: drop the tag (and its subtags) from every item, then remove the folder.
   * Items left without any tag become untagged (moved to the root).
   */
  async deleteTag(path: TagPath): Promise<OpResult> {
    await this.reload();
    const tag = this.requireTag(path);
    const folders = this.model.subtree(tag).map((t) => ({ path: t.path, index: t.index }));
    const urls = [...new Set(this.model.subtree(tag).flatMap((t) => t.copies.map((c) => c.url)))];
    const run = () =>
      this.batched(async () => {
        await this.reload();
        for (const url of urls) {
          const item = this.model.item(url);
          if (!item) continue;
          const rest = item.tags.filter((t) => !isAncestorOrSelf(path, t));
          await this.setItemTags(url, item.title, rest.length ? rest : [[]]);
        }
        const t = this.model.tag(path);
        if (t) await this.api.removeTree(t.id);
        await this.reload();
      });
    const before = urls.map((u) => this.snapshot(u));
    await run();
    return {
      warnings: [],
      entry: {
        label: `delete ${formatPath(path)}`,
        undo: async () => {
          await this.reload();
          for (const f of folders) {
            if (this.model.tag(f.path)) continue;
            const parent = await this.ensureTag(f.path.slice(0, -1));
            await this.withIndex(f.index, (i) =>
              this.api.create({ parentId: parent.id, title: f.path[f.path.length - 1], index: i }),
            );
            await this.reload();
          }
          await this.restore(before);
        },
        redo: run,
      },
    };
  }

  /** Folders whose names contain the tag-list separators ',' or '/'. */
  unnormalizedTags(): TagNode[] {
    return this.model.allTags().filter((t) => !t.fixed && hasSeparator(t.name));
  }

  /** Rename every such folder (',' → ';', '/' → '|'), keeping stored tag orders in sync. */
  async normalizeNames(): Promise<OpResult> {
    await this.reload();
    const bad = this.unnormalizedTags();
    if (!bad.length) return { warnings: [] };
    const renames = bad.map((t) => ({ id: t.id, from: t.name, to: normalizeName(t.name) }));
    const savedOrders = new Map(this.overrides);
    const keyMap = (fn: (r: (typeof renames)[number]) => [string, string]) => {
      const byId = new Map(renames.map((r) => [r.id, fn(r)]));
      const map = new Map<string, string>();
      for (const t of this.model.allTags()) {
        const path = [];
        for (let cur: TagNode | null = t; cur && cur.parent; cur = cur.parent) path.unshift(byId.get(cur.id)?.[1] ?? cur.name);
        map.set(t.key, pathKey(path));
      }
      return map;
    };
    const apply = async (forward: boolean) => {
      await this.reload();
      const map = keyMap((r) => (forward ? [r.from, r.to] : [r.to, r.from]));
      for (const r of renames) await this.api.update(r.id, { title: forward ? r.to : r.from });
      if (forward) {
        for (const [url, keys] of this.overrides) this.overrides.set(url, keys.map((k) => map.get(k) ?? k));
      } else {
        this.overrides = new Map(savedOrders);
      }
      await this.saveOrders();
    };
    await apply(true);
    return {
      warnings: [],
      entry: {
        label: `normalize ${plural(renames.length, 'tag name')}`,
        undo: () => apply(false),
        redo: () => apply(true),
      },
    };
  }

  /**
   * Extra copies of an item in a folder that already holds it (all but the oldest there). The
   * browser allows them, but a tag holds an item once, so romeli shows them as one entry.
   */
  duplicateCopies(): Copy[] {
    const out: Copy[] = [];
    for (const item of this.model.items.values()) {
      if (item.copies.length === item.tags.length) continue;
      const seen = new Set<string>();
      // `copies` is oldest-first within a tag, so the first one seen is kept.
      for (const c of item.copies) {
        if (seen.has(c.tag.key)) out.push(c);
        else seen.add(c.tag.key);
      }
    }
    return out;
  }

  /** Remove every duplicate copy, keeping the oldest in each folder (so dateAdded and tag order survive). */
  async mergeDuplicates(): Promise<OpResult> {
    await this.reload();
    const removed = this.duplicateCopies().map((c) => ({ url: c.url, title: c.title, path: c.tag.path, index: c.index }));
    if (!removed.length) return { warnings: [] };
    const urls = new Set(removed.map((d) => d.url));
    const apply = async () => {
      await this.reload();
      for (const c of this.duplicateCopies()) if (urls.has(c.url)) await this.api.remove(c.id);
      await this.reload();
    };
    await apply();
    return {
      warnings: [],
      entry: {
        label: `merge ${plural(removed.length, 'duplicate')}`,
        undo: async () => {
          await this.reload();
          // Recreate in ascending index order so each lands back at its old position.
          for (const d of [...removed].sort((a, b) => a.index - b.index)) {
            const tag = await this.ensureTag(d.path);
            await this.withIndex(d.index, (i) => this.api.create({ parentId: tag.id, title: d.title, url: d.url, index: i }));
          }
        },
        redo: apply,
      },
    };
  }

  /** Count what a tag deletion touches, for the confirmation prompt. */
  describeTagDeletion(path: TagPath): { tags: number; items: number; orphaned: number } {
    const tag = this.model.tag(path);
    if (!tag) return { tags: 0, items: 0, orphaned: 0 };
    const sub = this.model.subtree(tag);
    const urls = new Set(sub.flatMap((t) => t.copies.map((c) => c.url)));
    let orphaned = 0;
    for (const url of urls) {
      const item = this.model.item(url);
      if (item && item.tags.every((t) => isAncestorOrSelf(path, t))) orphaned++;
    }
    return { tags: sub.length, items: urls.size, orphaned };
  }
}

export const hasSeparator = (name: string) => /[,/]/.test(name);
export const normalizeName = (name: string) => name.replaceAll(',', ';').replaceAll('/', '|');

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`;
}
