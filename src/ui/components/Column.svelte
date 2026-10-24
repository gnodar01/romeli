<script lang="ts">
  import type { Favicons } from '../../adapter/browser';
  import { hostOf } from '../../adapter/browser';
  import type { Entry } from '../browser/view';
  import Highlight from './Highlight.svelte';

  let {
    entries,
    cursor = -1,
    active = false,
    favicons = {},
    mark = () => undefined,
    empty = 'empty',
  }: {
    entries: Entry[];
    cursor?: number;
    active?: boolean;
    favicons?: Favicons;
    mark?: (e: Entry, i: number) => 'sel' | 'yank' | 'cut' | 'sel yank' | 'sel cut' | undefined;
    empty?: string;
  } = $props();

  let el = $state<HTMLElement>();

  $effect(() => {
    void cursor;
    void entries;
    el?.querySelector('.cursor')?.scrollIntoView({ block: 'nearest' });
  });
</script>

<div class="column scroll" class:active bind:this={el}>
  {#each entries as e, i (e.key)}
    {@const m = mark(e, i) ?? ''}
    <div class="row {e.kind} {m}" class:cursor={i === cursor}>
      <span class="mark"></span>
      {#if e.kind === 'tag'}
        <span class="icon">{e.tag.fixed ? '◆' : '▸'}</span>
        <span class="name"><Highlight text={e.name} positions={e.positions} />/</span>
        <span class="info">{e.tag.tags.length + e.tag.copies.length}</span>
      {:else}
        {@const icon = favicons[hostOf(e.copy.url)]}
        <span class="icon">{#if icon}<img class="favicon" src={icon} alt="" />{:else}·{/if}</span>
        <span class="name">
          {#if e.rel}<span class="rel">{e.rel}</span>{/if}<Highlight text={e.name} positions={e.positions} />
        </span>
        {#if e.item.copies.length > 1}<span class="info" title="tags">+{e.item.copies.length - 1}</span>{/if}
      {/if}
    </div>
  {:else}
    <div class="empty dim">{empty}</div>
  {/each}
</div>

<style>
  .column {
    height: 100%;
    min-width: 0;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-right: 8px;
    white-space: nowrap;
    height: var(--row);
  }
  .mark {
    width: 3px;
    align-self: stretch;
    flex: none;
  }
  .row.sel .mark {
    background: var(--yellow);
  }
  .row.yank .mark {
    background: var(--green);
  }
  .row.cut .mark {
    background: var(--red);
  }
  .row.sel.yank .mark,
  .row.sel.cut .mark {
    background: linear-gradient(var(--yellow) 50%, var(--green) 50%);
  }
  .row.cut .name {
    text-decoration: line-through;
    text-decoration-color: var(--red);
  }
  .icon {
    width: 16px;
    flex: none;
    text-align: center;
    color: var(--comment);
  }
  .tag .icon {
    color: var(--purple);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tag .name {
    color: var(--purple);
  }
  .row.sel .name {
    color: var(--yellow);
  }
  .rel {
    color: var(--comment);
  }
  .info {
    flex: none;
    color: var(--comment);
    font-size: 12px;
  }
  .row.cursor {
    background: var(--cur);
  }
  .active .row.cursor {
    background: var(--purple);
    color: var(--bg);
  }
  .active .row.cursor .name,
  .active .row.cursor .icon,
  .active .row.cursor .info,
  .active .row.cursor .rel {
    color: var(--bg);
  }
  .active .row.cursor :global(.hl) {
    color: var(--bg);
    text-decoration: underline;
  }
  .active .row.item.cursor {
    background: var(--cyan);
  }
  .empty {
    padding: 0 12px;
  }
</style>
