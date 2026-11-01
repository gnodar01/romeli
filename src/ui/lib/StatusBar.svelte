<script lang="ts">
  import type { Badge } from '../browser/view';
  import type { Flash } from './overlays.svelte';
  import type { Mode } from './listNav.svelte';

  let {
    mode,
    message,
    info,
    badges,
    pos,
  }: {
    mode: Mode;
    message: Flash['message'];
    /** Shown when there is no message: a URL, or a dim hint such as the hovered tag's path. */
    info?: { text: string; kind: 'url' | 'dim' };
    badges: (Badge | false | null | undefined)[];
    pos: string;
  } = $props();
</script>

<footer>
  <span class="mode {mode.toLowerCase()}">{mode}</span>
  {#if message}
    <span class="msg {message.kind}">{message.text}</span>
  {:else if info}
    <span class={info.kind}>{info.text}</span>
  {/if}
  <span class="spacer"></span>
  {#each badges as b}
    {#if b}<span class="badge {b.kind}">{b.text}</span>{/if}
  {/each}
  <span class="pos">{pos}</span>
</footer>

<style>
  footer {
    display: flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
    overflow: hidden;
    padding-right: 8px;
  }
  .mode {
    background: var(--mode-normal);
    color: var(--mode-fg);
    padding: 0 8px;
    font-weight: bold;
  }
  .mode.vis,
  .mode.uns {
    background: var(--mode-visual);
  }
  .mode.sel {
    background: var(--mode-select);
  }
  .url {
    color: var(--url);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .msg {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .msg.info {
    color: var(--ok);
  }
  .msg.warn {
    color: var(--warn);
  }
  .msg.error {
    color: var(--error);
  }
  .spacer {
    flex: 1;
  }
  .badge {
    color: var(--dim);
  }
  .badge.yank {
    color: var(--badge-yank);
  }
  .badge.cut {
    color: var(--badge-cut);
  }
  .badge.sel {
    color: var(--badge-select);
  }
  .badge.find {
    color: var(--badge-find);
  }
  .badge.filter,
  .badge.rec {
    color: var(--badge-filter);
  }
  .badge.warn {
    color: var(--warn);
  }
  .pos {
    color: var(--position);
  }
</style>
