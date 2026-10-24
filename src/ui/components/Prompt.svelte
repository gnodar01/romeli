<script lang="ts">
  import { onMount, untrack } from 'svelte';

  let {
    title,
    value = '',
    hint = '',
    onInput,
    onSubmit,
    onCancel,
  }: {
    title: string;
    value?: string;
    hint?: string;
    onInput?: (v: string) => void;
    onSubmit: (v: string) => void;
    onCancel: () => void;
  } = $props();

  let v = $state(untrack(() => value));
  let input = $state<HTMLInputElement>();

  onMount(() => {
    input?.focus();
    input?.setSelectionRange(v.length, v.length);
  });

  function onkeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit(v);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.ctrlKey && e.key === 'u') {
      e.preventDefault();
      v = '';
      onInput?.(v);
    }
  }
</script>

<div class="overlay-backdrop">
  <div class="box prompt">
    <span class="box-title">{title}</span>
    <input bind:this={input} bind:value={v} spellcheck="false" {onkeydown} oninput={() => onInput?.(v)} />
    {#if hint}<div class="dim hint">{hint}</div>{/if}
  </div>
</div>

<style>
  .prompt {
    width: min(520px, calc(100vw - 24px));
    padding-top: 10px;
  }
  .hint {
    font-size: var(--font-size-sm);
    margin-top: 4px;
  }
</style>
