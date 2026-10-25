<script lang="ts">
  import { onMount } from 'svelte';
  import { applyTheme, cssColorToHex as toHex, isCssColor, loadTheme, saveTheme } from '../../adapter/browser';
  import {
    applyPreset,
    DEFAULT_FONT,
    DEFAULT_FONT_SIZE,
    DEFAULT_ROW,
    fullTheme,
    PALETTE,
    PALETTE_KEYS,
    paletteValue,
    PRESETS,
    resolveRole,
    ROLE_GROUPS,
    ROLES,
    sanitizeTheme,
    type PaletteKey,
    type RoleKey,
    type Theme,
  } from '../../core/theme';

  let { flash }: { flash: (text: string, error?: boolean) => void } = $props();

  let theme = $state.raw<Theme>({});
  let json = $state('');
  let roleFilter = $state('');

  const fmt = (t: Theme) => JSON.stringify(fullTheme(t), null, 2);
  const isPaletteKey = (v: string): v is PaletteKey => Object.hasOwn(PALETTE, v);

  onMount(async () => {
    theme = await loadTheme();
    json = fmt(theme);
  });

  async function commit(next: Theme, label: string) {
    theme = await saveTheme(next);
    json = fmt(theme);
    flash(label);
  }

  function withPalette(k: PaletteKey, v: string | undefined): Theme {
    const palette = { ...theme.palette };
    if (v) palette[k] = v;
    else delete palette[k];
    return { ...theme, palette };
  }

  function withRole(k: RoleKey, v: string | undefined): Theme {
    const roles = { ...theme.roles };
    if (v) roles[k] = v;
    else delete roles[k];
    return { ...theme, roles };
  }

  function setPalette(k: PaletteKey, raw: string) {
    const v = raw.trim();
    if (v && (isPaletteKey(v) || !isCssColor(v))) return flash(`"${v}" is not a CSS color`, true);
    void commit(withPalette(k, v || undefined), `palette ${k}: ${v || 'default'}`);
  }

  function setRole(k: RoleKey, raw: string) {
    const v = raw.trim();
    if (v && !isPaletteKey(v) && !isCssColor(v)) return flash(`"${v}" is neither a palette color nor a CSS color`, true);
    void commit(withRole(k, v || undefined), `${k}: ${v || 'default'}`);
  }

  function setNumber(key: 'fontSize' | 'row', raw: string) {
    const n = Number(raw);
    void commit({ ...theme, [key]: raw.trim() && Number.isFinite(n) ? n : undefined }, `${key === 'row' ? 'row height' : 'font size'} saved`);
  }

  function importJson() {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch (e) {
      return flash(`invalid JSON: ${(e as Error).message}`, true);
    }
    const { theme: next, problems } = sanitizeTheme(raw, isCssColor);
    void commit(next, 'theme imported').then(() => problems.length && flash(`imported, ignoring: ${problems.join('; ')}`, true));
  }

  async function copyJson() {
    await navigator.clipboard.writeText(json);
    flash('theme JSON copied');
  }

  const roleShown = (k: string, label: string) => {
    const q = roleFilter.toLowerCase();
    return !q || k.includes(q) || label.toLowerCase().includes(q) || (theme.roles?.[k as RoleKey] ?? ROLES[k as RoleKey].default).includes(q);
  };
</script>

<datalist id="palette-keys">
  {#each PALETTE_KEYS as k}<option value={k}></option>{/each}
</datalist>

<section class="box">
  <span class="box-title">theme</span>
  <p class="dim">
    Edit the palette to retheme everything at once, or point individual roles (below) at another palette color or any
    CSS color. Changes apply immediately to every romeli window and sync with your other settings.
  </p>

  <div class="preview" aria-hidden="true">
    <div class="p-head">
      <span><span class="p-root">/</span><span class="p-cwd">linux</span><span class="p-sep">/</span><span class="p-leaf">terminal</span></span>
      <span><span class="p-tab active">1</span><span class="p-tab">2</span></span>
    </div>
    <div class="p-cols">
      <div class="p-col">
        <div class="p-row p-tag p-line"><i class="p-mark"></i><span class="p-icon">▸</span><span>linux</span></div>
        <div class="p-row p-tag"><i class="p-mark"></i><span class="p-icon">▸</span><span>music</span></div>
      </div>
      <div class="p-col">
        <div class="p-row p-tag p-cursor"><i class="p-mark"></i><span class="p-icon">▸</span><span>ker<b>n</b>el</span></div>
        <div class="p-row p-tag p-sel"><i class="p-mark"></i><span class="p-icon">▸</span><span>terminal</span></div>
        <div class="p-row p-yank"><i class="p-mark"></i><span class="p-icon">·</span><span>Arch <span class="p-match">Wiki</span></span></div>
        <div class="p-row p-cut"><i class="p-mark"></i><span class="p-icon">·</span><span><s>Hacker News</s></span></div>
        <div class="p-row p-cursor p-item"><i class="p-mark"></i><span class="p-icon">·</span><span>Alacritty</span></div>
      </div>
      <div class="p-col p-pad">
        <div class="p-title">Alacritty</div>
        <div class="p-url">https://alacritty.org</div>
        <div class="p-accent">tags</div>
        <div class="p-tagrow"><span class="p-star">★</span>linux/terminal</div>
        <div class="p-tagrow"><span class="p-star"></span><span class="p-new">tool/new</span></div>
      </div>
    </div>
    <div class="p-foot">
      <span class="p-mode">NOR</span><span class="p-mode vis">VIS</span><span class="p-mode sel">SEL</span>
      <span class="p-ok">saved</span><span class="p-warn">warning</span><span class="p-err">error</span>
      <span class="spacer"></span>
      <span class="p-b yank">y2</span><span class="p-b cut">x1</span><span class="p-b sel">v3</span><span class="p-b find">/wiki</span
      ><span class="p-b filter">filter</span><span class="p-pos">[3/9]</span>
    </div>
  </div>

  <div class="toolbar wrap">
    <span class="dim">preset</span>
    {#each PRESETS as p}
      <button onclick={() => commit(applyPreset(theme, p), `preset: ${p.name}`)}>{p.name}</button>
    {/each}
    <span class="spacer"></span>
    <button onclick={() => commit({}, 'theme reset to Dracula')}>reset theme</button>
  </div>
  <p class="dim">
    Presets replace the palette; role overrides, font and row height are kept. Scrollbars and other native controls
    switch to light or dark to match the background.
  </p>

  <h2>font</h2>
  <div class="row" class:custom={!!theme.font}>
    <label class="desc" for="font">font family <span class="dim">(CSS list)</span></label>
    <input
      id="font"
      class="key wide"
      value={theme.font ?? DEFAULT_FONT}
      spellcheck="false"
      onchange={(e) => commit({ ...theme, font: e.currentTarget.value.trim() || undefined }, 'font saved')}
    />
  </div>
  <div class="row" class:custom={theme.fontSize !== undefined}>
    <label class="desc" for="font-size">font size (px)</label>
    <input id="font-size" class="key" type="number" min="8" max="32" value={theme.fontSize ?? DEFAULT_FONT_SIZE} onchange={(e) => setNumber('fontSize', e.currentTarget.value)} />
    <span></span>
  </div>
  <div class="row" class:custom={theme.row !== undefined}>
    <label class="desc" for="row-height">row height (px)</label>
    <input id="row-height" class="key" type="number" min="12" max="48" value={theme.row ?? DEFAULT_ROW} onchange={(e) => setNumber('row', e.currentTarget.value)} />
    <span></span>
  </div>

  <h2>palette</h2>
  {#each PALETTE_KEYS as k (k)}
    {@const v = paletteValue(theme, k)}
    <div class="row color" class:custom={!!theme.palette?.[k]}>
      <label class="desc" for="pal-{k}">{k}</label>
      <input
        type="color"
        tabindex="-1"
        value={toHex(v)}
        oninput={(e) => applyTheme(withPalette(k, e.currentTarget.value))}
        onchange={(e) => setPalette(k, e.currentTarget.value)}
      />
      <input id="pal-{k}" class="key" value={v} spellcheck="false" onchange={(e) => setPalette(k, e.currentTarget.value)} />
      <button disabled={!theme.palette?.[k]} onclick={() => setPalette(k, '')}>reset</button>
    </div>
  {/each}

  <h2>roles</h2>
  <p class="dim">A palette name (<code>purple</code>) follows the palette; a CSS color (<code>#ff0000</code>, <code>rgb(…)</code>) is fixed.</p>
  <div class="toolbar">
    <input class="filter" placeholder="filter roles…" bind:value={roleFilter} spellcheck="false" />
    <button disabled={!theme.roles} onclick={() => commit({ ...theme, roles: undefined }, 'roles reset')}>reset roles</button>
  </div>
  {#each Object.entries(ROLE_GROUPS) as [group, roles] (group)}
    {@const shown = Object.entries(roles).filter(([k, d]) => roleShown(k, d.label))}
    {#if shown.length}
      <h3>{group}</h3>
      {#each shown as [k, d] (k)}
        {@const key = k as RoleKey}
        <div class="row color" class:custom={!!theme.roles?.[key]}>
          <label class="desc" for="role-{k}">{d.label} <span class="dim">--{k}</span></label>
          <input
            type="color"
            tabindex="-1"
            value={toHex(resolveRole(theme, key))}
            oninput={(e) => applyTheme(withRole(key, e.currentTarget.value))}
            onchange={(e) => setRole(key, e.currentTarget.value)}
          />
          <input
            id="role-{k}"
            class="key"
            list="palette-keys"
            value={theme.roles?.[key] ?? d.default}
            spellcheck="false"
            onchange={(e) => setRole(key, e.currentTarget.value)}
          />
          <button disabled={!theme.roles?.[key]} onclick={() => setRole(key, '')}>reset</button>
        </div>
      {/each}
    {/if}
  {/each}

  <h2>JSON</h2>
  <p class="dim">The whole theme, for sharing or backup. Edit or paste, then apply; omitted keys fall back to the defaults.</p>
  <textarea class="json scroll" bind:value={json} spellcheck="false" rows="12"></textarea>
  <div class="toolbar">
    <button onclick={importJson}>apply JSON</button>
    <button onclick={copyJson}>copy</button>
    <button onclick={() => (json = fmt(theme))}>revert</button>
  </div>
</section>

<style>
  h3 {
    font-size: inherit;
    font-weight: normal;
    color: var(--dim);
    margin: 8px 0 2px;
  }
  .wrap {
    flex-wrap: wrap;
    align-items: center;
  }
  .spacer {
    flex: 1;
  }
  .row.color {
    grid-template-columns: minmax(0, 1fr) 28px 202px 110px;
  }
  .row .wide {
    grid-column: 2 / -1;
  }
  input[type='color'] {
    width: 28px;
    height: calc(var(--row) - 4px);
    padding: 0;
    border: 1px solid var(--border);
    background: none;
    cursor: pointer;
  }
  input[type='number'] {
    appearance: textfield;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  /* --- preview: a static miniature of the browser window, drawn with the same roles */
  .preview {
    border: 1px solid var(--divider);
    margin: 4px 0 10px;
    user-select: none;
  }
  .p-head,
  .p-foot {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    white-space: nowrap;
    overflow: hidden;
  }
  .p-head {
    padding: 0 8px;
    border-bottom: 1px solid var(--divider);
  }
  .p-root {
    color: var(--path-root);
  }
  .p-sep {
    color: var(--path-sep);
  }
  .p-cwd {
    color: var(--path-cwd);
    font-weight: bold;
  }
  .p-leaf {
    color: var(--path-leaf);
  }
  .p-tab {
    padding: 0 8px;
    color: var(--tab);
  }
  .p-tab.active {
    background: var(--tab-active-bg);
    color: var(--tab-active-fg);
  }
  .p-cols {
    display: grid;
    grid-template-columns: 1fr 3fr 3fr;
    border-bottom: 1px solid var(--divider);
  }
  .p-col {
    padding: 2px 0;
    min-width: 0;
  }
  .p-col + .p-col {
    border-left: 1px solid var(--divider);
  }
  .p-pad {
    padding: 2px 12px;
  }
  .p-row {
    display: flex;
    gap: 6px;
    height: var(--row);
    align-items: center;
    white-space: nowrap;
    overflow: hidden;
  }
  .p-mark {
    width: 3px;
    align-self: stretch;
  }
  .p-icon {
    width: 16px;
    text-align: center;
    color: var(--dim);
  }
  .p-tag,
  .p-tag .p-icon {
    color: var(--tag);
  }
  .p-line {
    background: var(--line-bg);
  }
  .p-cursor {
    background: var(--cursor-tag-bg);
  }
  .p-cursor,
  .p-cursor .p-icon {
    color: var(--cursor-fg);
  }
  .p-cursor b {
    font-weight: inherit;
    text-decoration: underline;
  }
  .p-cursor.p-item {
    background: var(--cursor-item-bg);
  }
  .p-sel {
    color: var(--selected);
  }
  .p-sel .p-mark {
    background: var(--selected);
  }
  .p-yank .p-mark {
    background: var(--mark-yank);
  }
  .p-cut .p-mark {
    background: var(--mark-cut);
  }
  .p-cut s {
    text-decoration-color: var(--mark-cut);
  }
  .p-match {
    background: var(--find-bg);
    color: var(--find-fg);
  }
  .p-title {
    color: var(--title);
    font-weight: bold;
  }
  .p-url {
    color: var(--url);
  }
  .p-accent {
    color: var(--accent);
    margin-top: 6px;
  }
  .p-tagrow {
    color: var(--tag);
  }
  .p-star {
    color: var(--star);
    display: inline-block;
    width: 2ch;
  }
  .p-new {
    color: var(--tag-new);
  }
  .p-foot {
    justify-content: flex-start;
    padding-right: 8px;
  }
  .p-mode {
    background: var(--mode-normal);
    color: var(--mode-fg);
    padding: 0 8px;
    font-weight: bold;
  }
  .p-mode.vis {
    background: var(--mode-visual);
  }
  .p-mode.sel {
    background: var(--mode-select);
  }
  .p-ok {
    color: var(--ok);
  }
  .p-warn {
    color: var(--warn);
  }
  .p-err {
    color: var(--error);
  }
  .p-b.yank {
    color: var(--badge-yank);
  }
  .p-b.cut {
    color: var(--badge-cut);
  }
  .p-b.sel {
    color: var(--badge-select);
  }
  .p-b.find {
    color: var(--badge-find);
  }
  .p-b.filter {
    color: var(--badge-filter);
  }
  .p-pos {
    color: var(--position);
  }
</style>
