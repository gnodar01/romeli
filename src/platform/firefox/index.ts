import { ext } from '../ext';
import type { Platform } from '../types';
import { firefoxRoots } from './roots';

export const firefox: Platform = {
  name: 'firefox',
  browserName: 'Firefox',
  resolveRoots: firefoxRoots,
  hiddenActions: [],
  shortcuts: { editable: true },
  bookmarkEvents: () => [ext.bookmarks.onCreated, ext.bookmarks.onRemoved, ext.bookmarks.onChanged, ext.bookmarks.onMoved],
  startBackground({ saveFavicon }) {
    // Favicons: extensions can't read Firefox's favicon cache, so remember the icon of any
    // bookmarked page the user visits.
    ext.tabs.onUpdated.addListener(
      async (_id, change, tab) => {
        if (!change.favIconUrl || !tab.url) return;
        const hits = await ext.bookmarks.search({ url: tab.url }).catch(() => []);
        if (hits.length) await saveFavicon(tab.url, change.favIconUrl);
      },
      { properties: ['favIconUrl'] },
    );
  },
};
