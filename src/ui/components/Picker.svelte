<script lang="ts" generics="T">
  import { onMount } from 'svelte';
  import type { PickerRow } from '../browser/view';
  import Highlight from './Highlight.svelte';

  let {
    title,
    placeholder = '',
    search,
    onPick,
    onCancel,
  }: {
    title: string;
    placeholder?: string;
    search: (q: string) => PickerRow<T>[];
    onPick: (v: T) => void;
    onCancel: () => void;
  } = $props();

  let q = $state('');
  let sel = $state(0);
  let input = $state<HTMLInputElement>();
  let list = $state<HTMLElement>();
  const rows = $derived(search(q).slice(0, 200));

  onMount(() => input?.focus());

  $effect(() => {
    if (sel >= rows.length) sel = Math.max(0, rows.length - 1);
    list?.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  });

  function onkeydown(e: KeyboardEvent) {
    e.stopPropagation();
    const ctrl = e.ctrlKey && !e.altKey;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (rows[sel]) onPick(rows[sel].value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'ArrowDown' || (ctrl && (e.key === 'n' || e.key === 'j')) || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      sel = Math.min(rows.length - 1, sel + 1);
    } else if (e.key === 'ArrowUp' || (ctrl && (e.key === 'p' || e.key === 'k')) || (e.key === 'Tab' && e.shiftKey)) {
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
      <input bind:this={input} bind:value={q} {placeholder} spellcheck="false" oninput={() => (sel = 0)} {onkeydown} />
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
  </div>
</div>

<style>
  .picker {
    width: min(760px, calc(100vw - 24px));
    padding-top: 10px;
  }
  .query {
    display: flex;
    gap: 8px;
    border-bottom: 1px solid var(--cur);
    padding-bottom: 4px;
    margin-bottom: 4px;
  }
  .prompt {
    color: var(--pink);
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
    color: var(--purple);
  }
  .row.sel {
    background: var(--cur);
  }
  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sub {
    flex: 0 1 45%;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--comment);
    text-align: right;
  }
</style>
