import { activeNormalTab, rememberWindow, saveFavicon } from '../adapter/browser';
import { platform } from '../platform';
import { ext } from '../platform/ext';

type Kind = 'browser' | 'create';

const SIZES: Record<Kind, { width: number; height: number }> = {
  browser: { width: 1180, height: 700 },
  create: { width: 680, height: 420 },
};

/**
 * Open (or focus) romeli's popup window. The create window is always reopened with fresh params.
 * Resolves to true when an already open browser window was focused instead.
 */
async function openWindow(kind: Kind, query = ''): Promise<boolean> {
  // The window that the shortcut or toolbar button came from: track it even if no focus change was seen yet.
  const parent = await ext.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => undefined);
  if (parent?.type === 'normal' && parent.id !== undefined) await rememberWindow(parent.id);
  const key = `win.${kind}`;
  const id = (await ext.storage.session.get(key))[key] as number | undefined;
  if (id !== undefined) {
    try {
      if (kind === 'browser') {
        await ext.windows.update(id, { focused: true });
        return true;
      }
      await ext.windows.remove(id);
    } catch {
      // window is gone
    }
  }
  const size = SIZES[kind];
  let pos = {};
  if (parent?.width && parent.height) {
    pos = {
      left: Math.round((parent.left ?? 0) + (parent.width - size.width) / 2),
      top: Math.round((parent.top ?? 0) + (parent.height - size.height) / 3),
    };
  }
  const win = await ext.windows.create({
    type: 'popup',
    url: ext.runtime.getURL(`ui/${kind}/index.html${query}`),
    ...size,
    ...pos,
  });
  await ext.storage.session.set({ [key]: win.id });
  return false;
}

/** Open (or focus) the browser window, revealing the current tab's page there if it's bookmarked. */
async function openBrowser() {
  const url = (await activeNormalTab().catch(() => undefined))?.url;
  const focused = await openWindow('browser', url ? `?${new URLSearchParams({ reveal: url })}` : '');
  if (focused && url) await ext.runtime.sendMessage({ type: 'reveal', url }).catch(() => {});
}

async function createBookmark() {
  const tab = await activeNormalTab();
  const params = new URLSearchParams();
  if (tab?.url) params.set('url', tab.url);
  if (tab?.title) params.set('title', tab.title);
  if (tab?.url && !platform.favicon) await saveFavicon(tab.url, tab.favIconUrl);
  await openWindow('create', `?${params}`);
}

// ------------------------------------------------------------------ listeners

ext.commands.onCommand.addListener((command) => {
  if (command === 'open-browser') void openBrowser();
  if (command === 'create-bookmark') void createBookmark();
});

ext.action.onClicked.addListener(() => void openBrowser());

// Firefox's getLastFocused ignores windowTypes, so remember the normal windows the user focuses (see adapter/windows.ts).
ext.windows.onFocusChanged.addListener(async (id) => {
  if (id === ext.windows.WINDOW_ID_NONE) return;
  const win = await ext.windows.get(id).catch(() => undefined);
  if (win?.type === 'normal') await rememberWindow(id);
});

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
