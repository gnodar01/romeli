import { describe, expect, it } from 'vitest';
import { Model } from '../src/core/model';
import { parsePath as P } from '../src/core/tags';
import { Bitset } from '../src/core/views/bitset';
import {
  addDef,
  cycleOp,
  deleteTerms,
  moveDefs,
  moveTerms,
  nameProblem,
  referencing,
  refsUnder,
  related,
  renameDef,
  rewriteTags,
  rebaseFn,
  term,
  toggleNot,
} from '../src/core/views/defs';
import { formatDefs, parseDefs } from '../src/core/views/dsl';
import { evaluate, evaluatorOf, scopeOf } from '../src/core/views/eval';
import { projectView } from '../src/core/views/project';
import { ViewStore, patchDefs } from '../src/core/views/store';
import type { Def, Term, ViewDefs } from '../src/core/views/types';
import { FLAVORS, MemoryKV, resolverFor, setup, type Spec } from './mock';
import { MockBookmarks } from './mock';
import { Store } from '../src/core/store';
import { OrderStore } from '../src/core/order';

// The tree from the feature notes. item1 is a linux discussion, item2 linux news.
const U = (n: string) => `https://${n}.example`;
const TREE: Spec = {
  tech: {
    languages: {
      python: { py: U('py'), both: U('pyc') },
      javascript: { js: U('js') },
      c: { c: U('c'), both: U('pyc') },
      rust: { rs: U('rs') },
      'c++': { cpp: U('cpp') },
    },
    discussion: { 'hacker news': { item1: U('item1') }, lobsters: { lob: U('lob') } },
    videos: { vid: U('vid') },
    linux: { item1: U('item1'), item2: U('item2'), kernel: U('kernel') },
  },
  media: {
    videos: { youtube: { item1: U('item1'), yt: U('yt') } },
    articles: { news: { nw: U('nw') }, tech: { item2: U('item2'), art: U('art') } },
  },
  loose: U('loose'),
};

const tag = (k: string, op: Term['op'] = '+', not = false): Term => term({ tag: k }, op, not);
const ref = (k: string, op: Term['op'] = '+', not = false): Term => term({ var: k }, op, not);
const def = (name: string, ...expr: Term[]): Def => ({ id: name, name, expr });

const DEFS: ViewDefs = {
  vars: [
    def('linux_discussions', tag('tech/linux'), tag('tech/discussion', '&')),
    def('linux_news', tag('tech/linux'), tag('media/articles/tech', '&')),
    def('compiled_langs', tag('tech/languages/c'), tag('tech/languages/rust')),
  ],
  views: [
    def('linux', ref('linux_discussions'), ref('linux_news')),
    def('scripting_langs', tag('tech/languages'), ref('compiled_langs', '&', true)),
  ],
};

async function model(spec: Spec = TREE): Promise<Model> {
  return (await setup(spec)).store.model;
}

const urls = (m: Model, d: Def, defs = DEFS) => evaluatorOf(m).urls(evaluatorOf(m).view(d, defs)).sort();

/** The projected tree as nested `{ name: [urls…] | {…} }`, for comparing shapes. */
function shape(m: Model) {
  const walk = (t: Model['root']): unknown => {
    const out: Record<string, unknown> = {};
    for (const s of t.tags) out[s.name] = walk(s);
    if (t.copies.length) out['.'] = t.copies.map((c) => c.url.slice(8, -8)).sort();
    return out;
  };
  return walk(m.root);
}

describe('Bitset', () => {
  it('does set algebra within its size', () => {
    const a = Bitset.of(40, [0, 3, 35]);
    const b = Bitset.of(40, [3, 4, 39]);
    expect([...a.clone().or(b)]).toEqual([0, 3, 4, 35, 39]);
    expect([...a.clone().and(b)]).toEqual([3]);
    expect([...a.clone().xor(b)]).toEqual([0, 4, 35, 39]);
    expect([...a.clone().andNot(b)]).toEqual([0, 35]);
    expect(a.clone().not().count()).toBe(37);
    expect([...new Bitset(33).not()]).toHaveLength(33);
  });
});

describe('evaluate (precedence ! > & > ^ > +)', () => {
  // Each literal is the set of the given indexes out of 0..7 (all 3-bit combinations of a, b, c).
  const sets: Record<string, Bitset> = {
    a: Bitset.of(8, [1, 3, 5, 7]),
    b: Bitset.of(8, [2, 3, 6, 7]),
    c: Bitset.of(8, [4, 5, 6, 7]),
  };
  const run = (expr: Term[]) => [...evaluate(expr, 8, (t) => sets[(t.ref as { tag: string }).tag])];
  const truth = (f: (a: boolean, b: boolean, c: boolean) => boolean) =>
    [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => f(!!(i & 1), !!(i & 2), !!(i & 4)));

  it.each([
    ['a + b & c', [tag('a'), tag('b'), tag('c', '&')], (a: boolean, b: boolean, c: boolean) => a || (b && c)],
    ['a & b + c', [tag('a'), tag('b', '&'), tag('c')], (a: boolean, b: boolean, c: boolean) => (a && b) || c],
    ['a ^ b & c', [tag('a'), tag('b', '^'), tag('c', '&')], (a: boolean, b: boolean, c: boolean) => a !== (b && c)],
    ['a + b ^ c', [tag('a'), tag('b'), tag('c', '^')], (a: boolean, b: boolean, c: boolean) => a || b !== c],
    ['a ^ b + c', [tag('a'), tag('b', '^'), tag('c')], (a: boolean, b: boolean, c: boolean) => a !== b || c],
    ['!a & b', [tag('a', '+', true), tag('b', '&')], (a: boolean, b: boolean) => !a && b],
    ['a & !b ^ !c', [tag('a'), tag('b', '&', true), tag('c', '^', true)], (a: boolean, b: boolean, c: boolean) => (a && !b) !== !c],
  ])('%s', (_, expr, f) => {
    expect(run(expr)).toEqual(truth(f));
  });

  it('is empty for an empty expression and ignores the first operator', () => {
    expect(run([])).toEqual([]);
    expect(run([tag('a', '&'), tag('b')])).toEqual(truth((a, b) => a || b));
  });

  it('never mutates the shared literals', () => {
    const before = [...sets.a];
    run([tag('a'), tag('b', '&', true), tag('a', '^')]);
    expect([...sets.a]).toEqual(before);
  });
});

describe('views over a tree', () => {
  it('evaluates the examples from the notes (tags include descendants)', async () => {
    const m = await model();
    expect(urls(m, DEFS.views[0])).toEqual([U('item1'), U('item2')]);
    expect(urls(m, DEFS.views[1])).toEqual([U('cpp'), U('js'), U('py')]);
  });

  it('treats missing tags and vars as empty', async () => {
    const m = await model();
    expect(urls(m, def('x', tag('nope'), tag('tech/videos')))).toEqual([U('vid')]);
    expect(urls(m, def('x', ref('nope'), tag('tech/videos')))).toEqual([U('vid')]);
    // a var referencing a var is treated as dangling
    const defs: ViewDefs = { vars: [def('v', ref('w'), tag('tech/videos'))], views: [] };
    expect(urls(m, def('x', ref('v')), defs)).toEqual([U('vid')]);
  });

  it('memoizes by Def identity and follows var edits', async () => {
    const m = await model();
    const ev = evaluatorOf(m);
    const v = DEFS.views[0];
    const first = ev.view(v, DEFS);
    expect(ev.view(v, DEFS)).toBe(first);
    const edited: ViewDefs = { ...DEFS, vars: DEFS.vars.map((d) => (d.name === 'linux_news' ? { ...d, expr: [tag('tech/videos')] } : d)) };
    expect(ev.view(v, edited)).not.toBe(first);
    expect(urls(m, v, edited)).toEqual([U('item1'), U('vid')]);
  });

  it('projects the linux view onto the referenced tags only', async () => {
    const m = await model();
    expect(scopeOf(DEFS.views[0], DEFS)).toEqual(new Set(['tech/linux', 'tech/discussion', 'media/articles/tech']));
    expect(shape(projectView(m, DEFS.views[0], DEFS))).toEqual({
      tech: {
        discussion: { 'hacker news': { '.': ['item1'] } },
        linux: { '.': ['item1', 'item2'] },
      },
      media: { articles: { tech: { '.': ['item2'] } } },
    });
  });

  it('projects scripting_langs, pruning folders left empty', async () => {
    const m = await model();
    expect(shape(projectView(m, DEFS.views[1], DEFS))).toEqual({
      tech: { languages: { python: { '.': ['py'] }, javascript: { '.': ['js'] }, 'c++': { '.': ['cpp'] } } },
    });
  });

  it('uses the whole tree when a product has nothing positive', async () => {
    const m = await model();
    const v = def('x', tag('tech', '+', true), tag('media', '&', true));
    expect(scopeOf(v, DEFS)).toBe('all');
    expect(shape(projectView(m, v, DEFS))).toEqual({ '.': ['loose'] });
  });

  it('keeps item ids, paths, and the kept tags in copy order', async () => {
    const m = await model();
    const p = projectView(m, DEFS.views[0], DEFS);
    const item = p.item(U('item1'))!;
    expect(item.tags.map((t) => t.join('/'))).toEqual(['tech/discussion/hacker news', 'tech/linux']);
    expect(p.tag(P('tech/linux'))!.id).toBe(m.tag(P('tech/linux'))!.id);
    expect(projectView(m, DEFS.views[0], DEFS)).toBe(p);
  });

  it('stays fast at 10k items, 500 tags and 50 views', async () => {
    const spec: Spec = {};
    for (let t = 0; t < 500; t++) {
      const folder: Spec = {};
      for (let i = 0; i < 40; i++) folder[`i${i}`] = U(`u${(t * 37 + i * 101) % 10000}`);
      spec[`t${t}`] = folder;
    }
    const m = await model(spec);
    const vars = Array.from({ length: 20 }, (_, i) => def(`v${i}`, tag(`t${i}`), tag(`t${i + 20}`, '&', true), tag(`t${i + 40}`, '^')));
    const views = Array.from({ length: 50 }, (_, i) => def(`w${i}`, ref(`v${i % 20}`), tag(`t${100 + i}`, '&'), ref(`v${(i + 1) % 20}`, '+', true)));
    const defs = { vars, views };
    const t0 = performance.now();
    for (const v of views) evaluatorOf(m).view(v, defs);
    expect(performance.now() - t0).toBeLessThan(100);
  });
});

describe('defs edits', () => {
  it('validates names', () => {
    expect(nameProblem(DEFS, 'vars', 'linux news')).toMatch(/letters/);
    expect(nameProblem(DEFS, 'vars', 'LINUX_NEWS')).toMatch(/exists/);
    expect(nameProblem(DEFS, 'vars', 'LINUX_NEWS', 'linux_news')).toBeNull();
    expect(nameProblem(DEFS, 'views', 'Linux reading')).toBeNull();
    expect(nameProblem(DEFS, 'views', 'a := b')).toMatch(/:=/);
  });

  it('renaming a var rewrites its references and keeps other Defs', () => {
    const out = renameDef(DEFS, 'vars', 'linux_news', 'news');
    expect(out.views[0].expr[1].ref).toEqual({ var: 'news' });
    expect(out.views[1]).toBe(DEFS.views[1]);
    expect(out.vars[0]).toBe(DEFS.vars[0]);
  });

  it('rewrites tag references on rename/move', () => {
    const out = rewriteTags(DEFS, rebaseFn(P('tech/linux'), P('os/linux')));
    expect(out.vars[0].expr[0].ref).toEqual({ tag: 'os/linux' });
    expect(out.vars[2]).toBe(DEFS.vars[2]);
    expect(out.views).toBe(DEFS.views);
    expect(rewriteTags(DEFS, (k) => k)).toBe(DEFS);
  });

  it('finds references and related tags', () => {
    expect(referencing(DEFS, refsUnder(P('tech/languages'))).map((r) => r.def.name)).toEqual(['compiled_langs', 'scripting_langs']);
    expect(related([tag('tech/languages')], 'tech/languages/c')).toEqual({ index: 0, relation: 'parent' });
    expect(related([tag('a'), tag('tech/languages/c')], 'tech')).toEqual({ index: 1, relation: 'child' });
    expect(related([tag('tech/linux')], 'tech/languages')).toBeNull();
  });

  it('edits rows', () => {
    const e = [tag('a'), tag('b'), tag('c'), tag('d')];
    expect(cycleOp(e, [1, 2]).map((t) => t.op)).toEqual(['+', '&', '&', '+']);
    expect(toggleNot(e, [0, 3]).map((t) => t.not)).toEqual([true, false, false, true]);
    expect(deleteTerms(e, [0, 2]).map((t) => (t.ref as { tag: string }).tag)).toEqual(['b', 'd']);
    const keys = (x: Term[]) => x.map((t) => (t.ref as { tag: string }).tag).join('');
    expect(keys(moveTerms(e, [0, 1], 2))).toBe('cabd');
    expect(keys(moveTerms(e, [3], -1))).toBe('dabc');
    expect(keys(moveTerms(e, [1], 1))).toBe('abcd');
  });

  it('adds and reorders entries', () => {
    const { defs, def: d } = addDef(DEFS, 'views', 'new', 1);
    expect(defs.views.map((v) => v.name)).toEqual(['linux', 'new', 'scripting_langs']);
    expect(moveDefs(defs, 'views', [d.id], null).views[0].name).toBe('new');
    expect(moveDefs(defs, 'views', ['linux'], 'scripting_langs').views.map((v) => v.name)).toEqual(['new', 'scripting_langs', 'linux']);
  });
});

describe('dsl', () => {
  it('round-trips, including awkward paths', () => {
    const defs: ViewDefs = {
      vars: [...DEFS.vars, def('odd', tag('tech/languages/c++'), tag('!important', '^', true), tag('a & b/x', '&'), tag('#hash'))],
      views: DEFS.views,
    };
    const text = formatDefs(defs);
    expect(text).toContain('tech/languages/c++/');
    expect(text).toContain('"!important/"');
    const back = parseDefs(text, defs);
    expect(back.problems).toEqual([]);
    expect(back.defs).toEqual(defs);
  });

  it('parses the notes syntax, | as +, and one-line definitions', () => {
    const { defs, problems } = parseDefs(`
# comment
[vars]
compiled_langs :=
      tech/languages/c/
    | tech/languages/rust/

[views]
Scripting langs := tech/languages/ & ! {compiled_langs}
`);
    expect(problems).toEqual([]);
    expect(defs.vars[0].expr).toEqual([tag('tech/languages/c'), tag('tech/languages/rust')]);
    expect(defs.views[0]).toMatchObject({ name: 'Scripting langs', expr: [tag('tech/languages'), ref('compiled_langs', '&', true)] });
  });

  it('reports problems by line', () => {
    const { problems } = parseDefs(`[vars]
bad name := a/
ok := a/ b/
v := {w}
[views]
x := {missing}
x := a/`);
    expect(problems.map((p) => [p.line, !!p.warn])).toEqual([
      [2, false],
      [3, false],
      [4, false],
      [6, true],
      [7, false],
    ]);
  });
});

describe('ViewStore', () => {
  it('saves, undoes and redoes, keeping changes made in between', async () => {
    const kv = new MemoryKV();
    const vs = new ViewStore(kv);
    await vs.replace(DEFS);
    const entry = (await vs.apply('rename', (d) => renameDef(d, 'views', 'linux', 'Linux')))!;
    await vs.rewriteTags(rebaseFn(P('tech/languages'), P('langs')));
    await entry.undo();
    const now = await new ViewStore(kv).load();
    expect(now.views.map((v) => v.name)).toEqual(['linux', 'scripting_langs']);
    expect(now.views[1].expr[0].ref).toEqual({ tag: 'langs' });
    await entry.redo();
    expect((await vs.load()).views[0].name).toBe('Linux');
    expect(await vs.apply('noop', (d) => d)).toBeUndefined();
  });

  it('patchDefs keeps entries added in between', () => {
    const { defs: after } = addDef(DEFS, 'vars', 'a');
    const { defs: cur } = addDef(after, 'vars', 'b');
    expect(patchDefs(cur, after, DEFS).vars.map((d) => d.name)).toEqual([...DEFS.vars.map((d) => d.name), 'b']);
  });
});

describe.each(FLAVORS)('tag references follow bookmark ops (%s)', (flavor) => {
  async function withViews() {
    const api = new MockBookmarks(flavor);
    api.seed(TREE);
    const kv = new MemoryKV();
    const views = new ViewStore(new MemoryKV());
    await views.replace(DEFS);
    const store = new Store(api, new OrderStore(kv), resolverFor(flavor), views);
    await store.load();
    const keyOf = async (kind: 'vars' | 'views', i: number, j: number) => (await views.load())[kind][i].expr[j].ref;
    return { store, views, keyOf };
  }

  it('rename and move rewrite references; undo reverts', async () => {
    const { store, keyOf } = await withViews();
    const r = await store.renameTag(P('tech/linux'), 'gnu');
    expect(await keyOf('vars', 0, 0)).toEqual({ tag: 'tech/gnu' });
    await r.entry!.undo();
    expect(await keyOf('vars', 0, 0)).toEqual({ tag: 'tech/linux' });
    await store.moveTag(P('tech/languages'), P('media'));
    expect(await keyOf('vars', 2, 1)).toEqual({ tag: 'media/languages/rust' });
    expect(await keyOf('views', 1, 0)).toEqual({ tag: 'media/languages' });
  });

  it('normalizing names rewrites references', async () => {
    const { store, views } = await withViews();
    await store.createTag(P('a,b'));
    await views.apply('add', (d) => addDef(d, 'vars', 'ab', 0, [tag('a,b')]).defs);
    const r = await store.normalizeNames();
    expect((await views.load()).vars[0].expr[0].ref).toEqual({ tag: 'a;b' });
    await r.entry!.undo();
    expect((await views.load()).vars[0].expr[0].ref).toEqual({ tag: 'a,b' });
  });

  it('deleting a tag keeps the (now dangling) reference', async () => {
    const { store, keyOf } = await withViews();
    await store.deleteTag(P('tech/linux'));
    expect(await keyOf('vars', 0, 0)).toEqual({ tag: 'tech/linux' });
  });
});
