import type { Screen } from '../../core/keymap';
import type { ConfirmLine, PickerRow } from '../browser/view';

/** What a picker row does on Enter, and optionally on Shift+Enter. */
export type PickAction = { go: () => void; alt?: () => void };

export type Overlay =
  | { kind: 'prompt'; title: string; value?: string; hint?: string; onInput?: (v: string) => void; onSubmit: (v: string) => void; onCancel: () => void }
  | { kind: 'confirm'; title: string; lines: ConfirmLine[]; onAnswer: (yes: boolean) => void }
  | { kind: 'picker'; title: string; value?: string; placeholder?: string; hint?: string; search: (q: string) => PickerRow<PickAction>[]; onCancel?: () => void }
  | { kind: 'help'; screens: Screen[] };

/**
 * The one modal at a time (prompt, y/N confirm, fuzzy picker, help) with promise-returning
 * helpers. Rendered by `Overlays.svelte`; while one is open, screens ignore their keys.
 */
export class Overlays {
  current = $state.raw<Overlay | null>(null);

  get open(): boolean {
    return this.current !== null;
  }

  close() {
    this.current = null;
  }

  confirm(title: string, lines: ConfirmLine[]): Promise<boolean> {
    return new Promise((resolve) => {
      this.current = {
        kind: 'confirm',
        title,
        lines,
        onAnswer: (yes) => {
          this.current = null;
          resolve(yes);
        },
      };
    });
  }

  prompt(title: string, value = '', hint = '', onInput?: (v: string) => void): Promise<string | null> {
    return new Promise((resolve) => {
      this.current = {
        kind: 'prompt',
        title,
        value,
        hint,
        onInput,
        onSubmit: (v) => {
          this.current = null;
          resolve(v);
        },
        onCancel: () => {
          this.current = null;
          resolve(null);
        },
      };
    });
  }

  picker(o: Omit<Extract<Overlay, { kind: 'picker' }>, 'kind'>) {
    this.current = { kind: 'picker', ...o };
  }

  help(screens: Screen[]) {
    this.current = { kind: 'help', screens };
  }
}

/** A status-bar message that clears itself. */
export class Flash {
  message = $state<{ text: string; kind: 'info' | 'warn' | 'error' } | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;

  say = (text: string, kind: 'info' | 'warn' | 'error' = 'info') => {
    this.message = { text, kind };
    clearTimeout(this.timer);
    this.timer = setTimeout(() => (this.message = null), kind === 'info' ? 3000 : 6000);
  };
}
