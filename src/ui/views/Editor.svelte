<script lang="ts">
  import { fuzzyFilter } from '../../core/fuzzy';
  import { KeyResolver, bindingsFor, type Action, type Bindings } from '../../core/keymap';
  import type { Model } from '../../core/model';
  import { plural, type UndoEntry } from '../../core/store';
  import { formatPath, parsePath } from '../../core/tags';
  import type { UndoStack } from '../../core/undo';
  import {
    addDef,
    cycleOp,
    deleteDefs,
    deleteTerms,
    indexOfRef,
    insertTerms,
    moveDefs,
    moveTerms,
    nameProblem,
    newTerms,
    referencing,
    refsVar,
    related,
    renameDef,
    replaceTerm,
    setExpr,
    term,
    toggleNot,
  } from '../../core/views/defs';
  import { evaluatorOf, varOf } from '../../core/views/eval';
  import type { ViewStore } from '../../core/views/store';
  import { isVarRef, type Def, type DefKind, type Ref, type Term, type ViewDefs } from '../../core/views/types';
  import { findPositions, type PickerRow } from '../browser/view';
  import Highlight from '../components/Highlight.svelte';
  import RowList from '../components/RowList.svelte';
  import { KeyFeed } from '../lib/keys.svelte';
  import { ListNav, MOTIONS, filterByName, pageRows } from '../lib/listNav.svelte';
  import { Flash, Overlays, type PickAction } from '../lib/overlays.svelte';
  import OverlayView from '../lib/OverlayHost.svelte';
  import StatusBar from '../lib/StatusBar.svelte';
  import WhichKey from '../lib/WhichKey.svelte';

  /**
   * `K`: the viewset and varset editors. Each has a list of entries on the left and the hovered
   * entry's expression on the right, one term per row. Edits go through the ViewStore, with their
   * own undo history (`history`), separate from bookmark undo.
   */
  let {
    model,
    defs,
    store,
    history,
    bindings,
    onDefs,
    onOpen,
    onQuit,
  }: {
    model: Model;
    defs: ViewDefs;
    store: ViewStore;
    history: UndoStack;
    bindings: Bindings;
    onDefs: (d: ViewDefs) => void;
    onOpen: (viewId: string) => void;
    onQuit: () => void;
  } = $props();

  type DefRow = { key: string; name: string; def: Def; count: number };
  type TermRow = { key: string; name: string; term: Term; index: number; count: number | null };
  type Clip =
    | { mode: 'yank' | 'cut'; what: 'defs'; kind: DefKind; ids: string[] }
    | { mode: 'yank' | 'cut'; what: 'terms'; kind: DefKind; defId: string; idxs: number[]; terms: Term[] };

  const overlays = new Overlays();
  const flash = new Flash();
  const say = flash.say;
  const keys = new KeyFeed();
  const resolvers = $derived({
    editorList: new KeyResolver(bindingsFor(bindings, 'editorList')),
    editorExpr: new KeyResolver(bindingsFor(bindings, 'editorExpr')),
  });

  let kind = $state<DefKind>('views');
  let focus = $state<'list' | 'expr'>('list');
  let clip = $state.raw<Clip | null>(null);
  let busy = $state(false);

  const ev = $derived(evaluatorOf(model));
  const defRows = (k: DefKind): DefRow[] =>
    defs[k].map((def) => ({
      key: def.id,
      name: def.name,
      def,
      count: (k === 'vars' ? ev.var(def) : ev.view(def, defs)).count(),
    }));
  type Rows<R> = Record<DefKind, (R & { positions?: number[] })[]>;
  const allLists = $derived({ views: defRows('views'), vars: defRows('vars') });
  const lists: Record<DefKind, ListNav<DefRow>> = {
    views: new ListNav<DefRow>(() => listRows.views, { wrap: true }),
    vars: new ListNav<DefRow>(() => listRows.vars, { wrap: true }),
  };
  const listRows: Rows<DefRow> = $derived({
    views: filterByName(allLists.views, lists.views.filter),
    vars: filterByName(allLists.vars, lists.vars.filter),
  });
  const list: ListNav<DefRow> = $derived(lists[kind]);
  const current: Def | undefined = $derived(list.hovered?.def);

  const refLabel = (r: Ref) => (isVarRef(r) ? `{${r.var}}` : formatPath(parsePath(r.tag)));
  /** Items an operand matches, or null when it is dangling (a missing tag or var). */
  function refCount(r: Ref, k: DefKind): number | null {
    if (!isVarRef(r)) return ev.index.tag(r.tag)?.count() ?? null;
    if (k === 'vars') return null;
    const v = varOf(defs, r.var);
    return v ? ev.var(v).count() : null;
  }
  const termRowsOf = (k: DefKind, def: Def | undefined): TermRow[] =>
    (def?.expr ?? []).map((t, index) => ({ key: String(index), name: refLabel(t.ref), term: t, index, count: refCount(t.ref, k) }));
  const exprs: Record<DefKind, ListNav<TermRow>> = {
    views: new ListNav<TermRow>(() => exprRows.views, { wrap: true }),
    vars: new ListNav<TermRow>(() => exprRows.vars, { wrap: true }),
  };
  const exprRows: Rows<TermRow> = $derived({
    views: filterByName(termRowsOf('views', kind === 'views' ? current : lists.views.hovered?.def), exprs.views.filter),
    vars: filterByName(termRowsOf('vars', kind === 'vars' ? current : lists.vars.hovered?.def), exprs.vars.filter),
  });
  const expr: ListNav<TermRow> = $derived(exprs[kind]);
  const nav: ListNav<DefRow> | ListNav<TermRow> = $derived(focus === 'list' ? list : expr);
  const screen = $derived(focus === 'list' ? ('editorList' as const) : ('editorExpr' as const));
  const total = $derived(current ? (kind === 'vars' ? ev.var(current) : ev.view(current, defs)).count() : 0);
  const noun = $derived(kind === 'vars' ? 'var' : 'view');

  // ------------------------------------------------------------------ edits

  /** Apply a pure edit through the store, recording undo. */
  async function apply(label: string, fn: (d: ViewDefs) => ViewDefs): Promise<boolean> {
    if (busy) return false;
    busy = true;
    try {
      const entry: UndoEntry | undefined = await store.apply(label, fn);
      if (!entry) return false;
      history.push(entry);
      onDefs(store.defs);
      say(label);
      return true;
    } catch (e) {
      say(`error: ${(e as Error).message}`, 'error');
      return false;
    } finally {
      busy = false;
    }
  }

  async function undo(redo: boolean) {
    if (busy) return;
    busy = true;
    try {
      const e = redo ? await history.redo() : await history.undo();
      say(e ? `${redo ? 'redid' : 'undid'}: ${e.label}` : `nothing to ${redo ? 'redo' : 'undo'}`);
      onDefs(await store.load());
    } finally {
      busy = false;
    }
  }

  async function askName(title: string, value = '', exceptId?: string): Promise<string | null> {
    const hint = kind === 'vars' ? 'letters, digits, _ and -' : 'any name without { } or :=';
    for (let v: string | null = value; ; ) {
      v = await overlays.prompt(title, v, hint);
      if (v === null) return null;
      const name = v.trim();
      const problem = nameProblem(store.defs, kind, name, exceptId);
      if (!problem) return name;
      say(problem, 'warn');
    }
  }

  /** A name not taken yet, for put: `name_2`, `name_3`… */
  function freeName(base: string): string {
    const sep = kind === 'vars' ? '_' : ' ';
    for (let i = 2; ; i++) if (!nameProblem(defs, kind, `${base}${sep}${i}`)) return `${base}${sep}${i}`;
  }

  async function addEntry() {
    const name = await askName(`New ${noun}`);
    if (!name) return;
    const at = list.hovered ? defs[kind].indexOf(list.hovered.def) + 1 : defs[kind].length;
    let id = '';
    const ok = await apply(`add ${noun} ${name}`, (d) => {
      const r = addDef(d, kind, name, at);
      id = r.def.id;
      return r.defs;
    });
    if (!ok) return;
    list.filter = '';
    list.reset(id);
    focus = 'expr';
  }

  async function renameEntry() {
    const def = current;
    if (!def) return;
    const name = await askName(`Rename ${noun}`, def.name, def.id);
    if (!name || name === def.name) return;
    await apply(`rename ${def.name} → ${name}`, (d) => renameDef(d, kind, def.id, name));
  }

  async function deleteEntries() {
    const targets = list.targets().map((r) => r.def);
    if (!targets.length) return;
    const lines = targets.map((d) => {
      const users = kind === 'vars' ? referencing(defs, refsVar(d.name)).map((u) => u.def.name) : [];
      return users.length ? { text: `· ${d.name}`, sub: `used by ${users.join(', ')}`, warn: true } : `· ${d.name}`;
    });
    if (!(await overlays.confirm(`Delete ${plural(targets.length, noun)}`, lines))) return;
    list.clearSelection();
    await apply(`delete ${plural(targets.length, noun)}`, (d) => deleteDefs(d, kind, targets.map((t) => t.id)));
  }

  async function putEntries() {
    if (!clip || clip.what !== 'defs') return say(clip ? 'put rows in the expression column' : 'nothing yanked', 'warn');
    if (clip.kind !== kind) return say(`can't put ${clip.kind} into the ${kind === 'vars' ? 'varset' : 'viewset'}`, 'warn');
    const after = list.hovered?.def.id ?? null;
    if (clip.mode === 'cut') {
      const ids = clip.ids;
      clip = null;
      return void apply(`move ${plural(ids.length, noun)}`, (d) => moveDefs(d, kind, ids, after));
    }
    const src = defs[kind].find((d) => d.id === (clip as { ids: string[] }).ids[0]);
    if (!src) return say(`the yanked ${noun} is gone`, 'warn');
    const name = await askName(`Put a copy of ${src.name} as`, freeName(src.name));
    if (!name) return;
    const at = after ? defs[kind].findIndex((d) => d.id === after) + 1 : 0;
    let id = '';
    if (await apply(`copy ${src.name} → ${name}`, (d) => ((r) => ((id = r.def.id), r.defs))(addDef(d, kind, name, at, src.expr)))) list.reset(id);
  }

  /** Tags (and, in the viewset, vars) to choose an operand from. */
  function pickOperand(title: string, value: string, onPick: (ref: Ref) => void) {
    type Cand = { key: string; label: string; ref: Ref; kind: string; sub: string };
    const cands: Cand[] = [];
    if (kind === 'views') {
      for (const v of defs.vars) cands.push({ key: 'v' + v.id, label: `{${v.name}}`, ref: { var: v.name }, kind: 'var', sub: plural(ev.var(v).count(), 'item') });
    }
    for (const t of model.allTags()) {
      cands.push({ key: 't' + t.id, label: formatPath(t.path), ref: { tag: t.key }, kind: 'tag', sub: plural(ev.index.subtree(t).count(), 'item') });
    }
    overlays.picker({
      title,
      value,
      placeholder: kind === 'views' ? 'tag/path or {var}' : 'tag/path',
      hint: '↵ choose',
      search: (q): PickerRow<PickAction>[] =>
        fuzzyFilter(q, cands, (c) => c.label).map(({ value: c, match }) => ({
          key: c.key,
          label: c.label,
          positions: match.positions,
          sub: c.sub,
          kind: c.kind,
          value: { go: () => onPick(c.ref) },
        })),
    });
  }

  function addTerm() {
    const def = current;
    if (!def) return say(`add a ${noun} first (h, then a)`, 'warn');
    const at = expr.hovered ? expr.hovered.index + 1 : def.expr.length;
    pickOperand(`Add to ${def.name}`, '', async (ref) => {
      const dup = indexOfRef(def.expr, ref);
      if (dup >= 0) {
        expr.reset(String(dup));
        return say(`${refLabel(ref)} is already in ${def.name}`, 'warn');
      }
      if (!isVarRef(ref)) {
        const rel = related(def.expr, ref.tag);
        if (rel) {
          const other = refLabel(def.expr[rel.index].ref);
          if (await overlays.confirm(`${rel.relation === 'parent' ? 'Parent' : 'Child'} tag present`, [`Replace ${other} with ${refLabel(ref)}?`, 'n adds it as a new row'])) {
            if (await apply(`replace ${other} → ${refLabel(ref)}`, (d) => setExpr(d, kind, def.id, (e) => replaceTerm(e, rel.index, ref)))) expr.reset(String(rel.index));
            return;
          }
        }
      }
      if (await apply(`add ${refLabel(ref)} to ${def.name}`, (d) => setExpr(d, kind, def.id, (e) => insertTerms(e, [term(ref)], at)))) {
        expr.filter = '';
        expr.reset(String(at));
      }
    });
  }

  function replaceRow() {
    const def = current;
    const row = expr.hovered;
    if (!def || !row) return;
    pickOperand(`Replace ${row.name}`, row.name.replace(/^\{|\}$|\/$/g, ''), (ref) => {
      if (indexOfRef(def.expr, ref, row.index) >= 0) return say(`${refLabel(ref)} is already in ${def.name}`, 'warn');
      void apply(`replace ${row.name} → ${refLabel(ref)}`, (d) => setExpr(d, kind, def.id, (e) => replaceTerm(e, row.index, ref)));
    });
  }

  /** Expression edits on the selected rows, or the hovered one. */
  function editRows(label: string, fn: (e: Term[], idxs: number[]) => Term[]) {
    const def = current;
    const idxs = expr.targets().map((r) => r.index);
    if (!def || !idxs.length) return;
    expr.clearSelection();
    return apply(`${label} in ${def.name}`, (d) => setExpr(d, kind, def.id, (e) => fn(e, idxs)));
  }

  function clipRows(mode: 'yank' | 'cut') {
    const def = current;
    const rows = expr.targets();
    if (!def || !rows.length) return;
    clip = { mode, what: 'terms', kind, defId: def.id, idxs: rows.map((r) => r.index), terms: rows.map((r) => r.term) };
    expr.clearSelection();
    say(`${mode === 'yank' ? 'yanked' : 'cut'} ${plural(rows.length, 'row')} · p to put`);
  }

  async function putRows() {
    const def = current;
    if (!clip || clip.what !== 'terms') return say(clip ? 'put entries in the list column' : 'nothing yanked', 'warn');
    if (!def) return;
    if (kind === 'vars' && clip.terms.some((t) => isVarRef(t.ref))) return say('vars cannot contain {vars}', 'warn');
    const c = clip;
    const at = expr.hovered ? expr.hovered.index + 1 : def.expr.length;
    if (c.mode === 'yank') {
      const fresh = newTerms(def.expr, c.terms);
      if (!fresh.length) return say(`already in ${def.name}`, 'warn');
      const skipped = c.terms.length - fresh.length;
      if (await apply(`put ${plural(fresh.length, 'row')} in ${def.name}`, (d) => setExpr(d, kind, def.id, (e) => insertTerms(e, fresh, at)))) {
        expr.reset(String(at));
        if (skipped) say(`put ${plural(fresh.length, 'row')} · ${skipped} already there`, 'warn');
      }
      return;
    }
    clip = null;
    const n = c.terms.length;
    if (c.kind === kind && c.defId === def.id) {
      await apply(`move ${plural(n, 'row')}`, (d) => setExpr(d, kind, def.id, (e) => moveTerms(e, c.idxs, at - 1)));
      return;
    }
    // Rows whose operand the target already has merge into it.
    const ok = await apply(`move ${plural(n, 'row')} to ${def.name}`, (d) =>
      setExpr(setExpr(d, c.kind, c.defId, (e) => deleteTerms(e, c.idxs)), kind, def.id, (e) => insertTerms(e, newTerms(e, c.terms), at)),
    );
    if (ok) expr.reset(String(at));
  }

  // ------------------------------------------------------------------ keys

  function switchKind(k: DefKind) {
    nav.commitVisual();
    kind = k;
    focus = 'list';
  }

  function exec(action: Action) {
    if (!MOTIONS.has(action) && nav.visual && !['visual', 'visualUnset', 'escape', 'yank', 'cut', 'delete', 'toggleNot', 'cycleOp'].includes(action)) {
      nav.commitVisual();
    }
    if (nav.exec(action, { overlays, pageRows: pageRows(), onMiss: (q) => say(`no match for "${q}"`, 'warn') })) return;
    switch (action) {
      case 'enter':
        if (!current) return say(`no ${noun} here · a to add one`, 'warn');
        focus = 'expr';
        return;
      case 'parent':
        focus = 'list';
        return;
      case 'create':
        return void (focus === 'list' ? addEntry() : addTerm());
      case 'rename':
        return void (focus === 'list' ? renameEntry() : replaceRow());
      case 'delete':
        return void (focus === 'list' ? deleteEntries() : editRows('delete rows', deleteTerms));
      case 'toggleNot':
        return void editRows('toggle !', toggleNot);
      case 'cycleOp':
        return void editRows('change operator', cycleOp);
      case 'yank':
        if (focus === 'expr') return clipRows('yank');
        if (!list.hovered) return;
        clip = { mode: 'yank', what: 'defs', kind, ids: [list.hovered.def.id] };
        list.clearSelection();
        return say(`yanked ${list.hovered.name} · p puts a copy`);
      case 'cut': {
        if (focus === 'expr') return clipRows('cut');
        const rows = list.targets();
        if (!rows.length) return;
        clip = { mode: 'cut', what: 'defs', kind, ids: rows.map((r) => r.def.id) };
        list.clearSelection();
        return say(`cut ${plural(rows.length, noun)} · p moves below the cursor`);
      }
      case 'paste':
        return void (focus === 'list' ? putEntries() : putRows());
      case 'cancelYank':
        clip = null;
        return;
      case 'undo':
      case 'redo':
        return void undo(action === 'redo');
      case 'tabPrev':
        return switchKind('views');
      case 'tabNext':
        return switchKind('vars');
      case 'help':
        return overlays.help(['editorList', 'editorExpr']);
      case 'escape':
        if (nav.escape()) return;
        if (clip) clip = null;
        return;
      case 'quit':
        return onQuit();
    }
  }

  function onkeydown(e: KeyboardEvent) {
    if (overlays.open) return;
    keys.handle(e, resolvers[screen], exec, busy);
  }

  const clipKeys = $derived.by(() => {
    const c = clip;
    if (!c || c.kind !== kind) return new Set<string>();
    if (c.what === 'defs') return new Set(c.ids.map((id) => `d${id}`));
    return c.defId === current?.id ? new Set(c.idxs.map((i) => `t${i}`)) : new Set<string>();
  });
  function markOf<R extends { key: string; name: string }>(n: ListNav<R>, prefix: string) {
    return (r: R, i: number) => {
      const sel = n.isSelected(r, i);
      const c = clipKeys.has(prefix + r.key) ? clip!.mode : undefined;
      if (sel && c) return `sel ${c}` as const;
      return sel ? ('sel' as const) : c;
    };
  }
</script>

<svelte:window {onkeydown} />

<div class="editor">
  <header>
    <button type="button" tabindex="-1" class="tab" class:active={kind === 'views'} onclick={() => switchKind('views')}>viewset</button>
    <button type="button" tabindex="-1" class="tab" class:active={kind === 'vars'} onclick={() => switchKind('vars')}>varset</button>
    <span class="spacer"></span>
    <span class="dim hint">[ ] switch · l/h columns · ? keys · q back</span>
  </header>

  <main>
    <section class="col">
      <div class="title" class:focused={focus === 'list'}>{kind}</div>
      <div class="body">
        <RowList
          rows={listRows[kind]}
          cursor={list.cursor}
          active={focus === 'list'}
          mark={markOf(list, 'd')}
          empty={list.filter ? `no match for "${list.filter}"` : `no ${kind} · a to add`}
        >
          {#snippet row(r)}
            <span class="name"><Highlight text={r.name} positions={r.positions} found={findPositions(list.find?.query ?? '', r.name)} /></span>
            <span class="count">{r.count}</span>
          {/snippet}
        </RowList>
      </div>
    </section>
    <section class="col">
      <div class="title" class:focused={focus === 'expr'}>
        {kind === 'vars' ? 'tagsexpr' : 'varsexpr'}{#if current}<span class="dim">{` · ${current.name}`}</span>{/if}
      </div>
      <div class="body">
        <RowList
          rows={exprRows[kind]}
          cursor={expr.cursor}
          active={focus === 'expr'}
          mark={markOf(expr, 't')}
          empty={current ? (expr.filter ? `no match for "${expr.filter}"` : 'empty · l, then a to add a tag') : ''}
        >
          {#snippet row(r)}
            <span class="op">{r.index === 0 ? ' ' : r.term.op}</span>
            <span class="not">{r.term.not ? '!' : ' '}</span>
            <span class="name operand" class:var={isVarRef(r.term.ref)} class:missing={r.count === null}>
              <Highlight text={r.name} positions={r.positions} found={findPositions(expr.find?.query ?? '', r.name)} />
            </span>
            <span class="count">{r.count === null ? 'missing' : r.count}</span>
          {/snippet}
        </RowList>
      </div>
    </section>
  </main>

  <StatusBar
    mode={nav.mode}
    message={flash.message}
    info={current ? { text: `${current.name}: ${plural(total, 'item')}`, kind: 'dim' } : undefined}
    badges={[
      busy && { text: 'working…', kind: 'warn' },
      clip && { text: `${clip.mode === 'yank' ? 'y' : 'x'} ${clip.what === 'defs' ? clip.ids.length : clip.terms.length}`, kind: clip.mode },
      nav.selectedCount > 0 && { text: `sel ${nav.selectedCount}`, kind: 'sel' },
      nav.findStat && { text: `/${nav.findStat.query} [${nav.findStat.n || '-'}/${nav.findStat.m}]`, kind: 'find' },
      !!nav.filter && { text: `f: ${nav.filter}`, kind: 'filter' },
    ]}
    pos="{nav.entries.length ? nav.cursor + 1 : 0}/{nav.entries.length}"
  />

  {#if keys.pending}
    <WhichKey pending={keys.pending} />
  {/if}
  <OverlayView {overlays} {bindings} />
</div>

<style>
  .editor {
    display: grid;
    grid-template-rows: var(--row) 1fr var(--row);
    height: 100vh;
    padding: 2px 0 0;
  }
  header {
    display: flex;
    gap: 2px;
    padding: 0 8px;
    white-space: nowrap;
    overflow: hidden;
  }
  .tab {
    font: inherit;
    border: none;
    background: none;
    cursor: pointer;
    padding: 0 8px;
    color: var(--tab);
  }
  .tab.active {
    background: var(--tab-active-bg);
    color: var(--tab-active-fg);
  }
  .spacer {
    flex: 1;
  }
  .hint {
    font-size: var(--font-size-sm);
  }
  main {
    display: grid;
    grid-template-columns: 1fr 2fr;
    min-height: 0;
    border-top: 1px solid var(--divider);
    border-bottom: 1px solid var(--divider);
  }
  .col {
    display: grid;
    grid-template-rows: var(--row) 1fr;
    min-width: 0;
    min-height: 0;
  }
  .col + .col {
    border-left: 1px solid var(--divider);
  }
  .title {
    padding: 0 9px;
    color: var(--dim);
    border-bottom: 1px solid var(--divider);
  }
  .title.focused {
    color: var(--accent);
  }
  .body {
    min-height: 0;
    padding: 2px 0;
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .operand {
    color: var(--tag);
  }
  .operand.var {
    color: var(--var-ref);
  }
  .operand.missing {
    color: var(--error);
  }
  .op {
    flex: none;
    width: 1ch;
    color: var(--expr-op);
    font-weight: bold;
  }
  .not {
    flex: none;
    width: 1ch;
    color: var(--expr-not);
    font-weight: bold;
  }
  .count {
    flex: none;
    color: var(--dim);
    font-size: var(--font-size-sm);
  }
</style>
