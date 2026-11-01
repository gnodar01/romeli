<script lang="ts">
  /** An import/export textarea with apply / copy / revert (keys and theme JSON, views text). */
  let {
    value = $bindable(),
    what,
    applyLabel = 'apply JSON',
    rows = 12,
    onApply,
    onRevert,
    flash,
  }: {
    value: string;
    /** Named in the "copied" message, e.g. "keys JSON". */
    what: string;
    applyLabel?: string;
    rows?: number;
    onApply: () => void;
    onRevert: () => void;
    flash: (text: string, error?: boolean) => void;
  } = $props();

  async function copy() {
    await navigator.clipboard.writeText(value);
    flash(`${what} copied`);
  }
</script>

<textarea class="json scroll" bind:value spellcheck="false" {rows}></textarea>
<div class="toolbar">
  <button onclick={onApply}>{applyLabel}</button>
  <button onclick={copy}>copy</button>
  <button onclick={onRevert}>revert</button>
</div>
