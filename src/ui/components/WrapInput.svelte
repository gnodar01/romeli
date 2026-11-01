<script lang="ts">
  import { onMount } from 'svelte';

  /**
   * A single-line text field that wraps long values onto more lines instead of scrolling them out
   * of view (a textarea that grows with its content; newlines are never inserted). The owner
   * handles Enter in `onkeydown`.
   */
  let {
    value = $bindable(''),
    el = $bindable(),
    placeholder = '',
    onkeydown,
    oninput,
  }: {
    value?: string;
    el?: HTMLTextAreaElement;
    placeholder?: string;
    onkeydown?: (e: KeyboardEvent) => void;
    oninput?: () => void;
  } = $props();

  function fit() {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  onMount(fit);
  $effect(() => {
    void value;
    fit();
  });

  function keydown(e: KeyboardEvent) {
    onkeydown?.(e);
    if (e.key === 'Enter' && !e.defaultPrevented) e.preventDefault();
  }

  function input() {
    if (value.includes('\n')) value = value.replace(/\s*\n\s*/g, ' ');
    oninput?.();
  }
</script>

<textarea bind:this={el} bind:value rows="1" spellcheck="false" {placeholder} onkeydown={keydown} oninput={input}></textarea>

<style>
  textarea {
    display: block;
    flex: 1;
    min-width: 0;
    width: 100%;
    font: inherit;
    color: var(--fg);
    background: transparent;
    border: none;
    outline: none;
    padding: 0;
    margin: 0;
    resize: none;
    overflow: hidden;
    overflow-wrap: anywhere;
    caret-color: var(--caret);
  }
</style>
