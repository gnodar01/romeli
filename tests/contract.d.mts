import type { BookmarksApi } from '../src/core/types';

/** See contract.mjs. Defaults to `chrome.bookmarks` when run inside the extension. */
export function bookmarksContract(api?: BookmarksApi): Promise<Record<string, unknown>>;
