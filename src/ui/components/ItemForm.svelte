<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { parseTagInput } from '../../core/complete';
  import type { Model } from '../../core/model';
  import { formatPath, normalizeTags } from '../../core/tags';
  import type { TagPath } from '../../core/types';
  import TagInput from './TagInput.svelte';

  let {
    model,
    heading,
    url: initialUrl = '',
    title: initialTitle = '',
    tags: initialTags = '',
    focus = 'tags',
    favicon,
    onSave,
    onCancel,
  }: {
    model: Model;
    heading: string;
    url?: string;
    title?: string;
    tags?: string;
    focus?: 'tags' | 'title' | 'url';
    favicon?: string;
    onSave: (url: string, title: string, tags: TagPath[]) => Promise<void>;
    onCancel: () => void;
  } = $props();

  let url = $state(untrack(() => initialUrl));
  let title = $state(untrack(() => initialTitle));
  let tags = $state(untrack(() => initialTags));
  let error = $state('');
  let saving = $state(false);
  let titleEl = $state<HTMLInputElement>();
  let urlEl = $state<HTMLInputElement>();
  let tagsEl = $state<HTMLInputElement>();

  const parsed = $derived(normalizeTags(parseTagInput(model, tags)));

  onMount(() => {
    const el = { tags: tagsEl, title: titleEl, url: urlEl }[focus];
    el?.focus();
    if (focus === 'tags') el?.setSelectionRange(tags.length, tags.length);
  });

  async function submit() {
    const u = url.trim();
    if (!u) {
      error = 'url is required';
      urlEl?.focus();
      return;
    }
    try {
      new URL(u);
    } catch {
      error = `not a valid url: ${u}`;
      urlEl?.focus();
      return;
    }
    saving = true;
    try {
      await onSave(u, title.trim() || u, parsed);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      saving = false;
    }
  }

  const isMac = navigator.platform.toLowerCase().includes('mac');
  const saveKey = isMac ? '⌘↵' : 'C-↵';

  /** Enter cycles name → url → tags; Cmd/Ctrl+Enter saves. */
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      e.stopPropagation();
      if (isMac ? e.metaKey : e.ctrlKey) return void submit();
      const order = [titleEl, urlEl, tagsEl];
      const i = order.indexOf(document.activeElement as HTMLInputElement);
      const next = order[(i + (e.shiftKey ? order.length - 1 : 1)) % order.length];
      next?.focus();
      next?.setSelectionRange(next.value.length, next.value.length);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  }
</script>

<div class="box form" role="dialog" tabindex="-1" {onkeydown}>
  <span class="box-title">{heading}</span>
  <label class="field">
    <span class="label">name</span>
    {#if favicon}<img class="favicon" src={favicon} alt="" />{/if}
    <input bind:this={titleEl} bind:value={title} spellcheck="false" placeholder="(defaults to url)" />
  </label>
  <label class="field">
    <span class="label">url</span>
    <input class="url" bind:this={urlEl} bind:value={url} spellcheck="false" placeholder="https://" />
  </label>
  <div class="field">
    <span class="label">tags</span>
    <TagInput {model} bind:value={tags} bind:input={tagsEl} />
  </div>
  <div class="chips">
    {#each parsed as t, i}
      {@const isNew = !model.resolve(t)}
      <span class="chip" class:new={isNew} class:primary={i === 0}>
        {i === 0 ? '★ ' : ''}{formatPath(t)}{isNew ? ' +new' : ''}
      </span>
    {:else}
      <span class="dim">no tags → untagged (/)</span>
    {/each}
  </div>
  {#if error}<div class="error">{error}</div>{/if}
  <div class="hints dim">
    <span><b>Tab</b> complete</span><span><b>↑↓</b> cycle</span><span><b>,</b> next tag</span>
    <span><b>C-w</b> back a level</span><span><b>↵</b> next field</span>
    <span><b>{saveKey}</b> {saving ? 'saving…' : 'save'}</span><span><b>Esc</b> cancel</span>
  </div>
</div>

<style>
  .form {
    width: min(640px, calc(100vw - 24px));
    padding-top: 12px;
    background: var(--bg);
  }
  .field {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 0;
    border-bottom: 1px solid var(--divider);
  }
  .field:focus-within .label {
    color: var(--accent);
  }
  .field > :global(.tag-input),
  .field > input {
    flex: 1;
    min-width: 0;
  }
  .label {
    width: 4ch;
    flex: none;
    color: var(--dim);
  }
  .url {
    color: var(--url);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    margin: 8px 0 4px;
    min-height: var(--row);
  }
  .chip {
    color: var(--tag);
  }
  .chip.primary {
    color: var(--tag-primary);
  }
  .chip.new {
    color: var(--tag-new);
  }
  .error {
    color: var(--error);
  }
  .hints {
    display: flex;
    flex-wrap: wrap;
    gap: 0 14px;
    margin-top: 4px;
    font-size: var(--font-size-sm);
  }
  .hints b {
    color: var(--fg);
    font-weight: normal;
  }
</style>
