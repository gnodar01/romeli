/**
 * Which browser window romeli opens URLs in.
 * Left pure, so it's unit-testable without a browser.
 *
 * Unlike Chrome, Firefox ignores `windowTypes` in `windows.getLastFocused`, so while romeli's popup is focused it
 * returns the popup itself. Tab `lastAccessed` doesn't help either: Firefox reports "now" for the active tab
 * of every window. So instead, the background tracks recently focused normal windows via events (`recent`).
 */

export interface WindowLike {
  id?: number;
  type?: string;
  state?: string;
  focused?: boolean;
}

/** How many recently focused windows to remember. */
export const RECENT_MAX = 20;

/** `recent` (most recent first) with `id` moved to the front. */
export function pushRecent(recent: readonly number[], id: number): number[] {
  return [id, ...recent.filter((x) => x !== id)].slice(0, RECENT_MAX);
}

/**
 * The window to open in:
 *   `lastFocused` when it really is a normal window (Chrome, or Firefox while romeli isn't focused);
 *   else the most recently focused normal window that still exists and isn't minimized;
 *   else the most recent one even if minimized (opening focuses, and so restores, it);
 *   else the focused or first normal window.
 */
export function pickWindow<W extends WindowLike>(
  lastFocused: W | undefined,
  all: readonly W[],
  recent: readonly number[],
): W | undefined {
  if (lastFocused?.type === 'normal') return lastFocused;
  const normal = all.filter((w) => w.type === 'normal');
  const tracked = recent.flatMap((id) => normal.filter((w) => w.id === id));
  return (
    tracked.find((w) => w.state !== 'minimized') ??
    tracked[0] ??
    normal.find((w) => w.focused && w.state !== 'minimized') ??
    normal.find((w) => w.state !== 'minimized') ??
    normal[0]
  );
}
