import { isAncestor, isAncestorOrSelf, parsePath, pathKey, rebase } from '../tags';
import type { TagPath } from '../types';
import { OPS, isVarRef, nameKey, type Def, type DefKind, type Op, type Ref, type Term, type ViewDefs } from './types';

/**
 * Pure edits of `ViewDefs`. Every function returns a new value and keeps the identity of each Def
 * it doesn't change (the evaluator memoizes by identity).
 */

export const newId = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const VAR_NAME = /^[A-Za-z0-9_-]+$/;

/** Why `name` can't name a `kind` entry (other than `exceptId`), or null if it can. */
export function nameProblem(defs: ViewDefs, kind: DefKind, name: string, exceptId?: string): string | null {
  if (!name) return 'name is empty';
  if (kind === 'vars' && !VAR_NAME.test(name)) return 'var names use only letters, digits, _ and -';
  if (kind === 'views' && /[{}\n]|:=/.test(name)) return 'view names cannot contain {, }, := or newlines';
  if (kind === 'views' && name !== name.trim()) return 'view names cannot start or end with spaces';
  const key = nameKey(name);
  if (defs[kind].some((d) => d.id !== exceptId && nameKey(d.name) === key)) return `${kind === 'vars' ? 'var' : 'view'} ${name} already exists`;
  return null;
}

const withList = (defs: ViewDefs, kind: DefKind, list: Def[]): ViewDefs => ({ ...defs, [kind]: list });

/** Insert a new empty entry at `at`. */
export function addDef(defs: ViewDefs, kind: DefKind, name: string, at = defs[kind].length, expr: Term[] = []): { defs: ViewDefs; def: Def } {
  const def: Def = { id: newId(), name, expr };
  const list = [...defs[kind]];
  list.splice(Math.min(at, list.length), 0, def);
  return { defs: withList(defs, kind, list), def };
}

/** Rename an entry; renaming a var also rewrites the views that reference it. */
export function renameDef(defs: ViewDefs, kind: DefKind, id: string, name: string): ViewDefs {
  const old = defs[kind].find((d) => d.id === id);
  if (!old || old.name === name) return defs;
  let out = withList(defs, kind, defs[kind].map((d) => (d.id === id ? { ...d, name } : d)));
  if (kind === 'vars') {
    const key = nameKey(old.name);
    out = mapTerms(out, (t) => (isVarRef(t.ref) && nameKey(t.ref.var) === key ? { ...t, ref: { var: name } } : t));
  }
  return out;
}

export function deleteDefs(defs: ViewDefs, kind: DefKind, ids: string[]): ViewDefs {
  const drop = new Set(ids);
  return withList(defs, kind, defs[kind].filter((d) => !drop.has(d.id)));
}

/** Move `ids` (keeping their relative order) to just after `afterId`, or to the top when null. */
export function moveDefs(defs: ViewDefs, kind: DefKind, ids: string[], afterId: string | null): ViewDefs {
  const move = new Set(ids);
  const moving = defs[kind].filter((d) => move.has(d.id));
  const rest = defs[kind].filter((d) => !move.has(d.id));
  // Pasting a block after one of its own members leaves it where it was.
  if (afterId && move.has(afterId)) return defs;
  const at = afterId === null ? 0 : rest.findIndex((d) => d.id === afterId) + 1;
  rest.splice(at, 0, ...moving);
  return withList(defs, kind, rest);
}

/** Replace one entry's expression. */
export function setExpr(defs: ViewDefs, kind: DefKind, id: string, fn: (expr: Term[]) => Term[]): ViewDefs {
  return withList(defs, kind, defs[kind].map((d) => (d.id === id ? { ...d, expr: fn(d.expr) } : d)));
}

/** Apply `fn` to every term of every entry, replacing only the entries that changed. */
export function mapTerms(defs: ViewDefs, fn: (t: Term) => Term): ViewDefs {
  const map = (list: Def[]) => {
    let changed = false;
    const out = list.map((d) => {
      let dirty = false;
      const expr = d.expr.map((t) => {
        const n = fn(t);
        if (n !== t) dirty = true;
        return n;
      });
      if (!dirty) return d;
      changed = true;
      return { ...d, expr };
    });
    return changed ? out : list;
  };
  const vars = map(defs.vars);
  const views = map(defs.views);
  return vars === defs.vars && views === defs.views ? defs : { vars, views };
}

/** Rewrite tag references, e.g. after a tag is renamed or moved (`key → new key`). */
export function rewriteTags(defs: ViewDefs, fn: (key: string) => string): ViewDefs {
  return mapTerms(defs, (t) => {
    if (isVarRef(t.ref)) return t;
    const key = fn(t.ref.tag);
    return key === t.ref.tag ? t : { ...t, ref: { tag: key } };
  });
}

/** `rewriteTags` for a tag moved from `from` to `to` (its descendants follow). */
export const rebaseFn = (from: TagPath, to: TagPath) => (key: string) => pathKey(rebase(parsePath(key), from, to));

/** Entries with a term matching `pred`, e.g. to warn before deleting what they reference. */
export function referencing(defs: ViewDefs, pred: (r: Ref) => boolean): { kind: DefKind; def: Def }[] {
  const out: { kind: DefKind; def: Def }[] = [];
  for (const kind of ['vars', 'views'] as const) {
    for (const def of defs[kind]) if (def.expr.some((t) => pred(t.ref))) out.push({ kind, def });
  }
  return out;
}

/** A predicate for `referencing`: references to `path` or anything under it. */
export const refsUnder = (path: TagPath) => (r: Ref) => !isVarRef(r) && isAncestorOrSelf(path, parsePath(r.tag));

/** A predicate for `referencing`: references to the var `name`. */
export const refsVar = (name: string) => (r: Ref) => isVarRef(r) && nameKey(r.var) === nameKey(name);

/** An existing tag term that is an ancestor or descendant of `key` (the editor offers to replace it). */
export function related(expr: readonly Term[], key: string): { index: number; relation: 'parent' | 'child' } | null {
  const path = parsePath(key);
  for (const [index, t] of expr.entries()) {
    if (isVarRef(t.ref)) continue;
    const p = parsePath(t.ref.tag);
    if (isAncestor(p, path)) return { index, relation: 'parent' };
    if (isAncestor(path, p)) return { index, relation: 'child' };
  }
  return null;
}

export const sameRef = (a: Ref, b: Ref): boolean =>
  isVarRef(a) ? isVarRef(b) && nameKey(a.var) === nameKey(b.var) : !isVarRef(b) && a.tag === b.tag;

// ------------------------------------------------------------------ term lists

/** Index of a term with this operand (ignoring row `except`), or -1. An operand appears once per expression. */
export const indexOfRef = (expr: readonly Term[], ref: Ref, except = -1): number => expr.findIndex((t, i) => i !== except && sameRef(t.ref, ref));

/** `terms` minus any whose operand is already in `expr` (or earlier in `terms`). */
export function newTerms(expr: readonly Term[], terms: readonly Term[]): Term[] {
  const out: Term[] = [];
  for (const t of terms) if (indexOfRef(expr, t.ref) < 0 && indexOfRef(out, t.ref) < 0) out.push(t);
  return out;
}

export const term = (ref: Ref, op: Op = '+', not = false): Term => ({ op, not, ref });

export function insertTerms(expr: readonly Term[], terms: readonly Term[], at: number): Term[] {
  const out = [...expr];
  out.splice(Math.max(0, Math.min(at, out.length)), 0, ...terms);
  return out;
}

export const deleteTerms = (expr: readonly Term[], idxs: Iterable<number>): Term[] => {
  const drop = new Set(idxs);
  return expr.filter((_, i) => !drop.has(i));
};

export const replaceTerm = (expr: readonly Term[], i: number, ref: Ref): Term[] =>
  expr.map((t, j) => (j === i ? { ...t, ref } : t));

/** Flip `!` on each of `idxs`. */
export const toggleNot = (expr: readonly Term[], idxs: Iterable<number>): Term[] => {
  const on = new Set(idxs);
  return expr.map((t, i) => (on.has(i) ? { ...t, not: !t.not } : t));
};

/** Set every term in `idxs` to the operator after the first one's (`+ → & → ^ → +`). */
export function cycleOp(expr: readonly Term[], idxs: number[]): Term[] {
  const first = expr[idxs[0]];
  if (!first) return [...expr];
  const op = OPS[(OPS.indexOf(first.op) + 1) % OPS.length];
  const on = new Set(idxs);
  return expr.map((t, i) => (on.has(i) ? { ...t, op } : t));
}

/** Move the terms at `idxs` to just after index `after` (-1: the top), within one expression. */
export function moveTerms(expr: readonly Term[], idxs: number[], after: number): Term[] {
  const on = new Set(idxs);
  if (on.has(after)) return [...expr];
  const moving = expr.filter((_, i) => on.has(i));
  const rest = expr.filter((_, i) => !on.has(i));
  const at = after < 0 ? 0 : rest.indexOf(expr[after]) + 1;
  rest.splice(at, 0, ...moving);
  return rest;
}
