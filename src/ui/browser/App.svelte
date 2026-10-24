<script lang="ts">
  import { onMount } from 'svelte';
  import {
    DEFAULT_SETTINGS,
    bindingsOf,
    createStore,
    hostOf,
    loadFavicons,
    loadSettings,
    onExternalChange,
    openUrl,
    saveSettings,
    type Favicons,
    type Settings,
    type SortKey,
  } from '../../adapter/browser';
  import { fuzzyFilter } from '../../core/fuzzy';
  import { ACTIONS, KeyResolver, eventToKey, type Action, type Pending } from '../../core/keymap';
  import { Model, type TagNode } from '../../core/model';
  import { OpError, plural, type OpResult } from '../../core/store';
  import { formatPath, formatTagList, isAncestor, parsePath, pathKey, samePath } from '../../core/tags';
  import type { TagPath } from '../../core/types';
  import { UndoStack } from '../../core/undo';
  import Column from '../components/Column.svelte';
  import Confirm from '../components/Confirm.svelte';
  import ItemForm from '../components/ItemForm.svelte';
  import Picker from '../components/Picker.svelte';
  import Preview from '../components/Preview.svelte';
  import Prompt from '../components/Prompt.svelte';
  import {
    entriesOf,
    findMatch,
    itemKey,
    keyOf,
    parseKey,
    refOf,
    tagKey,
    type Entry,
    type PickerRow,
    type Ref,
  } from './view';

  // ------------------------------------------------------------------ state

  interface Tab {
    path: TagPath;
    cursor: number;
    hover: string | null;
    remember: Record<string, string>;
    history: TagPath[];
    future: TagPath[];
    recursive: boolean;
    filter: string;
    selected: Record<string, true>;
    visual: { anchor: number; unset: boolean } | null;
    find: { query: string; backward: boolean } | null;
  }

  type Overlay =
    | { kind: 'prompt'; title: string; value?: string; hint?: string; onInput?: (v: string) => void; onSubmit: (v: string) => void; onCancel: () => void }
    | { kind: 'confirm'; title: string; lines: string[]; onAnswer: (yes: boolean) => void }
    | { kind: 'picker'; title: string; placeholder?: string; search: (q: string) => PickerRow<() => void>[] }
    | { kind: 'form'; heading: string; url: string; title: string; tags: string; focus: 'tags' | 'title' | 'url'; editing: string | null };

  const store = createStore();
  const history = new UndoStack();

  const newTab = (path: TagPath = []): Tab => ({
    path,
    cursor: 0,
    hover: null,
    remember: {},
    history: [],
    future: [],
    recursive: false,
    filter: '',
    selected: {},
    visual: null,
    find: null,
  });

  let model = $state.raw<Model>(new Model([]));
  let settings = $state.raw<Settings>(DEFAULT_SETTINGS);
  let favicons = $state.raw<Favicons>({});
  let resolver = new KeyResolver(bindingsOf(DEFAULT_SETTINGS));
  let tabs = $state<Tab[]>([newTab()]);
  let ti = $state(0);
  let clip = $state<{ mode: 'yank' | 'cut'; refs: Ref[] } | null>(null);
  let overlay = $state.raw<Overlay | null>(null);
  let pending = $state<Pending | null>(null);
  let message = $state<{ text: string; kind: 'info' | 'warn' | 'error' } | null>(null);
  let busy = $state(false);
  let loaded = $state(false);
  let dirty = false;
  let messageTimer: ReturnType<typeof setTimeout> | undefined;

  const tab = $derived(tabs[ti]);
  const cur: TagNode = $derived(model.tag(tab.path) ?? model.root);
  const viewOpts = $derived({
    sort: settings.sort,
    reverse: settings.reverse,
    tagsFirst: settings.tagsFirst,
    recursive: tab.recursive,
    filter: tab.filter,
  });
  const plainOpts = $derived({ ...viewOpts, recursive: false, filter: '' });
  const entries = $derived(entriesOf(model, cur, viewOpts));
  const cursor = $derived.by(() => {
    const i = tab.hover ? entries.findIndex((e) => e.key === tab.hover) : -1;
    return i >= 0 ? i : Math.max(0, Math.min(tab.cursor, entries.length - 1));
  });
  const hovered: Entry | undefined = $derived(entries[cursor]);
  const parentEntries = $derived(cur.parent ? entriesOf(model, cur.parent, plainOpts) : []);
  const parentCursor = $derived(parentEntries.findIndex((e) => e.kind === 'tag' && e.tag === cur));
  const previewChildren = $derived(hovered?.kind === 'tag' ? entriesOf(model, hovered.tag, plainOpts) : []);
  const selectedCount = $derived(Object.keys(tab.selected).length);
  const clipKeys = $derived(new Set(clip?.refs.map(keyOf) ?? []));
  const mode = $derived(tab.visual ? (tab.visual.unset ? 'UNS' : 'VIS') : selectedCount ? 'SEL' : 'NOR');

  // ------------------------------------------------------------------ loading

  async function refresh() {
    if (busy) {
      dirty = true;
      return;
    }
    const [m, s, f] = await Promise.all([store.load(), loadSettings(), loadFavicons()]);
    applyModel(m);
    if (JSON.stringify(s.bindings) !== JSON.stringify(settings.bindings)) resolver = new KeyResolver(bindingsOf(s));
    settings = s;
    favicons = f;
    loaded = true;
  }

  function applyModel(m: Model) {
    model = m;
    for (const t of tabs) {
      while (t.path.length && !m.tag(t.path)) t.path = t.path.slice(0, -1);
    }
  }

  onMount(() => {
    resolver = new KeyResolver(bindingsOf(settings));
    void refresh();
    const off = onExternalChange(() => void refresh());
    const onLocal = (_: unknown, area: string) => area === 'local' && loadFavicons().then((f) => (favicons = f));
    browser.storage.onChanged.addListener(onLocal);
    return () => {
      off();
      browser.storage.onChanged.removeListener(onLocal);
    };
  });

  // ------------------------------------------------------------------ helpers

  function say(text: string, kind: 'info' | 'warn' | 'error' = 'info') {
    message = { text, kind };
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => (message = null), kind === 'info' ? 3000 : 6000);
  }

  /** Run a mutation: serialize, report errors/warnings, record undo, reload. */
  async function run(fn: () => Promise<OpResult | OpResult[] | string | void>) {
    if (busy) return;
    busy = true;
    try {
      const res = await fn();
      if (typeof res === 'string') say(res);
      else if (res) {
        const list = Array.isArray(res) ? res : [res];
        const entries = list.map((r) => r.entry).filter((e) => !!e);
        if (entries.length === 1) history.push(entries[0]);
        else if (entries.length > 1) {
          history.push({
            label: entries.map((e) => e.label).join(', '),
            undo: async () => {
              for (const e of [...entries].reverse()) await e.undo();
            },
            redo: async () => {
              for (const e of entries) await e.redo();
            },
          });
        }
        const warnings = list.flatMap((r) => r.warnings);
        if (warnings.length) say(warnings.join(' · '), 'warn');
        else if (entries.length) say(entries.map((e) => e.label).join(', '));
      }
    } catch (e) {
      say(e instanceof OpError ? e.message : `error: ${(e as Error).message}`, 'error');
      console.error(e);
    } finally {
      busy = false;
      dirty = false;
      await refresh();
    }
  }

  function setCursor(i: number) {
    const n = entries.length;
    const c = n ? Math.max(0, Math.min(i, n - 1)) : 0;
    tab.cursor = c;
    tab.hover = entries[c]?.key ?? null;
  }

  function go(path: TagPath, opts: { hover?: string; record?: boolean } = {}) {
    if (samePath(path, tab.path) && !opts.hover) return;
    if (hovered) tab.remember[pathKey(tab.path)] = hovered.key;
    if (opts.record !== false) {
      tab.history.push(tab.path);
      tab.future = [];
    }
    commitVisual();
    tab.path = path;
    tab.filter = '';
    tab.hover = opts.hover ?? tab.remember[pathKey(path)] ?? null;
    tab.cursor = 0;
  }

  const pageRows = () => Math.max(1, Math.floor((window.innerHeight - 60) / 20));

  function inVisualRange(i: number): boolean {
    const v = tab.visual;
    if (!v) return false;
    return i >= Math.min(v.anchor, cursor) && i <= Math.max(v.anchor, cursor);
  }

  function isSelected(e: Entry, i: number): boolean {
    const v = tab.visual;
    if (v && inVisualRange(i)) return !v.unset;
    return !!tab.selected[e.key];
  }

  function mark(e: Entry, i: number) {
    const sel = isSelected(e, i);
    const c = clipKeys.has(e.key) ? clip!.mode : undefined;
    if (sel && c) return `sel ${c}` as const;
    if (sel) return 'sel' as const;
    return c;
  }

  function commitVisual() {
    const v = tab.visual;
    if (!v) return;
    entries.forEach((e, i) => {
      if (!inVisualRange(i)) return;
      if (v.unset) delete tab.selected[e.key];
      else tab.selected[e.key] = true;
    });
    tab.visual = null;
  }

  /** Selected refs (committing any visual range), or the hovered entry. */
  function targets(): Ref[] {
    commitVisual();
    const keys = Object.keys(tab.selected);
    if (keys.length) return keys.map(parseKey);
    return hovered ? [refOf(hovered)] : [];
  }

  function clearSelection() {
    tab.selected = {};
    tab.visual = null;
  }

  const itemRefs = (refs: Ref[]) => refs.filter((r): r is Extract<Ref, { kind: 'item' }> => r.kind === 'item');
  /** Tag refs, dropping any whose ancestor is also targeted. */
  const tagRefs = (refs: Ref[]) => {
    const tags = refs.filter((r): r is Extract<Ref, { kind: 'tag' }> => r.kind === 'tag');
    return tags.filter((t) => !tags.some((o) => isAncestor(o.path, t.path)));
  };

  const titleOf = (url: string) => model.item(url)?.title || url;

  function confirm(title: string, lines: string[]): Promise<boolean> {
    return new Promise((resolve) => {
      overlay = {
        kind: 'confirm',
        title,
        lines,
        onAnswer: (yes) => {
          overlay = null;
          resolve(yes);
        },
      };
    });
  }

  function prompt(title: string, value = '', hint = '', onInput?: (v: string) => void): Promise<string | null> {
    return new Promise((resolve) => {
      overlay = {
        kind: 'prompt',
        title,
        value,
        hint,
        onInput,
        onSubmit: (v) => {
          overlay = null;
          resolve(v);
        },
        onCancel: () => {
          overlay = null;
          resolve(null);
        },
      };
    });
  }

  async function copyText(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      say(`copied ${what}`);
    } catch (e) {
      say(`clipboard: ${(e as Error).message}`, 'error');
    }
  }

  async function openItems(urls: string[], where: 'current' | 'new' | 'background') {
    if (urls.length > 10 && !(await confirm('Open tabs', [`Open ${urls.length} tabs?`]))) return;
    for (const u of urls) await openUrl(u, urls.length > 1 ? 'background' : where);
  }

  // ------------------------------------------------------------------ actions

  async function paste(dest: TagPath) {
    if (!clip) return say('nothing yanked', 'warn');
    const { mode, refs } = clip;
    const items = itemRefs(refs);
    const tags = tagRefs(refs);
    await run(async () => {
      const out: OpResult[] = [];
      if (mode === 'yank') {
        if (items.length) out.push(await store.addTag([...new Set(items.map((r) => r.url))], dest));
        for (const t of tags) out.push(await store.copyTag(t.path, dest));
      } else {
        if (items.length) out.push(await store.moveCopies(items, dest));
        for (const t of tags) out.push(await store.moveTag(t.path, dest));
        clip = null;
      }
      return out;
    });
  }

  async function remove(all: boolean) {
    const refs = targets();
    if (!refs.length) return;
    const items = itemRefs(refs);
    const tags = tagRefs(refs);
    const lines: string[] = [];
    const urls = [...new Set(items.map((r) => r.url))];
    if (all) {
      for (const u of urls) lines.push(`· ${titleOf(u)}  (${plural(model.item(u)?.copies.length ?? 0, 'copy', 'copies')})`);
    } else {
      for (const r of items) {
        const last = (model.item(r.url)?.copies.length ?? 0) <= 1;
        lines.push(`· ${titleOf(r.url)}  from ${formatPath(r.path)}${last ? '  — last copy, bookmark deleted' : ''}`);
      }
    }
    for (const t of tags) {
      const d = store.describeTagDeletion(t.path);
      lines.push(
        `▸ ${formatPath(t.path)}  ${plural(d.tags - 1, 'subtag')}, ${plural(d.items, 'item')}` +
          (d.orphaned ? `, ${d.orphaned} become untagged` : ''),
      );
    }
    const title = all ? `Delete ${plural(urls.length + tags.length, 'entry', 'entries')} everywhere` : `Delete ${plural(refs.length, 'entry', 'entries')}`;
    if (!(await confirm(title, lines))) return;
    clearSelection();
    await run(async () => {
      const out: OpResult[] = [];
      if (items.length) out.push(all ? await store.deleteItems(urls) : await store.removeCopies(items));
      for (const t of [...tags].sort((a, b) => b.path.length - a.path.length)) out.push(await store.deleteTag(t.path));
      return out;
    });
  }

  async function rename() {
    const e = hovered;
    if (!e) return;
    if (e.kind === 'tag' && e.tag.fixed) return say(`${formatPath(e.tag.path)} is a Firefox root folder`, 'warn');
    const v = await prompt('Rename', e.kind === 'tag' ? e.tag.name : e.copy.title);
    if (v === null || !v.trim()) return;
    const name = v.trim();
    await run(async () => {
      if (e.kind === 'tag') {
        const r = await store.renameTag(e.tag.path, name.replace(/\/+$/, ''));
        tab.hover = tagKey([...e.tag.path.slice(0, -1), name.replace(/\/+$/, '')]);
        return r;
      }
      return store.renameItem(e.copy.url, name);
    });
  }

  async function create() {
    const v = await prompt('Create', '', 'end with / to create a tag · paste a url to bookmark it');
    if (v === null || !v.trim()) return;
    const s = v.trim();
    if (s.endsWith('/')) {
      const path = [...cur.path, ...parsePath(s)];
      await run(async () => {
        const r = await store.createTag(path);
        tab.hover = tagKey(path.slice(0, cur.path.length + 1));
        return r;
      });
      return;
    }
    const isUrl = /^[a-z][\w+.-]*:\/\//i.test(s) || /^(about|mailto|javascript|data):/i.test(s);
    overlay = {
      kind: 'form',
      heading: 'new bookmark',
      url: isUrl ? s : '',
      title: isUrl ? '' : s,
      tags: cur.path.length ? formatPath(cur.path) + ', ' : '',
      focus: isUrl ? 'title' : 'url',
      editing: null,
    };
  }

  function editTags() {
    const e = hovered;
    if (!e || e.kind !== 'item') return say('e edits a bookmark; use r to rename a tag', 'warn');
    const item = e.item;
    const tags = formatTagList(item.tags.filter((t) => t.length));
    overlay = {
      kind: 'form',
      heading: 'edit bookmark',
      url: item.url,
      title: item.title,
      tags: tags ? tags + ', ' : '',
      focus: 'tags',
      editing: item.url,
    };
  }

  async function saveForm(editing: string | null, url: string, title: string, tags: TagPath[]) {
    let err: unknown;
    await run(async () => {
      try {
        const r = await store.saveItem(editing, url, title, tags);
        const first = tags[0] ?? [];
        if (samePath(first, cur.path) || tags.some((t) => samePath(t, cur.path))) tab.hover = itemKey(url, cur.path);
        overlay = null;
        return r;
      } catch (e) {
        err = e;
        throw e;
      }
    });
    if (err) throw err;
  }

  function find(backward: boolean) {
    const start = cursor;
    const startHover = tab.hover;
    void prompt(backward ? 'Find previous' : 'Find next', '', 'smart-case substring · n/N to repeat', (q) => {
      tab.find = { query: q, backward };
      jumpToMatch(q, backward, start, true);
    }).then((v) => {
      if (v === null) {
        tab.cursor = start;
        tab.hover = startHover;
        tab.find = null;
      }
    });
  }

  function jumpToMatch(q: string, backward: boolean, from: number, inclusive: boolean) {
    const n = entries.length;
    if (!q || !n) return;
    for (let k = inclusive ? 0 : 1; k <= n; k++) {
      const i = (((backward ? from - k : from + k) % n) + n) % n;
      if (findMatch(q, entries[i].name)) return setCursor(i);
    }
    say(`no match for "${q}"`, 'warn');
  }

  function filter() {
    const before = tab.filter;
    void prompt('Filter', tab.filter, 'fuzzy · Enter keeps the filter · Esc restores', (q) => {
      tab.filter = q;
      tab.hover = null;
      tab.cursor = 0;
    }).then((v) => {
      if (v === null) tab.filter = before;
    });
  }

  function jumpPicker(itemsOnly: boolean) {
    type Cand = { key: string; text: string; label: string; sub?: string; kind: 'tag' | 'item'; go: () => void };
    const cands: Cand[] = [];
    if (!itemsOnly) {
      for (const t of model.allTags()) {
        const label = formatPath(t.path);
        cands.push({ key: 't' + t.id, text: label, label, kind: 'tag', go: () => go(t.path) });
      }
    }
    for (const i of model.items.values()) {
      const primary = i.tags[0] ?? [];
      const label = itemsOnly ? i.title || i.url : `${primary.length ? formatPath(primary) : ''}${i.title}`;
      cands.push({
        key: 'i' + i.url,
        text: itemsOnly ? `${label} ${i.url}` : label,
        label,
        sub: itemsOnly ? i.url : hostOf(i.url),
        kind: 'item',
        go: () => go(primary, { hover: itemKey(i.url, primary) }),
      });
    }
    overlay = {
      kind: 'picker',
      title: itemsOnly ? 'search' : 'jump',
      placeholder: itemsOnly ? 'title or url' : 'tag/path or item',
      search: (q) =>
        fuzzyFilter(q, cands, (c) => c.text).map(({ value: c, match }) => ({
          key: c.key,
          label: c.label,
          positions: match.positions.filter((p) => p < c.label.length),
          sub: c.sub,
          kind: c.kind,
          value: c.go,
        })),
    };
  }

  function help() {
    const bindings = bindingsOf(settings);
    const actions = Object.keys(ACTIONS) as Action[];
    overlay = {
      kind: 'picker',
      title: 'help · Enter runs',
      placeholder: 'filter keys or descriptions',
      search: (q) =>
        fuzzyFilter(q, actions, (a) => `${bindings[a].join(' ')}  ${ACTIONS[a]}`).map(({ value: a }) => ({
          key: a,
          label: bindings[a].join('  ') || '(unbound)',
          sub: ACTIONS[a],
          value: () => void exec(a),
        })),
    };
  }

  async function setSort(sort: SortKey, reverse: boolean) {
    settings = await saveSettings({ sort, reverse });
    say(`sort: ${sort}${reverse ? ' (reverse)' : ''}`);
  }

  function switchTab(i: number) {
    if (i < 0 || i >= tabs.length) return;
    commitVisual();
    ti = i;
  }

  async function exec(action: Action) {
    const isMotion = ['up', 'down', 'top', 'bottom', 'halfUp', 'halfDown', 'pageUp', 'pageDown'].includes(action);
    if (!isMotion && tab.visual && !['visual', 'visualUnset', 'escape', 'yank', 'cut', 'delete', 'deleteAll', 'openNew', 'open'].includes(action)) {
      commitVisual();
    }
    const e = hovered;
    switch (action) {
      case 'up':
        return setCursor(cursor - 1);
      case 'down':
        return setCursor(cursor + 1);
      case 'top':
        return setCursor(0);
      case 'bottom':
        return setCursor(entries.length - 1);
      case 'halfUp':
        return setCursor(cursor - Math.ceil(pageRows() / 2));
      case 'halfDown':
        return setCursor(cursor + Math.ceil(pageRows() / 2));
      case 'pageUp':
        return setCursor(cursor - pageRows());
      case 'pageDown':
        return setCursor(cursor + pageRows());
      case 'parent':
        if (tab.filter) return void (tab.filter = '');
        if (cur.parent) go(cur.parent.path, { hover: tagKey(cur.path) });
        return;
      case 'enter':
        if (e?.kind === 'tag') return go(e.tag.path);
        if (e?.kind === 'item') return openItems([e.copy.url], 'current');
        return;
      case 'back': {
        const p = tab.history.pop();
        if (!p) return;
        tab.future.push(tab.path);
        return go(p, { record: false });
      }
      case 'forward': {
        const p = tab.future.pop();
        if (!p) return;
        tab.history.push(tab.path);
        return go(p, { record: false });
      }
      case 'goRoot':
        return go([]);
      case 'goToolbar':
        return go(['toolbar']);
      case 'goMenu':
        return go(['menu']);

      case 'open':
      case 'openNew': {
        const where = action === 'open' ? 'current' : 'new';
        const sel = itemRefs(targets());
        if (Object.keys(tab.selected).length) {
          clearSelection();
          return openItems([...new Set(sel.map((r) => r.url))], 'background');
        }
        if (e?.kind === 'item') return openItems([e.copy.url], where);
        if (e?.kind === 'tag') {
          if (action === 'open') return go(e.tag.path);
          const urls = e.tag.copies.map((c) => c.url);
          if (!urls.length) return say('no items directly in this tag', 'warn');
          return openItems(urls, 'background');
        }
        return;
      }

      case 'toggleSelect':
        if (!e) return;
        if (tab.selected[e.key]) delete tab.selected[e.key];
        else tab.selected[e.key] = true;
        return setCursor(cursor + 1);
      case 'visual':
      case 'visualUnset':
        if (tab.visual) return commitVisual();
        tab.visual = { anchor: cursor, unset: action === 'visualUnset' };
        return;
      case 'selectAll':
        for (const x of entries) tab.selected[x.key] = true;
        return;
      case 'invertSelection':
        for (const x of entries) {
          if (tab.selected[x.key]) delete tab.selected[x.key];
          else tab.selected[x.key] = true;
        }
        return;

      case 'yank':
      case 'cut': {
        const refs = targets();
        if (!refs.length) return;
        if (action === 'cut' && refs.some((r) => r.kind === 'tag' && model.tag(r.path)?.fixed)) {
          return say('Firefox root folders cannot be moved', 'warn');
        }
        clip = { mode: action, refs };
        clearSelection();
        return say(`${action === 'yank' ? 'yanked' : 'cut'} ${plural(refs.length, 'entry', 'entries')} · p to paste`);
      }
      case 'paste':
        return paste(cur.path);
      case 'pasteInto':
        return paste(e?.kind === 'tag' ? e.tag.path : cur.path);
      case 'cancelYank':
        clip = null;
        return;

      case 'delete':
        return remove(false);
      case 'deleteAll':
        return remove(true);
      case 'create':
        return create();
      case 'rename':
        return rename();
      case 'editTags':
        return editTags();

      case 'find':
        return find(false);
      case 'findPrev':
        return find(true);
      case 'findNext':
      case 'findPrevMatch':
        if (!tab.find?.query) return;
        return jumpToMatch(tab.find.query, tab.find.backward !== (action === 'findPrevMatch'), cursor, false);
      case 'filter':
        return filter();
      case 'jump':
        return jumpPicker(false);
      case 'search':
        return jumpPicker(true);

      case 'sortAlpha':
        return setSort('alpha', false);
      case 'sortAlphaRev':
        return setSort('alpha', true);
      case 'sortCreated':
        return setSort('created', false);
      case 'sortCreatedRev':
        return setSort('created', true);
      case 'sortModified':
        return setSort('modified', false);
      case 'sortModifiedRev':
        return setSort('modified', true);
      case 'sortNative':
        return setSort('native', false);
      case 'sortNativeRev':
        return setSort('native', true);
      case 'toggleTagsFirst':
        settings = await saveSettings({ tagsFirst: !settings.tagsFirst });
        return say(`tags first: ${settings.tagsFirst ? 'on' : 'off'}`);
      case 'toggleRecursive':
        tab.recursive = !tab.recursive;
        return say(`recursive view: ${tab.recursive ? 'on' : 'off'}`);

      case 'tabNew':
        tabs.push(newTab(e?.kind === 'tag' ? e.tag.path : cur.path));
        return switchTab(tabs.length - 1);
      case 'tabClose':
        if (tabs.length === 1) return window.close();
        tabs.splice(ti, 1);
        return switchTab(Math.min(ti, tabs.length - 1));
      case 'tabPrev':
        return switchTab((ti - 1 + tabs.length) % tabs.length);
      case 'tabNext':
        return switchTab((ti + 1) % tabs.length);
      case 'tab1':
      case 'tab2':
      case 'tab3':
      case 'tab4':
      case 'tab5':
      case 'tab6':
      case 'tab7':
      case 'tab8':
      case 'tab9':
        return switchTab(Number(action.slice(3)) - 1);

      case 'copyUrl': {
        const urls = [...new Set(itemRefs(targets()).map((r) => r.url))];
        if (!urls.length) return say('no bookmark selected', 'warn');
        return copyText(urls.join('\n'), plural(urls.length, 'url'));
      }
      case 'copyTitle': {
        const refs = targets();
        const names = refs.map((r) => (r.kind === 'tag' ? r.path[r.path.length - 1] : titleOf(r.url)));
        return copyText(names.join('\n'), plural(names.length, 'name'));
      }
      case 'copyPath': {
        const p = e?.kind === 'tag' ? e.tag.path : cur.path;
        return copyText(formatPath(p), formatPath(p));
      }

      case 'undo':
        return run(async () => {
          const u = await history.undo();
          return u ? `undid: ${u.label}` : 'nothing to undo';
        });
      case 'redo':
        return run(async () => {
          const u = await history.redo();
          return u ? `redid: ${u.label}` : 'nothing to redo';
        });
      case 'help':
        return help();
      case 'escape':
        if (tab.visual) return commitVisual();
        if (selectedCount) return clearSelection();
        if (tab.filter) return void (tab.filter = '');
        if (clip) return void (clip = null);
        tab.find = null;
        return;
      case 'quit':
        return window.close();
    }
  }

  function onkeydown(ev: KeyboardEvent) {
    if (overlay || !loaded) return;
    const t = ev.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const key = eventToKey(ev);
    if (!key) return;
    if (busy && key !== '<Esc>') {
      ev.preventDefault();
      return;
    }
    const r = resolver.feed(key);
    if ('action' in r) {
      ev.preventDefault();
      pending = null;
      void exec(r.action);
    } else if ('pending' in r) {
      ev.preventDefault();
      pending = r.pending;
    } else {
      pending = null;
    }
  }

  const sortLabel = $derived(`${settings.sort}${settings.reverse ? '↑' : '↓'}${settings.tagsFirst ? '' : ' mixed'}`);
</script>

<svelte:window {onkeydown} />

<div class="app">
  <header>
    <div class="path">
      <span class="root">romeli</span><span class="sep">:</span><span class="cwd">{formatPath(cur.path)}</span
      >{#if hovered}<span class="leaf">{hovered.kind === 'tag' ? hovered.tag.name + '/' : hovered.name}</span>{/if}
    </div>
    <div class="tabs">
      {#each tabs as t, i}
        <span class="tab" class:active={i === ti}>{i + 1} {t.path.length ? t.path[t.path.length - 1] : '/'}</span>
      {/each}
    </div>
  </header>

  <main>
    <section class="col parent">
      <Column entries={parentEntries} cursor={parentCursor} {favicons} empty="" />
    </section>
    <section class="col current">
      <Column
        {entries}
        {cursor}
        active
        {favicons}
        {mark}
        empty={loaded ? (tab.filter ? `no match for "${tab.filter}"` : 'empty · a to create') : 'loading…'}
      />
    </section>
    <section class="col preview">
      <Preview {model} entry={hovered} children={previewChildren} {favicons} />
    </section>
  </main>

  <footer>
    <span class="mode {mode.toLowerCase()}">{mode}</span>
    {#if message}
      <span class="msg {message.kind}">{message.text}</span>
    {:else if hovered?.kind === 'item'}
      <span class="url">{hovered.copy.url}</span>
    {:else if hovered?.kind === 'tag'}
      <span class="dim">{formatPath(hovered.tag.path)}</span>
    {/if}
    <span class="spacer"></span>
    {#if busy}<span class="badge warn">working…</span>{/if}
    {#if clip}<span class="badge {clip.mode}">{clip.mode === 'yank' ? 'y' : 'x'} {clip.refs.length}</span>{/if}
    {#if selectedCount}<span class="badge sel">sel {selectedCount}</span>{/if}
    {#if tab.filter}<span class="badge filter">f: {tab.filter}</span>{/if}
    {#if tab.recursive}<span class="badge rec">R</span>{/if}
    <span class="badge sort">{sortLabel}</span>
    <span class="pos">{entries.length ? cursor + 1 : 0}/{entries.length}</span>
  </footer>

  {#if pending}
    <div class="whichkey">
      {#each pending.next as [k, a]}
        <div><span class="k">{pending.keys.join('')}{k}</span> <span class="dim">{ACTIONS[a]}</span></div>
      {/each}
    </div>
  {/if}

  {#if overlay?.kind === 'prompt'}
    <Prompt {...overlay} />
  {:else if overlay?.kind === 'confirm'}
    <Confirm title={overlay.title} lines={overlay.lines} onAnswer={overlay.onAnswer} />
  {:else if overlay?.kind === 'picker'}
    <Picker
      title={overlay.title}
      placeholder={overlay.placeholder}
      search={overlay.search}
      onPick={(fn) => {
        overlay = null;
        fn();
      }}
      onCancel={() => (overlay = null)}
    />
  {:else if overlay?.kind === 'form'}
    {@const o = overlay}
    <div class="overlay-backdrop">
      <ItemForm
        {model}
        heading={o.heading}
        url={o.url}
        title={o.title}
        tags={o.tags}
        focus={o.focus}
        favicon={favicons[hostOf(o.url)]}
        onSave={(u, t, list) => saveForm(o.editing, u, t, list)}
        onCancel={() => (overlay = null)}
      />
    </div>
  {/if}
</div>

<style>
  .app {
    display: grid;
    grid-template-rows: var(--row) 1fr var(--row);
    height: 100vh;
    padding: 2px 0 0;
  }
  header {
    display: flex;
    justify-content: space-between;
    padding: 0 8px;
    white-space: nowrap;
    overflow: hidden;
  }
  .root {
    color: var(--pink);
  }
  .sep {
    color: var(--comment);
  }
  .cwd {
    color: var(--purple);
    font-weight: bold;
  }
  .leaf {
    color: var(--fg);
  }
  .tabs {
    display: flex;
    gap: 2px;
  }
  .tab {
    padding: 0 8px;
    color: var(--comment);
  }
  .tab.active {
    background: var(--purple);
    color: var(--bg);
  }
  main {
    display: grid;
    grid-template-columns: 1fr 4fr 3fr;
    min-height: 0;
    border-top: 1px solid var(--cur);
    border-bottom: 1px solid var(--cur);
  }
  .col {
    min-width: 0;
    min-height: 0;
    padding: 2px 0;
  }
  .col + .col {
    border-left: 1px solid var(--cur);
  }
  .parent {
    opacity: 0.85;
  }
  footer {
    display: flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
    overflow: hidden;
    padding-right: 8px;
  }
  .mode {
    background: var(--pink);
    color: var(--bg);
    padding: 0 8px;
    font-weight: bold;
  }
  .mode.vis,
  .mode.uns {
    background: var(--orange);
  }
  .mode.sel {
    background: var(--yellow);
  }
  .url {
    color: var(--cyan);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .msg {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .msg.info {
    color: var(--green);
  }
  .msg.warn {
    color: var(--orange);
  }
  .msg.error {
    color: var(--red);
  }
  .spacer {
    flex: 1;
  }
  .badge {
    color: var(--comment);
  }
  .badge.yank {
    color: var(--green);
  }
  .badge.cut {
    color: var(--red);
  }
  .badge.sel {
    color: var(--yellow);
  }
  .badge.filter,
  .badge.rec {
    color: var(--cyan);
  }
  .badge.warn {
    color: var(--orange);
  }
  .pos {
    color: var(--pink);
  }
  .whichkey {
    position: fixed;
    left: 0;
    right: 0;
    bottom: calc(var(--row) + 2px);
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 0 16px;
    padding: 6px 12px;
    background: var(--bg-dark);
    border-top: 1px solid var(--purple);
  }
  .whichkey .k {
    color: var(--pink);
    display: inline-block;
    min-width: 5ch;
  }
</style>
