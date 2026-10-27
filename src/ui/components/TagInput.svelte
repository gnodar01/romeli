<script lang="ts">
  import { applyCompletion, complete, type CompletionState } from '../../core/complete';
  import type { Model } from '../../core/model';
  import Highlight from './Highlight.svelte';

  let {
    model,
    value = $bindable(''),
    input = $bindable<HTMLInputElement | undefined>(),
    placeholder = 'media/blogs/tech/, programming languages/python/',
  }: {
    model: Model;
    value?: string;
    input?: HTMLInputElement;
    placeholder?: string;
  } = $props();

  let caret = $state(0);
  let sel = $state(0);
  let focused = $state(false);
  let dismissed = $state(false);
  let list = $state<HTMLElement>();

  const comp: CompletionState = $derived(complete(model, value, caret));
  const open = $derived(focused && !dismissed && comp.items.length > 0);

  $effect(() => {
    // keep the highlighted row in range / in view
    if (sel >= comp.items.length) sel = 0;
    list?.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  });

  function sync() {
    caret = input?.selectionStart ?? value.length;
  }

  function accept() {
    const c = comp.items[sel];
    if (!c) return;
    const r = applyCompletion(value, comp, c);
    value = r.value;
    sel = 0;
    queueMicrotask(() => {
      input?.setSelectionRange(r.caret, r.caret);
      sync();
    });
  }

  function onkeydown(e: KeyboardEvent) {
    const ctrl = e.ctrlKey && !e.altKey && !e.metaKey;
    if (e.key === 'Tab' && !e.shiftKey && open) {
      e.preventDefault();
      accept();
    } else if (open && (e.key === 'ArrowDown' || (ctrl && e.key === 'n'))) {
      e.preventDefault();
      sel = (sel + 1) % comp.items.length;
    } else if (open && (e.key === 'ArrowUp' || (ctrl && e.key === 'p'))) {
      e.preventDefault();
      sel = (sel - 1 + comp.items.length) % comp.items.length;
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      dismissed = true;
    } else if (ctrl && e.key === 'w') {
      // delete back to the previous '/' or ','
      e.preventDefault();
      const pos = input?.selectionStart ?? value.length;
      const trimmed = value
        .slice(0, pos)
        .replace(/[\s/,]+$/, '')
        .replace(/[^/,]*$/, '');
      value = trimmed + value.slice(pos);
      queueMicrotask(() => {
        input?.setSelectionRange(trimmed.length, trimmed.length);
        sync();
      });
    }
  }
</script>

<div class="tag-input">
  <input
    bind:this={input}
    bind:value
    {placeholder}
    spellcheck="false"
    autocomplete="off"
    oninput={() => {
      dismissed = false;
      sel = 0;
      sync();
    }}
    onkeydown={onkeydown}
    onkeyup={sync}
    onclick={sync}
    onfocus={() => {
      focused = true;
      sync();
    }}
    onblur={() => (focused = false)}
  />
  {#if open}
    <div class="completions scroll" bind:this={list}>
      {#each comp.items as c, i}
        <div class="row" class:sel={i === sel} class:new={c.isNew}>
          {#if c.isNew}
            {c.label} <span class="badge">[new]</span>
          {:else}
            <Highlight text={c.label} positions={c.positions} />
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .tag-input {
    position: relative;
  }
  .completions {
    position: absolute;
    left: -10px;
    right: -10px;
    top: calc(var(--row) + 6px);
    max-height: calc(var(--row) * 8 + 2px);
    border: 1px solid var(--border);
    background: var(--popup-bg);
    z-index: 5;
  }
  .row {
    padding: 0 10px;
    color: var(--tag);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row.new {
    color: var(--tag-new);
  }
  .row.sel {
    background: var(--line-bg);
  }
  .badge {
    color: var(--dim);
  }
</style>
