import type { UndoEntry } from '../store';
import type { KVStore } from '../types';
import { rewriteTags } from './defs';
import { EMPTY_DEFS, isVarRef, type Def, type DefKind, type Term, type ViewDefs } from './types';

export const VIEWS_KEY = 'views';
const VERSION = 1;

/** Accept only well-formed stored data; anything else reads as empty. */
export function sanitizeDefs(raw: unknown): ViewDefs {
  const r = raw as { vars?: unknown; views?: unknown } | null;
  const ops = new Set(['+', '&', '^']);
  const term = (t: Term): Term | null => {
    if (!t || typeof t !== 'object' || !ops.has(t.op) || !t.ref) return null;
    const ref = isVarRef(t.ref) ? (typeof t.ref.var === 'string' ? { var: t.ref.var } : null) : typeof t.ref.tag === 'string' ? { tag: t.ref.tag } : null;
    return ref && { op: t.op, not: !!t.not, ref };
  };
  const list = (v: unknown): Def[] =>
    Array.isArray(v)
      ? v.flatMap((d: Def) =>
          d && typeof d.id === 'string' && typeof d.name === 'string' && Array.isArray(d.expr)
            ? [{ id: d.id, name: d.name, expr: d.expr.flatMap((t) => term(t) ?? []) }]
            : [],
        )
      : [];
  return r && typeof r === 'object' ? { vars: list(r.vars), views: list(r.views) } : EMPTY_DEFS;
}

/**
 * Restore the entries an op changed (`from` → `to`) on top of `cur`, matched by id, leaving
 * entries the op didn't touch as they are in `cur` (so a rewrite that happened in between, e.g.
 * from a tag rename, survives an undo).
 */
export function patchDefs(cur: ViewDefs, from: ViewDefs, to: ViewDefs): ViewDefs {
  const patch = (kind: DefKind): Def[] => {
    const before = new Map(from[kind].map((d) => [d.id, d]));
    const after = new Map(to[kind].map((d) => [d.id, d]));
    const now = new Map(cur[kind].map((d) => [d.id, d]));
    const touched = (id: string) => before.get(id) !== after.get(id);
    const out = to[kind].flatMap((d) => (touched(d.id) ? [d] : (now.get(d.id) ?? [])));
    // Entries added in between (neither in `from` nor `to`) are kept, at the end.
    for (const d of cur[kind]) if (!before.has(d.id) && !after.has(d.id)) out.push(d);
    return out;
  };
  return { vars: patch('vars'), views: patch('views') };
}

/**
 * Persists `ViewDefs` (storage.local in the extension; it can outgrow storage.sync's quota).
 * Like the bookmark Store, every op re-reads storage first and returns an undo entry.
 */
export class ViewStore {
  defs: ViewDefs = EMPTY_DEFS;

  constructor(private kv: KVStore) {}

  async load(): Promise<ViewDefs> {
    const rec = await this.kv.get([VIEWS_KEY]);
    this.defs = sanitizeDefs(rec[VIEWS_KEY]);
    return this.defs;
  }

  private async save(defs: ViewDefs) {
    this.defs = defs;
    await this.kv.set({ [VIEWS_KEY]: { v: VERSION, vars: defs.vars, views: defs.views } });
  }

  /** Apply a pure edit. Returns undefined when nothing changed. */
  async apply(label: string, fn: (defs: ViewDefs) => ViewDefs): Promise<UndoEntry | undefined> {
    const before = await this.load();
    const after = fn(before);
    if (after === before) return undefined;
    await this.save(after);
    return {
      label,
      undo: async () => this.save(patchDefs(await this.load(), after, before)),
      redo: async () => this.save(patchDefs(await this.load(), before, after)),
    };
  }

  /** Replace everything (import). */
  async replace(defs: ViewDefs): Promise<UndoEntry | undefined> {
    return this.apply('import views', () => defs);
  }

  /** The bookmark Store's hook: rewrite tag references after a tag rename or move. */
  async rewriteTags(fn: (key: string) => string): Promise<void> {
    const before = await this.load();
    const after = rewriteTags(before, fn);
    if (after !== before) await this.save(after);
  }
}
