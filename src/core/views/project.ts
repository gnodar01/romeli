import type { Model, TagNode } from '../model';
import { evaluatorOf, scopeOf } from './eval';
import type { Def, ViewDefs } from './types';

/**
 * The read-only Model a view tab shows: the full model pruned to the view's scope (see
 * `scopeOf`), keeping only copies of matching items. Paths and ids are the real ones, so the
 * browser UI renders it unchanged. Memoized per (model, view Def, vars).
 */
export function projectView(model: Model, def: Def, defs: ViewDefs): Model {
  const memo = cache.get(model)?.get(def);
  if (memo && memo.vars === defs.vars) return memo.model;

  const ev = evaluatorOf(model);
  const bits = ev.view(def, defs);
  const pos = ev.index.pos;
  const scope = scopeOf(def, defs);
  let projected: Model;
  if (scope === 'all') {
    projected = model.filtered(() => 'all', (c) => bits.has(pos.get(c.url)!));
  } else {
    // Ancestors of scope tags are kept as routes; scope tags keep their whole subtree.
    const routes = new Set<string>();
    for (const key of scope) {
      const t = model.tagsByKey.get(key);
      for (let p = t?.parent; p; p = p.parent) routes.add(p.key);
    }
    const keep = (t: TagNode) => (scope.has(t.key) ? 'all' : routes.has(t.key) ? 'path' : 'none');
    projected = model.filtered(keep, (c) => bits.has(pos.get(c.url)!));
  }

  let byDef = cache.get(model);
  if (!byDef) cache.set(model, (byDef = new WeakMap()));
  byDef.set(def, { vars: defs.vars, model: projected });
  return projected;
}

const cache = new WeakMap<Model, WeakMap<Def, { vars: readonly Def[]; model: Model }>>();
