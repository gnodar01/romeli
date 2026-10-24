<script lang="ts">
  import { onMount } from 'svelte';
  import { createStore, DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../../adapter/browser';
  import { ACTIONS, DEFAULT_BINDINGS, eventToKey, type Action } from '../../core/keymap';
  import { normalizeName, plural } from '../../core/store';
  import { formatPath } from '../../core/tags';

  const isMac = navigator.platform.toLowerCase().includes('mac');
  const store = createStore();

  let settings = $state<Settings>(DEFAULT_SETTINGS);
  let commands = $state<browser.commands.Command[]>([]);
  let cmdErrors = $state<Record<string, string>>({});
  let filter = $state('');
  let status = $state<{ text: string; error: boolean } | null>(null);
  let recording = $state<Action | null>(null);
  let recordingCmd = $state<string | null>(null);
  let badTags = $state<{ path: string; name: string }[]>([]);
  let statusTimer: ReturnType<typeof setTimeout> | undefined;

  const actions = Object.keys(ACTIONS) as Action[];
  const bound = (a: Action) => settings.bindings[a] ?? DEFAULT_BINDINGS[a];
  const shown = $derived(
    actions.filter((a) => {
      const q = filter.toLowerCase();
      return !q || a.toLowerCase().includes(q) || ACTIONS[a].toLowerCase().includes(q) || bound(a).join(' ').includes(filter);
    }),
  );
  const conflicts = $derived.by(() => {
    const seen = new Map<string, Action[]>();
    for (const a of actions) for (const k of bound(a)) seen.set(k, [...(seen.get(k) ?? []), a]);
    return new Map([...seen].filter(([, v]) => v.length > 1));
  });

  async function loadBadTags() {
    await store.load();
    badTags = store.unnormalizedTags().map((t) => ({ path: formatPath(t.path), name: t.name }));
  }

  onMount(async () => {
    settings = await loadSettings();
    commands = await browser.commands.getAll();
    await loadBadTags();
  });

  /** Info messages fade after a few seconds; errors stay until dismissed (Esc / click) or replaced. */
  function flash(text: string, error = false) {
    status = { text, error };
    clearTimeout(statusTimer);
    if (!error) statusTimer = setTimeout(() => (status = null), 3000);
  }

  async function setBinding(a: Action, value: string) {
    const keys = value.split(/\s+/).filter(Boolean);
    const bindings = { ...settings.bindings };
    if (keys.join(' ') === DEFAULT_BINDINGS[a].join(' ')) delete bindings[a];
    else bindings[a] = keys;
    settings = await saveSettings({ bindings });
    flash(`saved: ${ACTIONS[a]}`);
  }

  async function resetAll() {
    settings = await saveSettings({ bindings: {} });
    flash('all keys reset to defaults');
  }

  /** Record a single key press (e.g. <C-x>) and append it to the binding being edited. */
  function onRecordKey(e: KeyboardEvent, a: Action) {
    if (recording !== a) return;
    if (e.key === 'Escape' && !e.ctrlKey) {
      recording = null;
      return;
    }
    const k = eventToKey(e);
    if (!k) return;
    e.preventDefault();
    void setBinding(a, [...bound(a), k].join(' '));
    recording = null;
  }

  // ---------------------------------------------------------------- global shortcuts

  const SPECIAL: Record<string, string> = {
    ',': 'Comma',
    '.': 'Period',
    ' ': 'Space',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert',
    Delete: 'Delete',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
  };

  /** Convert a key press to Firefox's commands syntax, e.g. MacCtrl+Shift+M. */
  function toCommandShortcut(e: KeyboardEvent): string | null {
    let key: string | undefined;
    if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
    else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
    else if (/^F\d{1,2}$/.test(e.key)) key = e.key;
    else key = SPECIAL[e.key];
    if (!key) return null;
    const mods: string[] = [];
    if (isMac) {
      if (e.metaKey) mods.push('Command');
      if (e.ctrlKey) mods.push('MacCtrl');
    } else if (e.ctrlKey) mods.push('Ctrl');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    return [...mods, key].join('+');
  }

  function onRecordCommand(e: KeyboardEvent, name: string) {
    if (recordingCmd !== name) return;
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    recordingCmd = null;
    if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.metaKey) return;
    const s = toCommandShortcut(e);
    if (!s) return void (cmdErrors[name] = `unsupported key "${e.key}"`);
    void setCommand(name, s);
  }

  async function setCommand(name: string, shortcut: string) {
    try {
      if (shortcut.trim()) await browser.commands.update({ name, shortcut: shortcut.trim() });
      else await browser.commands.reset(name);
      commands = await browser.commands.getAll();
      delete cmdErrors[name];
      flash(`shortcut saved: ${shortcut.trim() || 'default'}`);
    } catch (e) {
      cmdErrors[name] = `"${shortcut}" was rejected: ${(e as Error).message}`;
      flash(`invalid shortcut "${shortcut}"`, true);
    }
  }

  // ---------------------------------------------------------------- folder names

  async function normalize() {
    try {
      const { entry } = await store.normalizeNames();
      await loadBadTags();
      flash(entry ? entry.label : 'nothing to normalize');
    } catch (e) {
      flash((e as Error).message, true);
    }
  }

  async function setAsk(v: boolean) {
    settings = await saveSettings({ askNormalize: v });
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && status?.error && (status = null)} />

<main>
  <h1><span class="pink">romeli</span> <span class="dim">· settings</span></h1>

  <section class="box">
    <span class="box-title">global shortcuts</span>
    <p class="dim">
      Press <i>record</i> and then the key combination, or type it in Firefox syntax ({isMac
        ? 'MacCtrl+Shift+M, Command+Alt+K'
        : 'Ctrl+Shift+M, Alt+Shift+K'}). Empty resets to the default. Also editable at about:addons → ⚙ → Manage
      Extension Shortcuts.
    </p>
    {#each commands as c (c.name)}
      <div class="row">
        <label class="desc" for="cmd-{c.name}">{c.description}</label>
        <input
          id="cmd-{c.name}"
          class="key"
          value={c.shortcut ?? ''}
          spellcheck="false"
          onchange={(e) => setCommand(c.name!, e.currentTarget.value)}
        />
        <button
          class:rec={recordingCmd === c.name}
          onclick={() => (recordingCmd = recordingCmd === c.name ? null : c.name!)}
          onkeydown={(e) => onRecordCommand(e, c.name!)}
        >
          {recordingCmd === c.name ? 'press keys…' : 'record'}
        </button>
        {#if cmdErrors[c.name!]}<span class="error-line">{cmdErrors[c.name!]}</span>{/if}
      </div>
    {/each}
  </section>

  <section class="box">
    <span class="box-title">browser keys</span>
    <p class="dim">
      Space-separated sequences per action, vim style: <code>j</code> <code>gg</code> <code>&lt;C-u&gt;</code>
      <code>&lt;Space&gt;</code> <code>,a</code>. Or focus <i>record</i>, press Enter, then press the key to add
      (handy for modifiers).
    </p>
    <div class="toolbar">
      <input class="filter" placeholder="filter…" bind:value={filter} spellcheck="false" />
      <button onclick={resetAll}>reset all</button>
    </div>
    <div class="table">
      {#each shown as a (a)}
        {@const keys = bound(a)}
        <div class="row" class:custom={!!settings.bindings[a]}>
          <label class="desc" for="key-{a}">{ACTIONS[a]}</label>
          <input
            id="key-{a}"
            class="key"
            value={keys.join(' ')}
            spellcheck="false"
            onchange={(e) => setBinding(a, e.currentTarget.value)}
          />
          <button
            class:rec={recording === a}
            onclick={() => (recording = recording === a ? null : a)}
            onkeydown={(e) => onRecordKey(e, a)}
          >
            {recording === a ? 'press key…' : 'record'}
          </button>
          {#each keys.filter((k) => conflicts.has(k)) as k}
            <span class="conflict">{k} also: {conflicts.get(k)!.filter((x) => x !== a).join(', ')}</span>
          {/each}
        </div>
      {/each}
    </div>
  </section>

  <section class="box">
    <span class="box-title">folder names</span>
    <p class="dim">
      Tag lists use <code>,</code> and <code>/</code> as separators, so folder names containing them are ambiguous.
      Normalizing renames <code>,</code> → <code>;</code> and <code>/</code> → <code>|</code>. From here it can't be
      undone; from the prompt in the browser, <code>u</code> undoes it.
    </p>
    {#if badTags.length}
      <div class="bad scroll">
        {#each badTags as t}<div>{t.path} <span class="dim">→</span> {normalizeName(t.name)}</div>{/each}
      </div>
      <div class="toolbar">
        <button onclick={normalize}>normalize {plural(badTags.length, 'folder')}</button>
      </div>
    {:else}
      <p class="ok">all folder names are clean</p>
    {/if}
    <label class="check">
      <input type="checkbox" checked={settings.askNormalize} onchange={(e) => setAsk(e.currentTarget.checked)} />
      ask when romeli opens and finds such names
    </label>
  </section>

  {#if status}
    <button class="status" class:error={status.error} onclick={() => (status = null)}>
      {status.text}{#if status.error}<span class="dim"> · Esc to dismiss</span>{/if}
    </button>
  {/if}
</main>

<style>
  :global(body) {
    overflow: auto;
  }
  main {
    max-width: 900px;
    margin: 0 auto;
    padding: 16px 16px 60px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  h1 {
    font-size: 16px;
    margin: 0;
  }
  .pink {
    color: var(--pink);
  }
  section {
    padding-top: 14px;
  }
  p {
    margin: 0 0 8px;
  }
  code {
    color: var(--yellow);
  }
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 240px 110px;
    gap: 10px;
    align-items: center;
    padding: 1px 0 1px 6px;
    border-left: 2px solid transparent;
    border-bottom: 1px solid var(--bg-dark);
  }
  .row:focus-within {
    background: var(--bg-darker);
    border-left-color: var(--pink);
  }
  .row:focus-within .desc {
    color: var(--pink);
  }
  .row.custom .desc {
    color: var(--cyan);
  }
  .key {
    color: var(--pink);
    border-bottom: 1px solid var(--cur);
    padding: 0 4px;
  }
  .key:focus {
    background: var(--cur);
    color: var(--yellow);
    border-bottom-color: var(--yellow);
  }
  .toolbar {
    display: flex;
    gap: 10px;
    margin: 6px 0;
  }
  .filter {
    border-bottom: 1px solid var(--comment);
  }
  .filter:focus {
    border-bottom-color: var(--pink);
  }
  button {
    white-space: nowrap;
    font: inherit;
    color: var(--fg);
    background: var(--cur);
    border: 1px solid var(--comment);
    padding: 0 8px;
    cursor: pointer;
  }
  button:focus {
    outline: none;
    border-color: var(--pink);
    color: var(--pink);
  }
  button.rec {
    background: var(--red);
    color: var(--bg);
  }
  .conflict {
    grid-column: 1 / -1;
    color: var(--orange);
    font-size: 12px;
  }
  .error-line {
    grid-column: 1 / -1;
    color: var(--red);
    font-size: 12px;
  }
  .bad {
    max-height: 200px;
    color: var(--purple);
  }
  .ok {
    color: var(--green);
  }
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .check input {
    width: auto;
    accent-color: var(--pink);
  }
  .status {
    position: fixed;
    bottom: 12px;
    right: 14px;
    max-width: calc(100vw - 28px);
    white-space: normal;
    text-align: left;
    color: var(--green);
    background: var(--bg-dark);
    border: 1px solid var(--green);
    padding: 4px 10px;
  }
  .status.error {
    color: var(--red);
    border-color: var(--red);
  }
</style>
