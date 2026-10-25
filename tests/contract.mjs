// A bookmarks-API behaviour probe. It runs unchanged against real Chrome (inside the extension's
// service worker, via harness/real-chrome.mjs) and against MockBookmarks('chrome') (tests/platform.test.ts).
// Both results must equal tests/fixtures/chrome-bookmarks.json, which keeps the mock honest.
// Self-contained on purpose: puppeteer serializes it into the worker, so no imports or closures.
export async function bookmarksContract(api) {
  api ??= globalThis.chrome.bookmarks;
  const out = {};
  const tree = async () => (await api.getTree())[0];
  const strip = (n) => ({ id: n.id, folderType: n.folderType, hasType: 'type' in n, children: n.children?.map(strip) });
  const top = await tree();
  out.permanent = top.children.map((c) => ({ id: c.id, folderType: c.folderType, hasType: 'type' in c }));
  const otherId = top.children.find((c) => c.folderType === 'other').id;
  const find = (n, id) => (n.id === id ? n : (n.children ?? []).map((c) => find(c, id)).find(Boolean));
  const fails = async (f) => {
    try {
      await f();
      return false;
    } catch {
      return true;
    }
  };

  const f = await api.create({ parentId: otherId, title: 'contract' });
  const ids = {};
  for (const t of ['a', 'b', 'c', 'd']) ids[t] = (await api.create({ parentId: f.id, title: t, url: `https://${t}.contract/` })).id;
  const order = async () => find(await tree(), f.id).children.map((n) => n.title).join('');
  const dateA = find(await tree(), ids.a).dateAdded;

  await api.move(ids.a, { parentId: f.id, index: 2 });
  out.sameFolderMoveTo2 = await order();
  await api.move(ids.a, { parentId: f.id, index: 0 });
  out.sameFolderMoveTo0 = await order();
  await api.move(ids.a, { parentId: f.id, index: 4 });
  out.sameFolderMoveTo4 = await order();
  out.sameFolderMoveTo5Fails = await fails(() => api.move(ids.a, { parentId: f.id, index: 5 }));
  out.dateAddedKeptByMove = find(await tree(), ids.a).dateAdded === dateA;

  const g = await api.create({ parentId: otherId, title: 'contract-2' });
  await api.move(ids.b, { parentId: g.id, index: 0 });
  await api.move(ids.c, { parentId: g.id, index: 1 });
  out.crossFolderMove = [await order(), find(await tree(), g.id).children.map((n) => n.title).join('')];
  out.crossFolderMoveTo3Fails = await fails(() => api.move(ids.d, { parentId: g.id, index: 3 }));

  out.createIndexTooBigFails = await fails(() => api.create({ parentId: f.id, title: 'z', url: 'https://z.contract/', index: 9 }));
  await api.create({ parentId: f.id, title: 'z', url: 'https://z.contract/', index: 0 });
  out.createAtIndex0 = await order();

  out.bookmarkHasType = 'type' in find(await tree(), ids.d);
  out.folderHasUrl = 'url' in find(await tree(), f.id);
  out.updateKeepsId = (await api.update(ids.d, { title: 'D' })).id === ids.d;

  out.movePermanentFails = await fails(() => api.move(top.children[0].id, { parentId: otherId }));
  out.renamePermanentFails = await fails(() => api.update(otherId, { title: 'x' }));
  out.createInRootFails = await fails(() => api.create({ parentId: top.id, title: 'r' }));
  out.removePermanentFails = await fails(() => api.removeTree(otherId));
  out.removeNonEmptyFails = await fails(() => api.remove(f.id));

  await api.removeTree(f.id);
  await api.removeTree(g.id);
  out.cleanedUp = JSON.stringify(strip(await tree())) === JSON.stringify(strip(top));
  return out;
}
