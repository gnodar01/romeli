import { fuzzyFilter } from '../../core/fuzzy';
import type { Action } from '../../core/keymap';
import { findMatch } from '../browser/view';
import type { Overlays } from './overlays.svelte';

/** Anything a list shows: a stable key and the name that find (/) searches. */
export interface Keyed {
  key: string;
  name: string;
}

export type Mode = 'NOR' | 'VIS' | 'UNS' | 'SEL';

/**
 * The cursor, selection (Space, v, V), find (/ n N) and filter (f) of one list, shared by the
 * browser columns, the views dialog and the view editor. The list itself comes from `entries()`;
 * the cursor follows the hovered entry's key across rebuilds, falling back to its index.
 * Filtering is the owner's job (it knows how to match); `filter` only holds the query.
 */
export class ListNav<E extends Keyed = Keyed> {
  index = $state(0);
  hover = $state<string | null>(null);
  selected = $state<Record<string, true>>({});
  visual = $state<{ anchor: number; unset: boolean } | null>(null);
  find = $state<{ query: string; backward: boolean } | null>(null);
  filter = $state('');

  private list: () => E[];
  /** j/k cycle around the ends. */
  private wrap: boolean;

  constructor(entries: () => E[], opts: { wrap?: boolean } = {}) {
    this.list = entries;
    this.wrap = !!opts.wrap;
  }

  get entries(): E[] {
    return this.list();
  }

  readonly cursor = $derived.by(() => {
    const entries = this.list();
    const i = this.hover ? entries.findIndex((e) => e.key === this.hover) : -1;
    return i >= 0 ? i : Math.max(0, Math.min(this.index, entries.length - 1));
  });

  get hovered(): E | undefined {
    return this.list()[this.cursor];
  }

  readonly selectedCount = $derived(Object.keys(this.selected).length);

  readonly mode: Mode = $derived(this.visual ? (this.visual.unset ? 'UNS' : 'VIS') : this.selectedCount ? 'SEL' : 'NOR');

  /** [n/m]: position of the cursor among the entries matching the active find query. */
  readonly findStat = $derived.by(() => {
    const q = this.find?.query;
    if (!q) return null;
    const hits = this.list().flatMap((e, i) => (findMatch(q, e.name) ? [i] : []));
    return { query: q, n: hits.indexOf(this.cursor) + 1, m: hits.length };
  });

  setCursor(i: number) {
    const entries = this.list();
    const n = entries.length;
    const c = n ? Math.max(0, Math.min(i, n - 1)) : 0;
    this.index = c;
    this.hover = entries[c]?.key ?? null;
  }

  move(delta: number) {
    const n = this.list().length;
    if (this.wrap && n && Math.abs(delta) === 1) return this.setCursor((this.cursor + delta + n) % n);
    this.setCursor(this.cursor + delta);
  }

  /** Point the cursor at `key` (or the first entry). */
  reset(hover: string | null = null) {
    this.hover = hover;
    this.index = 0;
  }

  inVisualRange(i: number): boolean {
    const v = this.visual;
    return !!v && i >= Math.min(v.anchor, this.cursor) && i <= Math.max(v.anchor, this.cursor);
  }

  isSelected(e: E, i: number): boolean {
    const v = this.visual;
    if (v && this.inVisualRange(i)) return !v.unset;
    return !!this.selected[e.key];
  }

  commitVisual() {
    const v = this.visual;
    if (!v) return;
    this.list().forEach((e, i) => {
      if (!this.inVisualRange(i)) return;
      if (v.unset) delete this.selected[e.key];
      else this.selected[e.key] = true;
    });
    this.visual = null;
  }

  /** Selected keys (committing any visual range), or the hovered entry's. */
  targetKeys(): string[] {
    this.commitVisual();
    const keys = Object.keys(this.selected);
    if (keys.length) return keys;
    return this.hovered ? [this.hovered.key] : [];
  }

  /** Selected entries in list order, or the hovered one. */
  targets(): E[] {
    const keys = new Set(this.targetKeys());
    return this.list().filter((e) => keys.has(e.key));
  }

  clearSelection() {
    this.selected = {};
    this.visual = null;
  }

  /** Move to the next (or previous) entry matching `q`; false if there is none. */
  jumpToMatch(q: string, backward: boolean, from: number, inclusive: boolean): boolean {
    const entries = this.list();
    const n = entries.length;
    if (!q || !n) return true;
    for (let k = inclusive ? 0 : 1; k <= n; k++) {
      const i = (((backward ? from - k : from + k) % n) + n) % n;
      if (findMatch(q, entries[i].name)) {
        this.setCursor(i);
        return true;
      }
    }
    return false;
  }

  /** `/`: live find in a prompt. Esc puts the cursor back and clears the highlights. */
  startFind(overlays: Overlays, backward: boolean, onMiss: (q: string) => void) {
    const start = this.cursor;
    const startHover = this.hover;
    void overlays
      .prompt(backward ? 'Find previous' : 'Find', '', 'smart-case · Enter keeps highlights · n/N next/prev · Esc clears', (q) => {
        this.find = { query: q, backward };
        if (!this.jumpToMatch(q, backward, start, true)) onMiss(q);
      })
      .then((v) => {
        if (v === null) {
          this.index = start;
          this.hover = startHover;
          this.find = null;
        }
      });
  }

  /** `f`: live filter in a prompt. Esc restores the previous filter. */
  startFilter(overlays: Overlays) {
    const before = this.filter;
    void overlays
      .prompt('Filter', this.filter, 'fuzzy · Enter keeps the filter · Esc restores', (q) => {
        this.filter = q;
        this.reset();
      })
      .then((v) => {
        if (v === null) this.filter = before;
      });
  }

  /**
   * The list actions every screen shares: motion, selection, find and filter. Returns false for
   * anything else, which the caller handles.
   */
  exec(action: Action, ctx: { overlays: Overlays; pageRows: number; onMiss: (q: string) => void }): boolean {
    const half = Math.ceil(ctx.pageRows / 2);
    const e = this.hovered;
    switch (action) {
      case 'up':
        this.move(-1);
        break;
      case 'down':
        this.move(1);
        break;
      case 'top':
        this.setCursor(0);
        break;
      case 'bottom':
        this.setCursor(this.list().length - 1);
        break;
      case 'halfUp':
        this.setCursor(this.cursor - half);
        break;
      case 'halfDown':
        this.setCursor(this.cursor + half);
        break;
      case 'pageUp':
        this.setCursor(this.cursor - ctx.pageRows);
        break;
      case 'pageDown':
        this.setCursor(this.cursor + ctx.pageRows);
        break;
      case 'toggleSelect':
        if (!e) break;
        if (this.selected[e.key]) delete this.selected[e.key];
        else this.selected[e.key] = true;
        this.setCursor(this.cursor + 1);
        break;
      case 'visual':
      case 'visualUnset':
        if (this.visual) this.commitVisual();
        else this.visual = { anchor: this.cursor, unset: action === 'visualUnset' };
        break;
      case 'selectAll':
        for (const x of this.list()) this.selected[x.key] = true;
        break;
      case 'invertSelection':
        for (const x of this.list()) {
          if (this.selected[x.key]) delete this.selected[x.key];
          else this.selected[x.key] = true;
        }
        break;
      case 'find':
      case 'findPrev':
        this.startFind(ctx.overlays, action === 'findPrev', ctx.onMiss);
        break;
      case 'findNext':
      case 'findPrevMatch':
        if (this.find?.query && !this.jumpToMatch(this.find.query, this.find.backward !== (action === 'findPrevMatch'), this.cursor, false)) {
          ctx.onMiss(this.find.query);
        }
        break;
      case 'filter':
        this.startFilter(ctx.overlays);
        break;
      default:
        return false;
    }
    return true;
  }

  /** Esc, one layer at a time: visual range, find, selection, filter. False when there was nothing to clear. */
  escape(): boolean {
    if (this.visual) this.commitVisual();
    else if (this.find) this.find = null;
    else if (this.selectedCount) this.clearSelection();
    else if (this.filter) this.filter = '';
    else return false;
    return true;
  }
}

export const MOTIONS: ReadonlySet<Action> = new Set<Action>(['up', 'down', 'top', 'bottom', 'halfUp', 'halfDown', 'pageUp', 'pageDown']);

/** Rows that fit in a list of the window's height (row = 20px). */
export const pageRows = (): number => Math.max(1, Math.floor((window.innerHeight - 60) / 20));

/** Fuzzy-filter rows by name, keeping match positions for highlighting (list order when `q` is empty). */
export function filterByName<T extends { name: string }>(rows: T[], q: string): (T & { positions?: number[] })[] {
  if (!q) return rows;
  return fuzzyFilter(q, rows, (r) => r.name).map(({ value, match }) => ({ ...value, positions: match.positions }));
}
