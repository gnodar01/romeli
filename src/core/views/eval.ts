import type { Model, TagNode } from '../model';
import { Bitset } from './bitset';
import { EMPTY_DEFS, isVarRef, nameKey, type Def, type Term, type ViewDefs } from './types';

/**
 * Items of one Model numbered 0..n-1, with each tag's subtree as a bitset. Built at most once per
 * Model (see `indexOf`); tag bitsets are computed on first use and memoized together with every
 * subtree visited on the way, so the total cost per Model is bounded by O(tags + copies).
 */
export class ItemIndex {
  readonly urls: string[];
  readonly pos = new Map<string, number>();
  readonly empty: Bitset;
  private memo = new Map<TagNode, Bitset>();

  constructor(readonly model: Model) {
    this.urls = [...model.items.keys()];
    this.urls.forEach((u, i) => this.pos.set(u, i));
    this.empty = new Bitset(this.size);
  }

  get size(): number {
    return this.urls.length;
  }

  /** Items with a copy in `tag` or any of its descendants. Shared: never mutate the result. */
  subtree(tag: TagNode): Bitset {
    let bits = this.memo.get(tag);
    if (bits) return bits;
    bits = new Bitset(this.size);
    for (const c of tag.copies) bits.add(this.pos.get(c.url)!);
    for (const t of tag.tags) bits.or(this.subtree(t));
    this.memo.set(tag, bits);
    return bits;
  }

  /** By path key; undefined when no such tag exists (a dangling reference). */
  tag(key: string): Bitset | undefined {
    const t = this.model.tagsByKey.get(key);
    return t && this.subtree(t);
  }
}

const indexes = new WeakMap<Model, ItemIndex>();
export function indexOf(model: Model): ItemIndex {
  let ix = indexes.get(model);
  if (!ix) indexes.set(model, (ix = new ItemIndex(model)));
  return ix;
}

/**
 * Evaluate a flat expression in one left-to-right pass. Precedence `& > ^ > +` is handled by
 * folding: a run of `&` builds a product, `^` folds products into a chain, `+` folds chains into
 * the sum. `lit` returns shared bitsets; only freshly allocated ones are mutated.
 */
export function evaluate(expr: readonly Term[], size: number, lit: (t: Term) => Bitset): Bitset {
  let sum: Bitset | null = null;
  let chain: Bitset | null = null;
  let prod: Bitset | null = null;
  const start = (t: Term) => {
    const b = lit(t).clone();
    return t.not ? b.not() : b;
  };
  const closeChain = () => {
    const c = chain ? chain.xor(prod!) : prod!;
    sum = sum ? sum.or(c) : c;
    chain = null;
  };
  expr.forEach((t, i) => {
    if (i === 0) prod = start(t);
    else if (t.op === '&') t.not ? prod!.andNot(lit(t)) : prod!.and(lit(t));
    else {
      if (t.op === '^') chain = chain ? chain.xor(prod!) : prod;
      else closeChain();
      prod = start(t);
    }
  });
  if (prod) closeChain();
  return sum ?? new Bitset(size);
}

/** Var lookup by (case-insensitive) name, built once per vars array. */
const varMaps = new WeakMap<readonly Def[], Map<string, Def>>();
export function varsByName(defs: ViewDefs): Map<string, Def> {
  let m = varMaps.get(defs.vars);
  if (!m) varMaps.set(defs.vars, (m = new Map(defs.vars.map((d) => [nameKey(d.name), d]))));
  return m;
}

export const varOf = (defs: ViewDefs, name: string): Def | undefined => varsByName(defs).get(nameKey(name));

/**
 * Evaluates vars and views against one Model, memoized by `Def` identity: an edit replaces only
 * the Defs it touches, so everything else stays cached. A view's memo also records the var Defs it
 * resolved, and is reused only while they are unchanged. Get one through `evaluatorOf`.
 */
export class Evaluator {
  readonly index: ItemIndex;
  private vars = new WeakMap<Def, Bitset>();
  private views = new WeakMap<Def, { bits: Bitset; deps: (Def | undefined)[] }>();

  constructor(model: Model) {
    this.index = indexOf(model);
  }

  /** The bits of one term's operand (ignoring its `!`), or undefined when it is dangling. */
  operand(t: Term, defs: ViewDefs, inVar = false): Bitset | undefined {
    if (!isVarRef(t.ref)) return this.index.tag(t.ref.tag);
    if (inVar) return undefined; // vars cannot reference vars
    const v = varOf(defs, t.ref.var);
    return v && this.var(v);
  }

  var(def: Def): Bitset {
    let bits = this.vars.get(def);
    if (!bits) {
      bits = evaluate(def.expr, this.index.size, (t) => this.operand(t, EMPTY_DEFS, true) ?? this.index.empty);
      this.vars.set(def, bits);
    }
    return bits;
  }

  view(def: Def, defs: ViewDefs): Bitset {
    const deps = def.expr.map((t) => (isVarRef(t.ref) ? varOf(defs, t.ref.var) : undefined));
    const hit = this.views.get(def);
    if (hit && hit.deps.every((d, i) => d === deps[i])) return hit.bits;
    const bits = evaluate(def.expr, this.index.size, (t) => this.operand(t, defs) ?? this.index.empty);
    this.views.set(def, { bits, deps });
    return bits;
  }

  /** Item URLs in `bits`. */
  urls(bits: Bitset): string[] {
    return [...bits].map((i) => this.index.urls[i]);
  }
}

const evaluators = new WeakMap<Model, Evaluator>();
export function evaluatorOf(model: Model): Evaluator {
  let ev = evaluators.get(model);
  if (!ev) evaluators.set(model, (ev = new Evaluator(model)));
  return ev;
}

/** Tag keys a view shows its matches under, or 'all' for the whole tree. */
export type Scope = Set<string> | 'all';

/**
 * The tags an expression references positively, directly or through a non-negated var. Each
 * `&`-product contributes its positive tags; a product with nothing positive (`!a`, `!{v}`) can
 * match items anywhere, so the scope becomes the whole tree.
 */
export function scopeOf(def: Def, defs: ViewDefs, inVar = false): Scope {
  const out = new Set<string>();
  let product: Term[] = [];
  const flush = (): boolean => {
    if (!product.length) return true;
    const positives = product.filter((t) => !t.not);
    product = [];
    if (!positives.length) return false;
    for (const t of positives) {
      if (!isVarRef(t.ref)) out.add(t.ref.tag);
      else if (!inVar) {
        const v = varOf(defs, t.ref.var);
        if (!v) continue;
        const s = scopeOf(v, defs, true);
        if (s === 'all') return false;
        s.forEach((k) => out.add(k));
      }
    }
    return true;
  };
  for (const [i, t] of def.expr.entries()) {
    if (i > 0 && t.op !== '&' && !flush()) return 'all';
    product.push(t);
  }
  return flush() ? out : 'all';
}
