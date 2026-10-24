import type { SortKey } from '../../adapter/browser';
import { fuzzyFilter } from '../../core/fuzzy';
import type { Copy, Item, Model, TagNode } from '../../core/model';
import { formatPath, parsePath, pathKey } from '../../core/tags';
import type { TagPath } from '../../core/types';

export type Entry =
  | { kind: 'tag'; key: string; name: string; tag: TagNode; positions?: number[] }
  | { kind: 'item'; key: string; name: string; copy: Copy; item: Item; rel?: string; positions?: number[] };

/** A reference that survives model rebuilds (ids change when bookmarks are recreated). */
export type Ref = { kind: 'tag'; path: TagPath } | { kind: 'item'; url: string; path: TagPath };

const SEP = '\u0001';
export const tagKey = (path: TagPath) => `t${SEP}${pathKey(path)}`;
export const itemKey = (url: string, path: TagPath) => `c${SEP}${pathKey(path)}${SEP}${url}`;

export function parseKey(key: string): Ref {
  const [kind, path, url] = key.split(SEP);
  return kind === 't' ? { kind: 'tag', path: parsePath(path) } : { kind: 'item', url, path: parsePath(path) };
}

export interface ViewOptions {
  sort: SortKey;
  reverse: boolean;
  tagsFirst: boolean;
  recursive: boolean;
  filter: string;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function entriesOf(model: Model, tag: TagNode, o: ViewOptions): Entry[] {
  const tags: Entry[] = tag.tags.map((t) => ({ kind: 'tag', key: tagKey(t.path), name: t.name, tag: t }));
  let items: Entry[];
  if (o.recursive) {
    // Every item in the subtree once, at its shallowest location.
    const seen = new Map<string, Entry>();
    for (const t of model.subtree(tag)) {
      for (const c of t.copies) {
        if (seen.has(c.url)) continue;
        const rel = t === tag ? undefined : formatPath(t.path.slice(tag.path.length));
        seen.set(c.url, { kind: 'item', key: itemKey(c.url, t.path), name: c.title || c.url, copy: c, item: model.item(c.url)!, rel });
      }
    }
    items = [...seen.values()];
  } else {
    items = tag.copies.map((c) => ({
      kind: 'item',
      key: itemKey(c.url, tag.path),
      name: c.title || c.url,
      copy: c,
      item: model.item(c.url)!,
    }));
  }

  const value = (e: Entry): number =>
    e.kind === 'tag'
      ? { alpha: 0, created: e.tag.dateAdded, modified: e.tag.dateModified, native: e.tag.index }[o.sort]
      : { alpha: 0, created: e.copy.dateAdded, modified: e.copy.dateAdded, native: e.copy.index }[o.sort];
  const cmp = (a: Entry, b: Entry) => {
    const r = o.sort === 'alpha' ? collator.compare(a.name, b.name) : value(a) - value(b);
    return o.reverse ? -r : r;
  };

  let out: Entry[];
  if (o.tagsFirst) out = [...tags.sort(cmp), ...items.sort(cmp)];
  else out = [...tags, ...items].sort(cmp);

  if (o.filter) {
    out = fuzzyFilter(o.filter, out, (e) => e.name).map(({ value, match }) => ({ ...value, positions: match.positions }));
  }
  return out;
}

export function refOf(e: Entry): Ref {
  return e.kind === 'tag' ? { kind: 'tag', path: e.tag.path } : { kind: 'item', url: e.copy.url, path: e.copy.tag.path };
}

export function keyOf(r: Ref): string {
  return r.kind === 'tag' ? tagKey(r.path) : itemKey(r.url, r.path);
}

/** Smart-case substring match used by find (/). */
export function findMatch(query: string, text: string): boolean {
  if (!query) return false;
  return query === query.toLowerCase() ? text.toLowerCase().includes(query) : text.includes(query);
}

/** Character positions of every (smart-case) occurrence of `query` in `text`. */
export function findPositions(query: string, text: string): number[] {
  if (!query) return [];
  const t = query === query.toLowerCase() ? text.toLowerCase() : text;
  const out: number[] = [];
  for (let i = t.indexOf(query); i >= 0; i = t.indexOf(query, i + query.length)) {
    for (let k = 0; k < query.length; k++) out.push(i + k);
  }
  return out;
}

export function formatDate(ms: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export interface PickerRow<V> {
  key: string;
  label: string;
  positions?: number[];
  sub?: string;
  kind?: string;
  value: V;
}

export type ConfirmLine = string | { text: string; sub?: string; warn?: boolean };
