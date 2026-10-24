<script lang="ts">
  let { text, positions = [] }: { text: string; positions?: number[] } = $props();

  const parts = $derived.by(() => {
    const set = new Set(positions);
    const out: { s: string; on: boolean }[] = [];
    for (let i = 0; i < text.length; i++) {
      const on = set.has(i);
      const last = out[out.length - 1];
      if (last && last.on === on) last.s += text[i];
      else out.push({ s: text[i], on });
    }
    return out;
  });
</script>

{#each parts as p}{#if p.on}<span class="hl">{p.s}</span>{:else}{p.s}{/if}{/each}
