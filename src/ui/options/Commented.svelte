<script lang="ts">
  import { descriptionParts } from '../../core/text';

  /** A label whose parenthesized comments are shown in the comment color (`.comment`). */
  let { text }: { text: string } = $props();
</script>

{#each descriptionParts(text) as p}{#if p.comment}<span class="comment">{p.text}</span>{:else}{p.text}{/if}{/each}
