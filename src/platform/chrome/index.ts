import { ext } from '../ext';
import type { BrowserEvent, Platform } from '../types';
import { chromeRoots } from './roots';

export const chrome: Platform = {
  name: 'chrome',
  browserName: 'Chrome',
  resolveRoots: chromeRoots,
  hiddenActions: ['goMenu'],
  // Chrome serves any page's cached icon to extensions with the "favicon" permission.
  favicon: (url) => ext.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`),
  shortcuts: { editable: false, settingsUrl: 'chrome://extensions/shortcuts' },
  bookmarkEvents: () => {
    // Chrome also fires these (e.g. sorting in its bookmark manager, an import finishing).
    const b = ext.bookmarks as typeof ext.bookmarks & { onChildrenReordered: BrowserEvent; onImportEnded: BrowserEvent };
    return [b.onCreated, b.onRemoved, b.onChanged, b.onMoved, b.onChildrenReordered, b.onImportEnded];
  },
  startBackground() {},
};
