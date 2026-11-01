<script lang="ts">
  import type { Bindings } from '../../core/keymap';
  import Confirm from '../components/Confirm.svelte';
  import HelpPane from '../components/HelpPane.svelte';
  import Picker from '../components/Picker.svelte';
  import Prompt from '../components/Prompt.svelte';
  import type { Overlays } from './overlays.svelte';

  let { overlays, bindings }: { overlays: Overlays; bindings: Bindings } = $props();
  const o = $derived(overlays.current);
</script>

{#if o?.kind === 'prompt'}
  <Prompt {...o} />
{:else if o?.kind === 'confirm'}
  <Confirm title={o.title} lines={o.lines} onAnswer={o.onAnswer} />
{:else if o?.kind === 'picker'}
  <Picker
    title={o.title}
    value={o.value}
    placeholder={o.placeholder}
    hint={o.hint}
    search={o.search}
    onPick={(act, alt) => {
      overlays.close();
      (alt && act.alt ? act.alt : act.go)();
    }}
    onCancel={() => {
      overlays.close();
      o.onCancel?.();
    }}
  />
{:else if o?.kind === 'help'}
  <HelpPane {bindings} screens={o.screens} onClose={() => overlays.close()} />
{/if}
