import type { Action } from '../core/keymap';
import type { RootResolver } from '../core/types';

export interface BrowserEvent {
  addListener(f: () => void): void;
  removeListener(f: () => void): void;
}

/**
 * Everything that differs between browsers. Core semantics never see this; the adapter, the
 * background script and the UI read it. Only `src/platform/` may contain browser-gated code.
 */
export interface Platform {
  name: 'firefox' | 'chrome';
  /** For UI text, e.g. "Sort by Firefox order". */
  browserName: string;
  /** Maps the native tree onto romeli's root, special tags and reserved names. */
  resolveRoots: RootResolver;
  /** Actions that don't exist on this browser: unbound and hidden from help and settings. */
  hiddenActions: readonly Action[];
  /** A page's icon URL straight from the browser, or undefined to use captured favicons. */
  favicon?(url: string): string;
  /** Whether the extension can change its global shortcuts itself (`commands.update`). */
  shortcuts: { editable: true } | { editable: false; settingsUrl: string };
  /** Bookmark events after which the tree must be re-read. */
  bookmarkEvents(): BrowserEvent[];
  /** Browser-specific background listeners. Called once at the top level of the background script. */
  startBackground(deps: { saveFavicon(url: string, icon: string | undefined): Promise<void> }): void;
}
