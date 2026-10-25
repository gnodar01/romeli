/**
 * The promise-based WebExtension namespace: `browser` in Firefox, `chrome` in Chrome (MV3 returns
 * promises too). Typed with Firefox's declarations; Chrome-only members are cast where used.
 */
export const ext: typeof browser = (globalThis as { browser?: typeof browser }).browser ??
  (globalThis as unknown as { chrome: typeof browser }).chrome;
