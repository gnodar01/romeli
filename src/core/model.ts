import { pathKey } from './tags';
import { EMPTY_LAYOUT, type BNode, type RootLayout, type TagPath } from './types';

export interface TagNode {
  id: string;
  name: string;
  path: TagPath;
  key: string;
  parent: TagNode | null;
  /** Native index inside the parent folder. */
  index: number;
  dateAdded: number;
  dateModified: number;
  tags: TagNode[];
  copies: Copy[];
  /** Special browser roots (toolbar/, menu/, mobile/) and the virtual root cannot be renamed/moved/deleted. */
  fixed: boolean;
}

/** One native bookmark: a single (item, tag) membership. */
export interface Copy {
  id: string;
  url: string;
  title: string;
  index: number;
  dateAdded: number;
  tag: TagNode;
}

/** All copies sharing a URL. `copies[0]` is the primary location; `tags` has each tag once. */
export interface Item {
  url: string;
  title: string;
  copies: Copy[];
  tags: TagPath[];
}

/** url → ordered list of tag path keys */
export type Overrides = Map<string, string[]>;

/**
 * Order copies of one item: explicitly ordered tags first (from an override), the rest by
 * dateAdded ascending (oldest = primary). Stale override entries are ignored.
 */
export function orderCopies(copies: Copy[], override?: string[]): Copy[] {
  const byDate = [...copies].sort((a, b) => a.dateAdded - b.dateAdded || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!override?.length) return byDate;
  const rank = new Map(override.map((k, i) => [k, i]));
  const ranked = byDate.filter((c) => rank.has(c.tag.key));
  ranked.sort((a, b) => rank.get(a.tag.key)! - rank.get(b.tag.key)!);
  return [...ranked, ...byDate.filter((c) => !rank.has(c.tag.key))];
}

export class Model {
  root: TagNode;
  tagsById = new Map<string, TagNode>();
  tagsByKey = new Map<string, TagNode>();
  copiesById = new Map<string, Copy>();
  items = new Map<string, Item>();

  /** Top-level names taken by special tags. */
  private reserved: Set<string>;

  constructor(layout: RootLayout = EMPTY_LAYOUT, overrides: Overrides = new Map()) {
    this.reserved = new Set(layout.reserved);
    this.root = this.makeTag(layout.other, '', [], null, true);
    this.fill(this.root, layout.other, true);
    for (const { name, node } of layout.specials) {
      const tag = this.makeTag(node, name, [name], this.root, true);
      tag.index = -1; // special roots sort before regular tags in native order
      this.root.tags.push(tag);
      this.fill(tag, node, false);
    }

    const grouped = new Map<string, Copy[]>();
    for (const c of this.copiesById.values()) {
      const list = grouped.get(c.url);
      if (list) list.push(c);
      else grouped.set(c.url, [c]);
    }
    for (const [url, list] of grouped) {
      const copies = orderCopies(list, overrides.get(url));
      // Two copies in one folder are one tag: `tags` lists each path once.
      const tags = [...new Map(copies.map((c) => [c.tag.key, c.tag.path])).values()];
      this.items.set(url, { url, title: copies[0].title, copies, tags });
    }
  }

  private makeTag(node: BNode, name: string, path: TagPath, parent: TagNode | null, fixed: boolean): TagNode {
    const tag: TagNode = {
      id: node.id,
      name,
      path,
      key: pathKey(path),
      parent,
      index: node.index ?? 0,
      dateAdded: node.dateAdded ?? 0,
      dateModified: node.dateGroupModified ?? node.dateAdded ?? 0,
      tags: [],
      copies: [],
      fixed,
    };
    this.tagsById.set(tag.id, tag);
    // First folder wins if two siblings share a name; later ones are still browsable by id.
    if (!this.tagsByKey.has(tag.key)) this.tagsByKey.set(tag.key, tag);
    return tag;
  }

  private fill(tag: TagNode, node: BNode, isRoot: boolean) {
    for (const child of node.children ?? []) {
      if (child.type === 'separator') continue;
      if (child.url !== undefined && child.type !== 'folder') {
        const copy: Copy = {
          id: child.id,
          url: child.url,
          title: child.title,
          index: child.index ?? 0,
          dateAdded: child.dateAdded ?? 0,
          tag,
        };
        tag.copies.push(copy);
        this.copiesById.set(copy.id, copy);
      } else {
        // A top-level folder shadowed by a special tag name is still reachable, just renamed in display.
        const name = isRoot && this.reserved.has(child.title) ? `${child.title}~` : child.title;
        const sub = this.makeTag(child, name, [...tag.path, name], tag, false);
        tag.tags.push(sub);
        this.fill(sub, child, false);
      }
    }
  }

  tag(path: TagPath): TagNode | undefined {
    return this.tagsByKey.get(pathKey(path));
  }

  /** Resolve a path case-insensitively when there is no exact match. */
  resolve(path: TagPath): TagNode | undefined {
    let cur: TagNode | undefined = this.root;
    for (const seg of path) {
      if (!cur) return undefined;
      cur = findChild(cur, seg);
    }
    return cur;
  }

  /** All tags in the subtree (including `tag`), depth first. */
  subtree(tag: TagNode): TagNode[] {
    const out: TagNode[] = [];
    const walk = (t: TagNode) => {
      out.push(t);
      t.tags.forEach(walk);
    };
    walk(tag);
    return out;
  }

  allTags(): TagNode[] {
    return this.subtree(this.root).slice(1);
  }

  item(url: string): Item | undefined {
    return this.items.get(url);
  }
}

export function findChild(tag: TagNode, name: string): TagNode | undefined {
  return tag.tags.find((t) => t.name === name) ?? tag.tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
}
