import { activeNormalTab, saveFavicon } from '../adapter/browser';

type Kind = 'browser' | 'create';

const SIZES: Record<Kind, { width: number; height: number }> = {
  browser: { width: 1180, height: 700 },
  create: { width: 680, height: 420 },
};

/** Open (or focus) romeli's popup window. The create window is always reopened with fresh params. */
async function openWindow(kind: Kind, query = '') {
  const key = `win.${kind}`;
  const id = (await browser.storage.session.get(key))[key] as number | undefined;
  if (id !== undefined) {
    try {
      if (kind === 'browser') {
        await browser.windows.update(id, { focused: true });
        return;
      }
      await browser.windows.remove(id);
    } catch {
      // window is gone
    }
  }
  const size = SIZES[kind];
  let pos = {};
  try {
    const parent = await browser.windows.getLastFocused({ windowTypes: ['normal'] });
    if (parent.width && parent.height) {
      pos = {
        left: Math.round((parent.left ?? 0) + (parent.width - size.width) / 2),
        top: Math.round((parent.top ?? 0) + (parent.height - size.height) / 3),
      };
    }
  } catch {
    // no normal window
  }
  const win = await browser.windows.create({
    type: 'popup',
    url: browser.runtime.getURL(`ui/${kind}/index.html${query}`),
    ...size,
    ...pos,
  });
  await browser.storage.session.set({ [key]: win.id });
}

async function createBookmark() {
  const tab = await activeNormalTab();
  const params = new URLSearchParams();
  if (tab?.url) params.set('url', tab.url);
  if (tab?.title) params.set('title', tab.title);
  if (tab?.url) await saveFavicon(tab.url, tab.favIconUrl);
  await openWindow('create', `?${params}`);
}

browser.commands.onCommand.addListener((command) => {
  if (command === 'open-browser') void openWindow('browser');
  if (command === 'create-bookmark') void createBookmark();
});

browser.action.onClicked.addListener(() => void openWindow('browser'));

browser.windows.onRemoved.addListener(async (id) => {
  const all = await browser.storage.session.get(null);
  const stale = Object.keys(all).filter((k) => k.startsWith('win.') && all[k] === id);
  if (stale.length) await browser.storage.session.remove(stale);
});

// Favicons: extensions can't read Firefox's favicon cache, so remember the icon of any
// bookmarked page the user visits.
browser.tabs.onUpdated.addListener(
  async (_id, change, tab) => {
    if (!change.favIconUrl || !tab.url) return;
    const hits = await browser.bookmarks.search({ url: tab.url }).catch(() => []);
    if (hits.length) await saveFavicon(tab.url, change.favIconUrl);
  },
  { properties: ['favIconUrl'] },
);

browser.runtime.onMessage.addListener((msg: { type?: string; query?: string }) => {
  if (msg?.type === 'open-browser') return openWindow('browser', msg.query ?? '');
  if (msg?.type === 'open-create') return openWindow('create', msg.query ?? '');
  return undefined;
});
