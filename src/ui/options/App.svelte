<script lang="ts">
  import { onMount } from 'svelte';
  import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../../adapter/browser';
  import { ACTIONS, DEFAULT_BINDINGS, eventToKey, type Action } from '../../core/keymap';

  let settings = $state<Settings>(DEFAULT_SETTINGS);
  let commands = $state<browser.commands.Command[]>([]);
  let filter = $state('');
  let status = $state('');
  let recording = $state<Action | null>(null);

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

  onMount(async () => {
    settings = await loadSettings();
    commands = await browser.commands.getAll();
  });

  function flash(s: string) {
    status = s;
    setTimeout(() => status === s && (status = ''), 2500);
  }

  async function setBinding(a: Action, value: string) {
    const keys = value.split(/\s+/).filter(Boolean);
    const bindings = { ...settings.bindings };
    if (keys.join(' ') === DEFAULT_BINDINGS[a].join(' ')) delete bindings[a];
    else bindings[a] = keys;
    settings = await saveSettings({ bindings });
    flash(`saved ${a}`);
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

  async function setCommand(name: string, shortcut: string) {
    try {
      if (shortcut.trim()) await browser.commands.update({ name, shortcut: shortcut.trim() });
      else await browser.commands.reset(name);
      commands = await browser.commands.getAll();
      flash(`shortcut for ${name} saved`);
    } catch (e) {
      flash(`invalid shortcut: ${(e as Error).message}`);
    }
  }
</script>

<main>
  <h1><span class="pink">romeli</span> <span class="dim">· settings</span></h1>

  <section class="box">
    <span class="box-title">global shortcuts</span>
    <p class="dim">
      Firefox format, e.g. <code>Alt+Shift+M</code> or <code>Ctrl+Alt+K</code>. Empty resets to default. Also editable at
      about:addons → ⚙ → Manage Extension Shortcuts.
    </p>
    {#each commands as c}
      <label class="row">
        <span class="desc">{c.description}</span>
        <input
          class="key"
          value={c.shortcut ?? ''}
          spellcheck="false"
          onchange={(e) => setCommand(c.name!, e.currentTarget.value)}
        />
      </label>
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
        <label class="row" class:custom={!!settings.bindings[a]}>
          <span class="desc">{ACTIONS[a]}</span>
          <input
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
        </label>
      {/each}
    </div>
  </section>
  {#if status}<div class="status">{status}</div>{/if}
</main>

<style>
  :global(body) {
    overflow: auto;
  }
  main {
    max-width: 900px;
    margin: 0 auto;
    padding: 16px;
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
    grid-template-columns: minmax(0, 1fr) 240px 90px;
    gap: 10px;
    align-items: center;
    padding: 1px 0;
    border-bottom: 1px solid var(--bg-dark);
  }
  .row:focus-within {
    background: var(--cur);
  }
  .row.custom .desc {
    color: var(--cyan);
  }
  .key {
    color: var(--pink);
    border-bottom: 1px solid var(--cur);
  }
  .toolbar {
    display: flex;
    gap: 10px;
    margin-bottom: 6px;
  }
  .filter {
    border-bottom: 1px solid var(--comment);
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
    outline: 1px solid var(--pink);
  }
  button.rec {
    background: var(--red);
  }
  .conflict {
    grid-column: 1 / -1;
    color: var(--orange);
    font-size: 12px;
  }
  .status {
    position: fixed;
    bottom: 10px;
    right: 14px;
    color: var(--green);
  }
</style>
