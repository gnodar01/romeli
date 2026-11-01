<script lang="ts">
  import { onMount } from 'svelte';
  import { createViewStore } from '../../adapter/browser';
  import { plural } from '../../core/store';
  import { formatDefs, parseDefs, type Problem } from '../../core/views/dsl';
  import { ext } from '../../platform/ext';
  import TextIO from './TextIO.svelte';

  let { flash }: { flash: (text: string, error?: boolean) => void } = $props();

  const store = createViewStore();
  let text = $state('');
  let problems = $state<Problem[]>([]);

  const revert = async () => {
    text = formatDefs(await store.load());
    problems = [];
  };

  onMount(() => {
    void revert();
    // Edits in the view editor show up here unless there's an unapplied draft.
    const onChange = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && 'views' in changes) void store.load().then((d) => text === formatDefs(store.defs) || (text = formatDefs(d)));
    };
    ext.storage.onChanged.addListener(onChange);
    return () => ext.storage.onChanged.removeListener(onChange);
  });

  async function apply() {
    const parsed = parseDefs(text, await store.load());
    problems = parsed.problems;
    if (problems.some((p) => !p.warn)) return flash('not applied: fix the problems below', true);
    await store.replace(parsed.defs);
    text = formatDefs(store.defs);
    flash(`views applied: ${plural(store.defs.vars.length, 'var')}, ${plural(store.defs.views.length, 'view')}`);
  }
</script>

<section class="box">
  <span class="box-title">views</span>
  <p class="dim">
    Views and vars (edited in the browser with <code>K</code>), as text for sharing or backup. They're stored on this
    device only. Applying replaces all of them. A tag path ends with <code>/</code>; operators are
    <code>+</code> <code>&amp;</code> <code>^</code> with spaces around them, <code>!</code> negates, and <code>{'{var}'}</code>
    uses a var.
  </p>
  <TextIO bind:value={text} what="views" applyLabel="apply" rows={16} onApply={apply} onRevert={revert} {flash} />
  {#each problems as p}<div class={p.warn ? 'conflict' : 'error-line'}>line {p.line}: {p.msg}</div>{/each}
</section>
