<script lang="ts">
  import { describeAction, type Pending } from '../../core/keymap';
  import { platform } from '../../platform';

  let { pending }: { pending: Pending } = $props();
</script>

<div class="whichkey">
  {#each pending.next as [k, a]}
    <div><span class="k">{pending.keys.join('')}{k}</span> <span class="dim">{describeAction(a, platform.browserName)}</span></div>
  {/each}
</div>

<style>
  .whichkey {
    position: fixed;
    left: 0;
    right: 0;
    bottom: calc(var(--row) + 2px);
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 0 16px;
    padding: 6px 12px;
    background: var(--popup-bg);
    border-top: 1px solid var(--whichkey-border);
  }
  .whichkey .k {
    color: var(--whichkey-key);
    display: inline-block;
    min-width: 5ch;
  }
</style>
