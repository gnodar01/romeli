<script lang="ts">
  import { onMount } from 'svelte';
  import { ACTIONS, ACTION_GROUPS, type Bindings } from '../../core/keymap';

  let { bindings, onClose }: { bindings: Bindings; onClose: () => void } = $props();

  let body = $state<HTMLElement>();
  let lastG = 0;
  const ROW = 20;

  onMount(() => body?.focus());

  /** j/k: line · J/K: half page · gg/G: ends · Esc/q/?: close */
  function onkeydown(e: KeyboardEvent) {
    if (!body) return;
    e.stopPropagation();
    const half = Math.max(ROW, Math.floor(body.clientHeight / 2));
    const scroll = (dy: number) => {
      e.preventDefault();
      body!.scrollBy({ top: dy });
    };
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if (e.ctrlKey && e.key === 'd') scroll(half);
      else if (e.ctrlKey && e.key === 'u') scroll(-half);
      return;
    }
    switch (e.key) {
      case 'j':
      case 'ArrowDown':
        return scroll(ROW);
      case 'k':
      case 'ArrowUp':
        return scroll(-ROW);
      case 'J':
      case 'PageDown':
        return scroll(half);
      case 'K':
      case 'PageUp':
        return scroll(-half);
      case 'G':
      case 'End':
        return scroll(body.scrollHeight);
      case 'Home':
        return scroll(-body.scrollHeight);
      case 'g':
        if (Date.now() - lastG < 600) scroll(-body.scrollHeight);
        lastG = Date.now();
        return;
      case 'Escape':
      case 'q':
      case '?':
      case '~':
      case 'F1':
        e.preventDefault();
        return onClose();
    }
  }
</script>

<div class="overlay-backdrop">
  <div class="box help">
    <span class="box-title">keys</span>
    <div class="body scroll" role="dialog" aria-label="keyboard shortcuts" tabindex="-1" bind:this={body} {onkeydown}>
      <div class="cols">
      {#each ACTION_GROUPS as [group, actions]}
        <section>
          <div class="group">{group}</div>
          {#each actions as a}
            <div class="row">
              <span class="keys">
                {#each bindings[a] as k}<span class="k">{k}</span>{:else}<span class="dim">—</span>{/each}
              </span>
              <span class="desc">{ACTIONS[a]}</span>
            </div>
          {/each}
        </section>
      {/each}
      </div>
    </div>
    <div class="foot dim">j/k scroll · J/K half page · gg/G ends · Esc close</div>
  </div>
</div>

<style>
  .help {
    width: min(980px, calc(100vw - 24px));
    padding-top: 12px;
  }
  .overlay-backdrop {
    padding-top: 4vh;
  }
  .body {
    height: min(78vh, 720px);
    outline: none;
  }
  .cols {
    columns: 2 400px;
    column-gap: 28px;
  }
  section {
    break-inside: avoid;
    margin-bottom: 10px;
  }
  .group {
    color: var(--accent);
    border-bottom: 1px solid var(--divider);
    margin-bottom: 2px;
  }
  .row {
    display: flex;
    gap: 12px;
  }
  .keys {
    flex: none;
    width: 20ch;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .k {
    color: var(--key);
  }
  .k + .k {
    margin-left: 1.5ch;
  }
  .desc {
    min-width: 0;
  }
  .foot {
    margin-top: 6px;
    font-size: var(--font-size-sm);
    text-align: right;
  }
</style>
