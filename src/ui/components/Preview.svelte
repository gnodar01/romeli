<script lang="ts">
  import type { Favicons } from '../../adapter/browser';
  import { hostOf } from '../../adapter/browser';
  import type { Model } from '../../core/model';
  import { formatPath, samePath } from '../../core/tags';
  import { formatDate, type Entry } from '../browser/view';
  import Column from './Column.svelte';

  let {
    entry,
    children,
    favicons = {},
  }: { model: Model; entry: Entry | undefined; children: Entry[]; favicons?: Favicons } = $props();
</script>

<div class="preview">
  {#if !entry}
    <div class="dim pad">nothing here</div>
  {:else if entry.kind === 'tag'}
    <Column entries={children} {favicons} empty="empty tag" />
  {:else}
    {@const icon = favicons[hostOf(entry.copy.url)]}
    <div class="pad scroll item">
      <div class="title">
        {#if icon}<img class="favicon" src={icon} alt="" />{/if}
        {entry.copy.title || '(untitled)'}
      </div>
      <div class="url">{entry.copy.url}</div>

      <div class="section">tags</div>
      {#each entry.item.copies as c, i}
        <div class="tagrow" class:here={samePath(c.tag.path, entry.copy.tag.path)}>
          <span class="star">{i === 0 ? '★' : ' '}</span>
          {formatPath(c.tag.path)}{c.title !== entry.item.title ? `  “${c.title}”` : ''}
        </div>
      {/each}

      <div class="section">info</div>
      <div><span class="key">added</span>{formatDate(entry.copy.dateAdded)}</div>
      <div><span class="key">host</span>{hostOf(entry.copy.url)}</div>
    </div>
  {/if}
</div>

<style>
  .preview {
    height: 100%;
    min-width: 0;
    overflow: hidden;
  }
  .pad {
    padding: 0 12px;
  }
  .item {
    height: 100%;
  }
  .title {
    color: var(--title);
    font-weight: bold;
    word-break: break-word;
  }
  .url {
    color: var(--url);
    word-break: break-all;
    margin-top: 2px;
  }
  .section {
    margin-top: 12px;
    color: var(--accent);
  }
  .tagrow {
    color: var(--tag);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tagrow.here {
    background: var(--line-bg);
  }
  .key {
    display: inline-block;
    width: 7ch;
    color: var(--dim);
  }
  .star {
    color: var(--star);
    display: inline-block;
    width: 2ch;
  }
</style>
