<script lang="ts">
  import { onMount } from 'svelte';
  import {
    DEFAULT_SETTINGS,
    bindingsOf,
    createStore,
    createViewStore,
    faviconFor,
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
  import { platform } from '../../platform';
  import { ext } from '../../platform/ext';
  import { fuzzyFilter } from '../../core/fuzzy';
  import { KeyResolver, MUTATING, bindingsFor, type Action, type Screen } from '../../core/keymap';
  import { Model, type TagNode } from '../../core/model';
  import { OpError, normalizeName, plural, type OpResult } from '../../core/store';
  import { formatPath, formatTagList, isAncestor, parsePath, pathKey, samePath } from '../../core/tags';
  import type { TagPath } from '../../core/types';
  import { UndoStack } from '../../core/undo';
  import { referencing, refsUnder } from '../../core/views/defs';
  import { projectView } from '../../core/views/project';
  import { EMPTY_DEFS, type Def, type ViewDefs } from '../../core/views/types';
  import Column from '../components/Column.svelte';
  import ItemForm from '../components/ItemForm.svelte';
  import Preview from '../components/Preview.svelte';
  import { KeyFeed } from '../lib/keys.svelte';
  import { ListNav, MOTIONS, pageRows } from '../lib/listNav.svelte';
  import { Flash, Overlays, type PickAction } from '../lib/overlays.svelte';
  import OverlayView from '../lib/OverlayHost.svelte';
  import StatusBar from '../lib/StatusBar.svelte';
  import WhichKey from '../lib/WhichKey.svelte';
  import Editor from '../views/Editor.svelte';
  import ViewsDialog from '../views/ViewsDialog.svelte';
  import { entriesOf, itemKey, keyOf, parseKey, refOf, tagKey, type Entry, type ConfirmLine, type Ref } from './view';

  // ------------------------------------------------------------------ state

  interface Tab {
    path: TagPath;
    nav: ListNav<Entry>;
    remember: Record<string, string>;
    history: TagPath[];
    future: TagPath[];
    recursive: boolean;
    /** The id of the view this tab shows (read-only), if any. */
    view?: string;
  }

  type Form = { heading: string; url: string; title: string; tags: string; focus: 'tags' | 'title' | 'url'; editing: string | null };

  const views = createViewStore();
  const store = createStore(views);
  const history = new UndoStack();
  /** The view editor's own undo history (definition edits), kept while the editor is closed. */
  const editorHistory = new UndoStack();
  const overlays = new Overlays();
  const flash = new Flash();
  const say = flash.say;
  const keys = new KeyFeed();

  const newTab = (path: TagPath = [], view?: string): Tab => ({
    path,
    nav: new ListNav(() => entries),
    remember: {},
    history: [],
    future: [],
    recursive: false,
    view,
  });

  const resolversOf = (s: Settings) => {
    const b = bindingsOf(s);
    return { main: new KeyResolver(bindingsFor(b, 'main')), viewTab: new KeyResolver(bindingsFor(b, 'viewTab')) };
  };

  let model = $state.raw<Model>(new Model());
  let defs = $state.raw<ViewDefs>(EMPTY_DEFS);
  let settings = $state.raw<Settings>(DEFAULT_SETTINGS);
  let favicons = $state.raw<Favicons>({});
  let resolvers = resolversOf(DEFAULT_SETTINGS);
  let tabs = $state<Tab[]>([newTab()]);
  let ti = $state(0);
  let clip = $state<{ mode: 'yank' | 'cut'; refs: Ref[] } | null>(null);
  let form = $state.raw<Form | null>(null);
  let screen = $state<'browser' | 'editor'>('browser');
  let dialog = $state(false);
  let busy = $state(false);
  let loaded = $state(false);
  let dirty = false;

  const tab = $derived(tabs[ti]);
  const nav = $derived(tab.nav);
  const viewOf = (t: Tab): Def | null => (t.view ? (defs.views.find((v) => v.id === t.view) ?? null) : null);
  const tabView = $derived(viewOf(tab));
  /** What the current tab shows: the whole tree, or a view's projection of it. */
  const shown: Model = $derived(tab.view ? (tabView ? projectView(model, tabView, defs) : new Model()) : model);
  const cur: TagNode = $derived(shown.tag(tab.path) ?? shown.root);
  const viewOpts = $derived({
    sort: settings.sort,
    reverse: settings.reverse,
    tagsFirst: settings.tagsFirst,
    recursive: tab.recursive,
    filter: nav.filter,
  });
  const plainOpts = $derived({ ...viewOpts, recursive: false, filter: '' });
  const entries = $derived(entriesOf(shown, cur, viewOpts));
  const cursor = $derived(nav.cursor);
  const hovered: Entry | undefined = $derived(entries[cursor]);
  const parentEntries = $derived(cur.parent ? entriesOf(shown, cur.parent, plainOpts) : []);
  const parentCursor = $derived(parentEntries.findIndex((e) => e.kind === 'tag' && e.tag === cur));
  const previewChildren = $derived(hovered?.kind === 'tag' ? entriesOf(shown, hovered.tag, plainOpts) : []);
  const clipKeys = $derived(new Set(clip?.refs.map(keyOf) ?? []));

  // ------------------------------------------------------------------ loading

  async function refresh() {
    if (busy) {
      dirty = true;
      return;
    }
    const [m, d, s, f] = await Promise.all([store.load(), views.load(), loadSettings(), loadFavicons()]);
    defs = d;
    applyModel(m);
    if (JSON.stringify(s.bindings) !== JSON.stringify(settings.bindings)) resolvers = resolversOf(s);
    settings = s;
    favicons = f;
    const first = !loaded;
    loaded = true;
    if (first) {
      const url = new URLSearchParams(location.search).get('reveal');
      if (url) reveal(url);
      void offerTidy();
    }
  }

  /** Once per launch: offer to rename folders containing the tag separators and merge duplicate copies. */
  async function offerTidy() {
    const bad = store.unnormalizedTags();
    const dups = store.duplicateCopies();
    if ((!bad.length && !dups.length) || !settings.askNormalize || overlays.open || form) return;
    const list = <T,>(xs: T[], line: (x: T) => ConfirmLine): ConfirmLine[] => [
      ...xs.slice(0, 8).map(line),
      ...(xs.length > 8 ? [`… and ${xs.length - 8} more`] : []),
    ];
    const lines: ConfirmLine[] = [];
    if (bad.length) {
      lines.push(
        `${plural(bad.length, 'folder name')} contain "," or "/", which also separate tags.`,
        'Rename "," → ";" and "/" → "|"?  (u undoes)',
        ...list(bad, (t) => ({ text: `▸ ${formatPath(t.path)}`, sub: `→ ${normalizeName(t.name)}/` })),
      );
    }
    if (dups.length) {
      lines.push(
        ...(lines.length ? ['\u00a0'] : []),
        `${plural(dups.length, 'bookmark')} ${dups.length === 1 ? 'is a duplicate' : 'are duplicates'} of another in the same folder.`,
        `Remove ${dups.length === 1 ? 'it' : 'them'}, keeping the oldest?  (u undoes)`,
        ...list(dups, (c) => ({ text: `· ${c.title || c.url}`, sub: `in ${formatPath(c.tag.path)}` })),
      );
    }
    if (await overlays.confirm('Tidy up bookmarks', lines)) {
      await run(async () => [await store.normalizeNames(), await store.mergeDuplicates()]);
    } else {
      settings = await saveSettings({ askNormalize: false });
      say("ok, won't ask again · tidy up any time from settings", 'warn');
    }
  }

  function applyModel(m: Model) {
    model = m;
    trimPaths();
  }

  /** Walk each tab up until its path exists (in its view, for view tabs). */
  function trimPaths() {
    for (const t of tabs) {
      const v = viewOf(t);
      const m = t.view ? (v ? projectView(model, v, defs) : null) : model;
      while (t.path.length && !m?.tag(t.path)) t.path = t.path.slice(0, -1);
    }
  }

  function setDefs(d: ViewDefs) {
    defs = d;
    trimPaths();
  }

  onMount(() => {
    resolvers = resolversOf(settings);
    void refresh();
    const off = onExternalChange(() => void refresh());
    const onLocal = (changes: Record<string, unknown>, area: string) => {
      if (area !== 'local') return;
      if ('views' in changes) void views.load().then(setDefs);
      if ('favicons' in changes) void loadFavicons().then((f) => (favicons = f));
    };
    ext.storage.onChanged.addListener(onLocal);
    // The background asks an already open window to show the page of the current tab.
    const onMessage = (msg: { type?: string; url?: string }) => {
      if (msg?.type === 'reveal' && msg.url) reveal(msg.url);
    };
    ext.runtime.onMessage.addListener(onMessage);
    return () => {
      off();
      ext.storage.onChanged.removeListener(onLocal);
      ext.runtime.onMessage.removeListener(onMessage);
    };
  });

  // ------------------------------------------------------------------ helpers

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

  function go(path: TagPath, opts: { hover?: string; record?: boolean } = {}) {
    if (samePath(path, tab.path) && !opts.hover) return;
    if (hovered) tab.remember[pathKey(tab.path)] = hovered.key;
    if (opts.record !== false) {
      tab.history.push(tab.path);
      tab.future = [];
    }
    nav.commitVisual();
    tab.path = path;
    nav.filter = '';
    nav.reset(opts.hover ?? tab.remember[pathKey(path)] ?? null);
  }

  /** If `url` is bookmarked, go to its primary tag with the cursor on it (in a normal tab). */
  function reveal(url: string) {
    const path = model.item(url)?.tags[0];
    if (!path) return;
    if (tab.view) toNormalTab();
    go(path, { hover: itemKey(url, path), record: !samePath(path, tab.path) });
  }

  /** Switch to the first tab that isn't a view, opening one if there is none. */
  function toNormalTab() {
    const i = tabs.findIndex((t) => !t.view);
    if (i >= 0) return switchTab(i);
    tabs.push(newTab());
    switchTab(tabs.length - 1);
  }

  function mark(e: Entry, i: number) {
    const sel = nav.isSelected(e, i);
    const c = clipKeys.has(e.key) ? clip!.mode : undefined;
    if (sel && c) return `sel ${c}` as const;
    if (sel) return 'sel' as const;
    return c;
  }

  /** Selected refs (committing any visual range), or the hovered entry. */
  function targets(): Ref[] {
    const keys = nav.targetKeys();
    if (nav.selectedCount) return keys.map(parseKey);
    return hovered ? [refOf(hovered)] : [];
  }

  const itemRefs = (refs: Ref[]) => refs.filter((r): r is Extract<Ref, { kind: 'item' }> => r.kind === 'item');
  /** Tag refs, dropping any whose ancestor is also targeted. */
  const tagRefs = (refs: Ref[]) => {
    const tags = refs.filter((r): r is Extract<Ref, { kind: 'tag' }> => r.kind === 'tag');
    return tags.filter((t) => !tags.some((o) => isAncestor(o.path, t.path)));
  };

  const titleOf = (url: string) => model.item(url)?.title || url;

  async function copyText(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      say(`copied ${what}`);
    } catch (e) {
      say(`clipboard: ${(e as Error).message}`, 'error');
    }
  }

  async function openItems(urls: string[], where: 'current' | 'new' | 'background') {
    if (urls.length > 10 && !(await overlays.confirm('Open tabs', [`Open ${urls.length} tabs?`]))) return;
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
    const lines: ConfirmLine[] = [];
    const urls = [...new Set(items.map((r) => r.url))];
    if (all) {
      for (const u of urls) {
        const tags = model.item(u)?.tags ?? [];
        lines.push({ text: `· ${titleOf(u)}`, sub: `from ${tags.map(formatPath).join(', ')}`, warn: true });
      }
    } else {
      for (const r of items) {
        const last = (model.item(r.url)?.tags.length ?? 0) <= 1;
        lines.push({
          text: `· ${titleOf(r.url)}`,
          sub: `from ${formatPath(r.path)}${last ? ' — last copy, bookmark deleted' : ''}`,
          warn: last,
        });
      }
    }
    for (const t of tags) {
      const d = store.describeTagDeletion(t.path);
      lines.push({
        text: `▸ ${formatPath(t.path)}`,
        sub: `${plural(d.tags - 1, 'subtag')}, ${plural(d.items, 'item')}` + (d.orphaned ? `, ${d.orphaned} become untagged` : ''),
        warn: d.orphaned > 0,
      });
      const users = referencing(defs, refsUnder(t.path));
      if (users.length) {
        const names = users.map((u) => (u.kind === 'vars' ? `{${u.def.name}}` : u.def.name)).join(', ');
        lines.push({ text: `  used by ${names}`, sub: 'references stay, matching nothing', warn: true });
      }
    }
    const title = all ? `Delete ${plural(urls.length + tags.length, 'entry', 'entries')} everywhere` : `Delete ${plural(refs.length, 'entry', 'entries')}`;
    if (!(await overlays.confirm(title, lines))) return;
    nav.clearSelection();
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
    if (e.kind === 'tag' && e.tag.fixed) return say(`${formatPath(e.tag.path)} is a ${platform.browserName} root folder`, 'warn');
    const v = await overlays.prompt('Rename', e.kind === 'tag' ? e.tag.name : e.copy.title);
    if (v === null || !v.trim()) return;
    const name = v.trim();
    await run(async () => {
      if (e.kind === 'tag') {
        const r = await store.renameTag(e.tag.path, name.replace(/\/+$/, ''));
        nav.hover = tagKey([...e.tag.path.slice(0, -1), name.replace(/\/+$/, '')]);
        return r;
      }
      return store.renameItem(e.copy.url, name);
    });
  }

  async function create() {
    const v = await overlays.prompt('Create', '', 'end with / to create a tag · paste a url to bookmark it');
    if (v === null || !v.trim()) return;
    const s = v.trim();
    if (s.endsWith('/')) {
      const path = [...cur.path, ...parsePath(s)];
      await run(async () => {
        const r = await store.createTag(path);
        nav.hover = tagKey(path.slice(0, cur.path.length + 1));
        return r;
      });
      return;
    }
    const isUrl = /^[a-z][\w+.-]*:\/\//i.test(s) || /^(about|mailto|javascript|data):/i.test(s);
    form = {
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
    form = {
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
        if (samePath(first, cur.path) || tags.some((t) => samePath(t, cur.path))) nav.hover = itemKey(url, cur.path);
        form = null;
        return r;
      } catch (e) {
        err = e;
        throw e;
      }
    });
    if (err) throw err;
  }

  /** z: tags and items · s: items by title/url · S: tags only. Shift+Enter opens in a new (romeli) tab. */
  function jumpPicker(scope: 'all' | 'items' | 'tags') {
    type Cand = { key: string; text: string; label: string; sub?: string; kind: 'tag' | 'item'; act: PickAction };
    const cands: Cand[] = [];
    if (scope !== 'items') {
      for (const t of shown.allTags()) {
        const label = formatPath(t.path);
        cands.push({
          key: 't' + t.id,
          text: label,
          label,
          sub: plural(t.tags.length + t.copies.length, 'entry', 'entries'),
          kind: 'tag',
          act: { go: () => go(t.path), alt: () => openTab(t.path, tab.view) },
        });
      }
    }
    if (scope !== 'tags') {
      for (const i of shown.items.values()) {
        const primary = i.tags[0] ?? [];
        const label = scope === 'items' ? i.title || i.url : `${primary.length ? formatPath(primary) : ''}${i.title}`;
        cands.push({
          key: 'i' + i.url,
          text: scope === 'items' ? `${label} ${i.url}` : label,
          label,
          sub: scope === 'items' ? i.url : hostOf(i.url),
          kind: 'item',
          act: { go: () => go(primary, { hover: itemKey(i.url, primary) }), alt: () => void openUrl(i.url, 'new') },
        });
      }
    }
    const titles = { all: 'jump', items: 'search bookmarks', tags: 'search tags' };
    const hints = {
      all: '↵ go · S-↵ open (bookmark: browser tab, tag: romeli tab)',
      items: '↵ go to bookmark · S-↵ open in new browser tab',
      tags: '↵ go to tag · S-↵ open in new romeli tab',
    };
    overlays.picker({
      title: titles[scope],
      placeholder: scope === 'items' ? 'title or url' : scope === 'tags' ? 'tag/path' : 'tag/path or bookmark',
      hint: hints[scope],
      search: (q) =>
        fuzzyFilter(q, cands, (c) => c.text).map(({ value: c, match }) => ({
          key: c.key,
          label: c.label,
          positions: match.positions.filter((p) => p < c.label.length),
          sub: c.sub,
          kind: c.kind,
          value: c.act,
        })),
    });
  }

  function openTab(path: TagPath, view?: string) {
    tabs.push(newTab(path, view));
    switchTab(tabs.length - 1);
  }

  /** Open views (from the T dialog) as new read-only tabs. */
  function openViews(ids: string[]) {
    dialog = false;
    for (const id of ids) tabs.push(newTab([], id));
    if (ids.length) switchTab(tabs.length - 1);
  }

  async function setSort(sort: SortKey, reverse: boolean) {
    settings = await saveSettings({ sort, reverse });
    say(`sort: ${sort}${reverse ? ' (reverse)' : ''}`);
  }

  function switchTab(i: number) {
    if (i < 0 || i >= tabs.length) return;
    nav.commitVisual();
    ti = i;
  }

  async function exec(action: Action) {
    if (tab.view && MUTATING.has(action)) return say('views are read-only · g. goes to the item in a normal tab', 'warn');
    if (!MOTIONS.has(action) && nav.visual && !['visual', 'visualUnset', 'escape', 'yank', 'cut', 'delete', 'deleteAll', 'openNew', 'open'].includes(action)) {
      nav.commitVisual();
    }
    if (nav.exec(action, { overlays, pageRows: pageRows(), onMiss: (q) => say(`no match for "${q}"`, 'warn') })) return;
    const e = hovered;
    switch (action) {
      case 'parent':
        if (nav.filter) return void (nav.filter = '');
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
      case 'prevTagLocation':
      case 'nextTagLocation': {
        if (hovered?.kind !== 'item') return;
        const { url, tags } = hovered.item;
        if (tags.length < 2) return say('this is its only tag');
        const i = tags.findIndex((t) => samePath(t, hovered.copy.tag.path));
        const j = (i + (action === 'nextTagLocation' ? 1 : -1) + tags.length) % tags.length;
        go(tags[j], { hover: itemKey(url, tags[j]) });
        return say(`${formatPath(tags[j])} [${j + 1}/${tags.length}]`);
      }
      case 'goPrimary': {
        if (e?.kind !== 'item') return say('g. works on a bookmark', 'warn');
        return reveal(e.copy.url);
      }

      case 'open':
      case 'openNew': {
        const where = action === 'open' ? 'current' : 'new';
        const sel = itemRefs(targets());
        if (nav.selectedCount) {
          nav.clearSelection();
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

      case 'yank':
      case 'cut': {
        const refs = targets();
        if (!refs.length) return;
        if (action === 'cut' && refs.some((r) => r.kind === 'tag' && model.tag(r.path)?.fixed)) {
          return say(`${platform.browserName} root folders cannot be moved`, 'warn');
        }
        clip = { mode: action, refs };
        nav.clearSelection();
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

      case 'jump':
        return jumpPicker('all');
      case 'search':
        return jumpPicker('items');
      case 'searchTags':
        return jumpPicker('tags');

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
        return openTab(e?.kind === 'tag' ? e.tag.path : cur.path, tab.view);
      case 'tabClose':
      {
        if (tabs.length === 1) return window.close();
        // Move off the tab before removing it: `tab` (and its nav) must never point past the end.
        const closing = ti;
        nav.commitVisual();
        ti = Math.min(closing, tabs.length - 2);
        tabs.splice(closing, 1);
        return;
      }
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

      case 'views':
        if (!defs.views.length) return say('no views yet · K to create one', 'warn');
        dialog = true;
        return;
      case 'viewEditor':
        nav.commitVisual();
        screen = 'editor';
        return;

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
        overlays.help(['main', 'viewTab']);
        return;
      case 'escape':
        if (nav.escape()) return;
        if (clip) return void (clip = null);
        return;
      case 'quit':
        return window.close();
    }
  }

  function onkeydown(ev: KeyboardEvent) {
    if (overlays.open || form || dialog || screen !== 'browser' || !loaded) return;
    const screenKey: Screen = tab.view ? 'viewTab' : 'main';
    keys.handle(ev, resolvers[screenKey], (a) => void exec(a), busy);
  }

  const sortLabel = $derived(`${settings.sort}${settings.reverse ? '↑' : '↓'}${settings.tagsFirst ? '' : ' mixed'}`);
  const tabLabel = (t: Tab) => {
    if (t.view) return `◇${viewOf(t)?.name ?? '?'}${t.path.length ? ':' + t.path[t.path.length - 1] : ''}`;
    return t.path.length ? t.path[t.path.length - 1] : '/';
  };
</script>

<svelte:window {onkeydown} />

{#if screen === 'editor'}
  <Editor
    {model}
    {defs}
    store={views}
    history={editorHistory}
    bindings={bindingsOf(settings)}
    onDefs={setDefs}
    onOpen={(id) => {
      screen = 'browser';
      openViews([id]);
    }}
    onQuit={() => (screen = 'browser')}
  />
{:else}
<div class="app">
  <header>
    <div class="path">
      <span class="root">{tab.view ? `◇${tabView?.name ?? 'deleted view'}` : 'romeli'}</span><span class="sep">:</span><span class="cwd">{formatPath(cur.path)}</span
      >{#if hovered}<span class="leaf">{hovered.kind === 'tag' ? hovered.tag.name + '/' : hovered.name}</span>{/if}
    </div>
    <div class="tabs">
      {#each tabs as t, i}
        <span class="tab" class:active={i === ti}>{i + 1} {tabLabel(t)}</span>
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
        find={nav.find?.query ?? ''}
        empty={!loaded ? 'loading…' : nav.filter ? `no match for "${nav.filter}"` : tab.view ? (tabView ? 'nothing matches this view' : 'this view was deleted') : 'empty · a to create'}
      />
    </section>
    <section class="col preview">
      <Preview model={shown} entry={hovered} children={previewChildren} {favicons} />
    </section>
  </main>

  <StatusBar
    mode={nav.mode}
    message={flash.message}
    info={hovered?.kind === 'item' ? { text: hovered.copy.url, kind: 'url' } : hovered?.kind === 'tag' ? { text: formatPath(hovered.tag.path), kind: 'dim' } : undefined}
    badges={[
      busy && { text: 'working…', kind: 'warn' },
      clip && { text: `${clip.mode === 'yank' ? 'y' : 'x'} ${clip.refs.length}`, kind: clip.mode },
      nav.selectedCount > 0 && { text: `sel ${nav.selectedCount}`, kind: 'sel' },
      nav.findStat && { text: `/${nav.findStat.query} [${nav.findStat.n || '-'}/${nav.findStat.m}]`, kind: 'find' },
      !!nav.filter && { text: `f: ${nav.filter}`, kind: 'filter' },
      tab.recursive && { text: 'R', kind: 'rec' },
      { text: sortLabel, kind: 'sort' },
    ]}
    pos="{entries.length ? cursor + 1 : 0}/{entries.length}"
  />

  {#if keys.pending}
    <WhichKey pending={keys.pending} />
  {/if}

  <OverlayView {overlays} bindings={bindingsOf(settings)} />
  {#if form}
    {@const o = form}
    <div class="overlay-backdrop">
      <ItemForm
        {model}
        heading={o.heading}
        url={o.url}
        title={o.title}
        tags={o.tags}
        focus={o.focus}
        favicon={faviconFor(favicons, o.url)}
        onSave={(u, t, list) => saveForm(o.editing, u, t, list)}
        onCancel={() => (form = null)}
      />
    </div>
  {/if}
  {#if dialog}
    <ViewsDialog {model} {defs} bindings={bindingsOf(settings)} onOpen={openViews} onClose={() => (dialog = false)} />
  {/if}
</div>
{/if}

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
    gap: 16px;
    white-space: nowrap;
    overflow: hidden;
  }
  .path {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .root {
    color: var(--path-root);
  }
  .sep {
    color: var(--path-sep);
  }
  .cwd {
    color: var(--path-cwd);
    font-weight: bold;
  }
  .leaf {
    color: var(--path-leaf);
  }
  .tabs {
    display: flex;
    flex-shrink: 0;
    gap: 2px;
  }
  .tab {
    padding: 0 8px;
    color: var(--tab);
  }
  .tab.active {
    background: var(--tab-active-bg);
    color: var(--tab-active-fg);
  }
  main {
    display: grid;
    grid-template-columns: 1fr 4fr 3fr;
    min-height: 0;
    border-top: 1px solid var(--divider);
    border-bottom: 1px solid var(--divider);
  }
  .col {
    min-width: 0;
    min-height: 0;
    padding: 2px 0;
  }
  .col + .col {
    border-left: 1px solid var(--divider);
  }
  .parent {
    opacity: 0.85;
  }
</style>
