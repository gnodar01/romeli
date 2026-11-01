<script lang="ts">
  import { KeyResolver, bindingsFor, type Action, type Bindings } from '../../core/keymap';
  import type { Model } from '../../core/model';
  import { evaluatorOf } from '../../core/views/eval';
  import type { ViewDefs } from '../../core/views/types';
  import { findPositions } from '../browser/view';
  import Highlight from '../components/Highlight.svelte';
  import RowList from '../components/RowList.svelte';
  import { KeyFeed } from '../lib/keys.svelte';
  import { ListNav, filterByName, pageRows } from '../lib/listNav.svelte';
  import { Flash, Overlays } from '../lib/overlays.svelte';
  import OverlayView from '../lib/OverlayHost.svelte';

  /** `T`: pick views to open as read-only tabs. Owns its keys while open. */
  let {
    model,
    defs,
    bindings,
    onOpen,
    onClose,
  }: { model: Model; defs: ViewDefs; bindings: Bindings; onOpen: (ids: string[]) => void; onClose: () => void } = $props();

  const overlays = new Overlays();
  const flash = new Flash();
  const keys = new KeyFeed();
  const resolver = $derived(new KeyResolver(bindingsFor(bindings, 'dialog')));

  const all = $derived(defs.views.map((d) => ({ key: d.id, name: d.name, count: evaluatorOf(model).view(d, defs).count() })));
  const nav: ListNav<(typeof all)[number]> = new ListNav(() => rows, { wrap: true });
  const rows = $derived(filterByName(all, nav.filter));

  function exec(action: Action) {
    if (nav.exec(action, { overlays, pageRows: pageRows(), onMiss: (q) => flash.say(`no match for "${q}"`, 'warn') })) return;
    switch (action) {
      case 'open': {
        const ids = nav.targetKeys();
        if (ids.length) onOpen(ids);
        return;
      }
      case 'help':
        return overlays.help(['dialog']);
      case 'escape':
        if (!nav.escape()) onClose();
        return;
      case 'quit':
        return onClose();
    }
  }

  function onkeydown(ev: KeyboardEvent) {
    if (overlays.open) return;
    ev.stopPropagation();
    keys.handle(ev, resolver, exec);
  }
</script>

<svelte:window {onkeydown} />

<div class="overlay-backdrop">
  <div class="box dialog" role="dialog" aria-label="views">
    <span class="box-title">views</span>
    <div class="rows">
      <RowList {rows} cursor={nav.cursor} active mark={(r, i) => (nav.isSelected(r, i) ? 'sel' : undefined)} empty="no matching views">
        {#snippet row(r)}
          <span class="name"><Highlight text={r.name} positions={r.positions} found={findPositions(nav.find?.query ?? '', r.name)} /></span>
          <span class="count">{r.count}</span>
        {/snippet}
      </RowList>
    </div>
    <div class="foot">
      {#if flash.message}
        <span class="msg {flash.message.kind}">{flash.message.text}</span>
      {:else}
        <span class="dim">↵ open · Space select · / find · f filter · q close</span>
      {/if}
      <span class="spacer"></span>
      {#if nav.selectedCount}<span class="sel">sel {nav.selectedCount}</span>{/if}
      {#if nav.filter}<span class="filter">f: {nav.filter}</span>{/if}
      <span class="pos">{rows.length ? nav.cursor + 1 : 0}/{rows.length}</span>
    </div>
  </div>
</div>
<OverlayView {overlays} {bindings} />

<style>
  .dialog {
    width: min(560px, calc(100vw - 24px));
    padding-top: 10px;
  }
  .rows {
    height: min(50vh, calc(var(--row) * 16));
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .count {
    flex: none;
    color: var(--dim);
    font-size: var(--font-size-sm);
  }
  .foot {
    display: flex;
    gap: 8px;
    margin-top: 4px;
    padding-top: 2px;
    border-top: 1px solid var(--divider);
    font-size: var(--font-size-sm);
    white-space: nowrap;
  }
  .spacer {
    flex: 1;
  }
  .msg.warn {
    color: var(--warn);
  }
  .msg.error {
    color: var(--error);
  }
  .msg.info {
    color: var(--ok);
  }
  .sel {
    color: var(--badge-select);
  }
  .filter {
    color: var(--badge-filter);
  }
  .pos {
    color: var(--position);
  }
</style>
