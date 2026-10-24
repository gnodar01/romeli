<script lang="ts">
  import { onMount } from 'svelte';

  let { title, lines = [], onAnswer }: { title: string; lines?: string[]; onAnswer: (yes: boolean) => void } = $props();
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
      {#each lines as l}<div class="line">{l}</div>{/each}
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
