<script lang="ts" generics="T extends { key: string }">
  import type { Snippet } from 'svelte';

  /**
   * A cursor/selection list with the browser column's look (mark bar, cursor colors), for rows
   * that aren't bookmarks: the views dialog and the view editor. `row` renders a row's content.
   */
  let {
    rows,
    cursor = -1,
    active = false,
    mark = () => undefined,
    empty = 'empty',
    row,
  }: {
    rows: T[];
    cursor?: number;
    active?: boolean;
    mark?: (r: T, i: number) => 'sel' | 'yank' | 'cut' | 'sel yank' | 'sel cut' | undefined;
    empty?: string;
    row: Snippet<[T, number]>;
  } = $props();

  let el = $state<HTMLElement>();

  $effect(() => {
    void cursor;
    void rows;
    el?.querySelector('.cursor')?.scrollIntoView({ block: 'nearest' });
  });
</script>

<div class="list scroll" class:active bind:this={el}>
  {#each rows as r, i (r.key)}
    <div class="row {mark(r, i) ?? ''}" class:cursor={i === cursor}>
      <span class="mark"></span>
      {@render row(r, i)}
    </div>
  {:else}
    <div class="empty dim">{empty}</div>
  {/each}
</div>

<style>
  .list {
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
    background: var(--selected);
  }
  .row.yank .mark {
    background: var(--mark-yank);
  }
  .row.cut .mark {
    background: var(--mark-cut);
  }
  .row.sel.yank .mark {
    background: linear-gradient(var(--selected) 50%, var(--mark-yank) 50%);
  }
  .row.sel.cut .mark {
    background: linear-gradient(var(--selected) 50%, var(--mark-cut) 50%);
  }
  .row.cut :global(.name) {
    text-decoration: line-through;
    text-decoration-color: var(--mark-cut);
  }
  .row.sel :global(.name) {
    color: var(--selected);
  }
  .row.cursor {
    background: var(--line-bg);
  }
  .active .row.cursor {
    background: var(--cursor-tag-bg);
    color: var(--cursor-fg);
  }
  .active .row.cursor :global(*) {
    color: var(--cursor-fg);
  }
  .active .row.cursor :global(.hl) {
    text-decoration: underline;
  }
  .empty {
    padding: 0 12px;
  }
</style>
