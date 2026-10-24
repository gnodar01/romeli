<script lang="ts">
  import { onMount } from 'svelte';
  import type { ConfirmLine } from '../browser/view';

  let { title, lines = [], onAnswer }: { title: string; lines?: ConfirmLine[]; onAnswer: (yes: boolean) => void } = $props();
  let el = $state<HTMLElement>();

  onMount(() => el?.focus());

  function onkeydown(e: KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'y' || e.key === 'Y') onAnswer(true);
    else if (['n', 'N', 'Escape', 'q', 'Enter'].includes(e.key)) onAnswer(false);
  }
</script>

<div class="overlay-backdrop">
  <div class="box confirm" tabindex="-1" role="alertdialog" bind:this={el} {onkeydown}>
    <span class="box-title">{title}</span>
    <div class="lines scroll">
      {#each lines as l}
        {#if typeof l === 'string'}
          <div class="line">{l}</div>
        {:else}
          <div class="entry">
            <div class="line">{l.text}</div>
            {#if l.sub}<div class="line sub" class:warn={l.warn}>{l.sub}</div>{/if}
          </div>
        {/if}
      {/each}
    </div>
    <div class="answer"><span class="y">y</span> yes · <span class="n">N</span> no</div>
  </div>
</div>

<style>
  .confirm {
    width: min(520px, calc(100vw - 24px));
    padding-top: 12px;
    outline: none;
    border-color: var(--red);
  }
  .confirm .box-title {
    color: var(--red);
  }
  .lines {
    max-height: 40vh;
  }
  .line {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .entry + .entry {
    margin-top: 4px;
  }
  .sub {
    padding-left: 2ch;
    color: var(--comment);
  }
  .sub.warn {
    color: var(--orange);
  }
  .answer {
    margin-top: 8px;
    color: var(--comment);
    text-align: right;
  }
  .y {
    color: var(--green);
  }
  .n {
    color: var(--red);
  }
</style>
