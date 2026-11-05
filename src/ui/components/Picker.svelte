<script lang="ts" generics="T">
  import { onMount, untrack } from 'svelte';
  import { deleteBackSegment } from '../../core/complete';
  import { inputAction, type Bindings } from '../../core/keymap';
  import type { PickerRow } from '../browser/view';
  import Highlight from './Highlight.svelte';
  import WrapInput from './WrapInput.svelte';

  let {
    title,
    value = '',
    placeholder = '',
    hint = '',
    search,
    bindings,
    deleteBack = deleteBackSegment,
    onPick,
    onCancel,
  }: {
    title: string;
    /** Initial query. */
    value?: string;
    placeholder?: string;
    hint?: string;
    search: (q: string) => PickerRow<T>[];
    /** For the text-input actions (complete, deleteBack). */
    bindings: Bindings;
    /** The query before the caret → what deleteBack leaves of it. */
    deleteBack?: (before: string) => string;
    /** `alt` is true for Shift+Enter. */
    onPick: (v: T, alt: boolean) => void;
    onCancel: () => void;
  } = $props();

  let q = $state(untrack(() => value));
  let sel = $state(0);
  let input = $state<HTMLTextAreaElement>();
  let list = $state<HTMLElement>();
  const rows = $derived(search(q).slice(0, 200));

  onMount(() => {
    input?.focus();
    input?.setSelectionRange(q.length, q.length);
  });

  $effect(() => {
    if (sel >= rows.length) sel = Math.max(0, rows.length - 1);
    list?.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  });

  /** Tab: fill the query with the highlighted row's label, keeping that row highlighted. */
  function complete() {
    const r = rows[sel];
    if (!r) return;
    q = r.label;
    sel = Math.max(0, rows.findIndex((x) => x.key === r.key));
    queueMicrotask(() => input?.setSelectionRange(q.length, q.length));
  }

  function deleteBackQuery() {
    const pos = input?.selectionStart ?? q.length;
    const kept = deleteBack(q.slice(0, pos));
    q = kept + q.slice(pos);
    sel = 0;
    queueMicrotask(() => input?.setSelectionRange(kept.length, kept.length));
  }

  function onkeydown(e: KeyboardEvent) {
    e.stopPropagation();
    const ctrl = e.ctrlKey && !e.altKey;
    const act = inputAction(bindings, e);
    if (act) {
      e.preventDefault();
      if (act === 'complete') complete();
      else deleteBackQuery();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (rows[sel]) onPick(rows[sel].value, e.shiftKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Tab') {
      e.preventDefault(); // keep focus in the query
    } else if (e.key === 'ArrowDown' || (ctrl && (e.key === 'n' || e.key === 'j'))) {
      e.preventDefault();
      sel = Math.min(rows.length - 1, sel + 1);
    } else if (e.key === 'ArrowUp' || (ctrl && (e.key === 'p' || e.key === 'k'))) {
      e.preventDefault();
      sel = Math.max(0, sel - 1);
    } else if (ctrl && e.key === 'u') {
      e.preventDefault();
      q = '';
    }
  }
</script>

<div class="overlay-backdrop">
  <div class="box picker">
    <span class="box-title">{title}</span>
    <div class="query">
      <span class="prompt">❯</span>
      <WrapInput bind:el={input} bind:value={q} {placeholder} oninput={() => (sel = 0)} {onkeydown} />
      <span class="dim count">{rows.length}</span>
    </div>
    <div class="rows scroll" bind:this={list}>
      {#each rows as r, i (r.key)}
        <div class="row {r.kind ?? ''}" class:sel={i === sel}>
          <span class="label"><Highlight text={r.label} positions={r.positions} /></span>
          {#if r.sub}<span class="sub">{r.sub}</span>{/if}
        </div>
      {:else}
        <div class="dim">no matches</div>
      {/each}
    </div>
    {#if hint}<div class="hint dim">{hint}</div>{/if}
  </div>
</div>

<style>
  .picker {
    width: min(760px, calc(100vw - 24px));
    padding-top: 10px;
  }
  .query {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    border-bottom: 1px solid var(--divider);
    padding-bottom: 4px;
    margin-bottom: 4px;
  }
  .prompt {
    color: var(--accent);
  }
  .hint {
    margin-top: 4px;
    font-size: var(--font-size-sm);
    border-top: 1px solid var(--divider);
    padding-top: 2px;
  }
  .rows {
    max-height: 55vh;
  }
  .row {
    display: flex;
    gap: 12px;
    padding: 0 6px;
    white-space: nowrap;
  }
  .row.tag .label {
    color: var(--tag);
  }
  .row.sel {
    background: var(--line-bg);
  }
  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* The selected row shows its whole label, continuation lines indented. */
  .row.sel .label {
    white-space: normal;
    overflow-wrap: anywhere;
    padding-left: 2ch;
    text-indent: -2ch;
  }
  .row.sel {
    align-items: flex-start;
  }
  .sub {
    flex: 0 0 auto;
    max-width: 45%;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--dim);
    text-align: right;
  }
</style>
