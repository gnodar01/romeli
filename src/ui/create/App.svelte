<script lang="ts">
  import { onMount } from 'svelte';
  import { createStore, hostOf, loadFavicons } from '../../adapter/browser';
  import type { Model } from '../../core/model';
  import { formatTagList } from '../../core/tags';
  import type { TagPath } from '../../core/types';
  import ItemForm from '../components/ItemForm.svelte';

  const params = new URLSearchParams(location.search);
  const url = params.get('url') ?? '';
  const store = createStore();

  let model = $state.raw<Model>();
  let favicon = $state<string>();
  let existing = $state(false);
  let title = $state(params.get('title') ?? '');
  let tags = $state('');

  onMount(async () => {
    const m = await store.load();
    const item = url ? m.item(url) : undefined;
    if (item) {
      existing = true;
      title = item.title;
      tags = formatTagList(item.tags.filter((t) => t.length));
    }
    favicon = (await loadFavicons())[hostOf(url)];
    model = m;
  });

  async function save(u: string, t: string, list: TagPath[]) {
    await store.saveItem(existing ? url : null, u, t, list);
    window.close();
  }
</script>

<main>
  {#if model}
    <ItemForm
      {model}
      heading={existing ? 'edit bookmark' : 'new bookmark'}
      {url}
      {title}
      tags={tags ? tags + ', ' : ''}
      {favicon}
      onSave={save}
      onCancel={() => window.close()}
    />
  {/if}
</main>

<style>
  main {
    height: 100vh;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 18px 12px;
  }
</style>
