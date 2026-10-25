import { activeNormalTab, saveFavicon } from '../adapter/browser';
import { platform } from '../platform';
import { ext } from '../platform/ext';

type Kind = 'browser' | 'create';

const SIZES: Record<Kind, { width: number; height: number }> = {
  browser: { width: 1180, height: 700 },
  create: { width: 680, height: 420 },
};

/** Open (or focus) romeli's popup window. The create window is always reopened with fresh params. */
async function openWindow(kind: Kind, query = '') {
  const key = `win.${kind}`;
  const id = (await ext.storage.session.get(key))[key] as number | undefined;
  if (id !== undefined) {
    try {
      if (kind === 'browser') {
        await ext.windows.update(id, { focused: true });
        return;
      }
      await ext.windows.remove(id);
    } catch {
      // window is gone
    }
  }
  const size = SIZES[kind];
  let pos = {};
  try {
    const parent = await ext.windows.getLastFocused({ windowTypes: ['normal'] });
    if (parent.width && parent.height) {
      pos = {
        left: Math.round((parent.left ?? 0) + (parent.width - size.width) / 2),
        top: Math.round((parent.top ?? 0) + (parent.height - size.height) / 3),
      };
    }
  } catch {
    // no normal window
  }
  const win = await ext.windows.create({
    type: 'popup',
    url: ext.runtime.getURL(`ui/${kind}/index.html${query}`),
    ...size,
    ...pos,
  });
  await ext.storage.session.set({ [key]: win.id });
}

async function createBookmark() {
  const tab = await activeNormalTab();
  const params = new URLSearchParams();
  if (tab?.url) params.set('url', tab.url);
  if (tab?.title) params.set('title', tab.title);
  if (tab?.url && !platform.favicon) await saveFavicon(tab.url, tab.favIconUrl);
  await openWindow('create', `?${params}`);
}

ext.commands.onCommand.addListener((command) => {
  if (command === 'open-browser') void openWindow('browser');
  if (command === 'create-bookmark') void createBookmark();
});

ext.action.onClicked.addListener(() => void openWindow('browser'));

ext.windows.onRemoved.addListener(async (id) => {
  const all = await ext.storage.session.get(null);
  const stale = Object.keys(all).filter((k) => k.startsWith('win.') && all[k] === id);
  if (stale.length) await ext.storage.session.remove(stale);
});

platform.startBackground({ saveFavicon });

ext.runtime.onMessage.addListener((msg: { type?: string; query?: string }) => {
  if (msg?.type === 'open-browser') return openWindow('browser', msg.query ?? '');
  if (msg?.type === 'open-create') return openWindow('create', msg.query ?? '');
  return undefined;
});
