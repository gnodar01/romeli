<script lang="ts">
  /** `positions`: fuzzy-match characters (pink); `found`: find-occurrence characters (yellow). */
  let { text, positions = [], found = [] }: { text: string; positions?: number[]; found?: number[] } = $props();

  const parts = $derived.by(() => {
    const hl = new Set(positions);
    const fd = new Set(found);
    const out: { s: string; cls: string }[] = [];
    for (let i = 0; i < text.length; i++) {
      const cls = fd.has(i) ? 'found' : hl.has(i) ? 'hl' : '';
      const last = out[out.length - 1];
      if (last && last.cls === cls) last.s += text[i];
      else out.push({ s: text[i], cls });
    }
    return out;
  });
</script>

{#each parts as p}{#if p.cls}<span class={p.cls}>{p.s}</span>{:else}{p.s}{/if}{/each}

<style>
  .found {
    background: var(--find-bg);
    color: var(--find-fg);
  }
</style>
