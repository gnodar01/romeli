import { eventToKey, type Action, type KeyResolver, type Pending } from '../../core/keymap';

/** Feeds key presses to a resolver and keeps the pending which-key sequence. */
export class KeyFeed {
  pending = $state<Pending | null>(null);

  /** Returns false when the event should be left alone (in a text field, or a bare modifier). */
  handle(ev: KeyboardEvent, resolver: KeyResolver, exec: (a: Action) => void, busy = false): void {
    const t = ev.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const key = eventToKey(ev);
    if (!key) return;
    if (busy && key !== '<Esc>') {
      ev.preventDefault();
      return;
    }
    const r = resolver.feed(key);
    if ('action' in r) {
      ev.preventDefault();
      this.pending = null;
      exec(r.action);
    } else if ('pending' in r) {
      ev.preventDefault();
      this.pending = r.pending;
    } else {
      this.pending = null;
    }
  }
}
