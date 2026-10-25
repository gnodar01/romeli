import { describe, expect, it } from 'vitest';
import { parsePath as P } from '../src/core/tags';
import { decodeOverrides, encodeOverrides } from '../src/core/order';
import { FLAVORS, setup as setupFlavor, type Spec } from './mock';

const ARCH = 'https://wiki.archlinux.org';

const tagsOf = (store: Awaited<ReturnType<typeof setupFlavor>>['store'], url: string) =>
  store.model.item(url)?.tags.map((t) => t.join('/'));

describe.each(FLAVORS)('%s', (flavor) => {
  const setup = (spec?: Spec) => setupFlavor(spec, flavor);

  describe('existing bookmarks', () => {
    it('get their folder as primary tag', async () => {
      const { store } = await setup({ linux: { 'Arch wiki': ARCH } });
      expect(tagsOf(store, ARCH)).toEqual(['linux']);
    });

    it("the browser's root folders are top-level tags; items in Other Bookmarks are untagged", async () => {
      const { store } = await setup({ loose: 'https://loose.example' });
      expect(store.model.root.tags.map((t) => t.name)).toEqual(flavor === 'firefox' ? ['toolbar', 'menu'] : ['toolbar']);
      expect(store.model.root.tags.every((t) => t.fixed)).toBe(true);
      expect(tagsOf(store, 'https://loose.example')).toEqual(['']);
    });
  });

  describe('create', () => {
    it('creates folders and one copy per tag, first tag = native location', async () => {
      const { api, store } = await setup({ linux: { terminal: {} }, tool: {} });
      await store.saveItem(null, ARCH, 'Arch', [P('linux/terminal'), P('tool/CLI')]);
      expect(api.locations(ARCH)).toEqual(['linux/terminal', 'tool/CLI']);
      expect(tagsOf(store, ARCH)).toEqual(['linux/terminal', 'tool/CLI']);
    });

    it('collapses redundant ancestors', async () => {
      const { api, store } = await setup();
      await store.saveItem(null, ARCH, 'Arch', [P('linux'), P('linux/terminal')]);
      expect(api.locations(ARCH)).toEqual(['linux/terminal']);
    });

    it('respects explicit order even when it differs from creation order', async () => {
      const { store, kv } = await setup({ a: { x: 'https://x' }, b: {} });
      // natural order: a (oldest). User reorders to b first.
      await store.saveItem('https://x', 'https://x', 'x', [P('b'), P('a')]);
      expect(tagsOf(store, 'https://x')).toEqual(['b', 'a']);
      expect([...decodeOverrides(Object.fromEntries(kv.data))]).toEqual([['https://x', ['b', 'a']]]);
      // A fresh store reading the same storage agrees.
      await store.load();
      expect(tagsOf(store, 'https://x')).toEqual(['b', 'a']);
    });
  });

  describe('delete', () => {
    it('deleting the primary copy makes the next tag primary', async () => {
      const { api, store } = await setup();
      await store.saveItem(null, ARCH, 'Arch', [P('linux/terminal'), P('tool/CLI')]);
      await store.removeCopies([{ url: ARCH, path: P('linux/terminal') }]);
      expect(tagsOf(store, ARCH)).toEqual(['tool/CLI']);
      expect(api.locations(ARCH)).toEqual(['tool/CLI']);
    });

    it('D deletes all copies, undo restores them in order', async () => {
      const { api, store } = await setup({ z: {} });
      await store.saveItem(null, ARCH, 'Arch', [P('tool/CLI'), P('linux/terminal')]);
      const before = api.dump();
      const { entry } = await store.deleteItems([ARCH]);
      expect(api.locations(ARCH)).toEqual([]);
      await entry!.undo();
      expect(tagsOf(store, ARCH)).toEqual(['tool/CLI', 'linux/terminal']);
      expect(api.dump()).toEqual(before);
      await entry!.redo();
      expect(store.model.item(ARCH)).toBeUndefined();
    });

    it('deleting a tag keeps items, orphans become untagged', async () => {
      const { api, store } = await setup({
        linux: { terminal: { only: 'https://only' }, both: 'https://both' },
        tool: { both: 'https://both' },
      });
      expect(store.describeTagDeletion(P('linux'))).toEqual({ tags: 2, items: 2, orphaned: 1 });
      const before = api.dump();
      const { entry } = await store.deleteTag(P('linux'));
      expect(api.locations('https://only')).toEqual(['']);
      expect(api.locations('https://both')).toEqual(['tool']);
      expect(store.model.tag(P('linux'))).toBeUndefined();
      await entry!.undo();
      expect(api.dump()).toEqual(before);
    });
  });

  describe('yank / cut / paste', () => {
    it('y+p adds a tag; x+p moves keeping position', async () => {
      const { api, store } = await setup({ a: { item: 'https://i' }, b: {}, c: {} });
      await store.addTag(['https://i'], P('b'));
      expect(tagsOf(store, 'https://i')).toEqual(['a', 'b']);
      const id = store.model.item('https://i')!.copies[0].id;
      await store.moveCopies([{ url: 'https://i', path: P('a') }], P('c'));
      expect(tagsOf(store, 'https://i')).toEqual(['c', 'b']);
      // moved natively, not recreated
      expect(store.model.item('https://i')!.copies[0].id).toBe(id);
    });

    it('warns when pasting a redundant ancestor', async () => {
      const { store } = await setup({ a: { b: { item: 'https://i' } } });
      const { warnings } = await store.addTag(['https://i'], P('a'));
      expect(warnings).toHaveLength(1);
      expect(tagsOf(store, 'https://i')).toEqual(['a/b']);
    });

    it('untagged items lose the root tag when tagged', async () => {
      const { api, store } = await setup({ loose: 'https://loose' });
      await store.addTag(['https://loose'], P('x'));
      expect(api.locations('https://loose')).toEqual(['x']);
    });
  });

  describe('tag ops', () => {
    it('rename and move rewrite stored orders, and undo', async () => {
      const { api, store } = await setup({ a: { i: 'https://i' }, b: { sub: {} } });
      await store.saveItem('https://i', 'https://i', 'i', [P('b/sub'), P('a')]);
      const before = api.dump();
      const r = await store.renameTag(P('b'), 'bee');
      expect(tagsOf(store, 'https://i')).toEqual(['bee/sub', 'a']);
      const m = await store.moveTag(P('bee/sub'), P('a'));
      expect(tagsOf(store, 'https://i')).toEqual(['a/sub', 'a']);
      await m.entry!.undo();
      await r.entry!.undo();
      expect(api.dump()).toEqual(before);
      expect(tagsOf(store, 'https://i')).toEqual(['b/sub', 'a']);
    });

    it('refuses to touch root folders or move into self', async () => {
      const { store } = await setup({ a: { b: {} } });
      await expect(store.deleteTag(P('toolbar'))).rejects.toThrow(/root folder/);
      await expect(store.moveTag(P('a'), P('a/b'))).rejects.toThrow(/into itself/);
    });

    it('moving a tag and undoing puts it back at its old position', async () => {
    const { api, store } = await setup({ a: {}, b: { x: {}, y: {}, z: {} } });
    const before = api.dump();
    const { entry } = await store.moveTag(P('b/y'), P('a'));
    expect(api.dump()).toEqual([{ a: [{ y: [] }] }, { b: [{ x: [] }, { z: [] }] }]);
    await entry!.undo();
    expect(api.dump()).toEqual(before);
    await entry!.redo();
    expect(api.dump()).toEqual([{ a: [{ y: [] }] }, { b: [{ x: [] }, { z: [] }] }]);
  });

  it('deleting a copy from the middle of a folder and undoing restores its position', async () => {
    const { api, store } = await setup({ a: { one: 'https://1', two: 'https://2', three: 'https://3' } });
    const before = api.dump();
    const { entry } = await store.removeCopies([{ url: 'https://2', path: P('a') }]);
    expect(api.dump()).toEqual([{ a: ['one https://1', 'three https://3'] }]);
    await entry!.undo();
    expect(api.dump()).toEqual(before);
  });

  it('copyTag mirrors the subtree', async () => {
      const { api, store } = await setup({ a: { s: { i: 'https://i' } }, dest: {} });
      const { entry } = await store.copyTag(P('a'), P('dest'));
      expect(api.locations('https://i')).toEqual(['a/s', 'dest/a/s']);
      await entry!.undo();
      expect(api.locations('https://i')).toEqual(['a/s']);
      expect(store.model.tag(P('dest/a'))).toBeUndefined();
    });

    it('createTag is mkdir -p and undoable', async () => {
      const { store } = await setup();
      const { entry } = await store.createTag(P('x/y/z'));
      expect(store.model.tag(P('x/y/z'))).toBeDefined();
      await entry!.undo();
      expect(store.model.tag(P('x'))).toBeUndefined();
    });
  });

  describe('normalizeNames', () => {
    it('renames folders with separators, keeps orders, and undoes', async () => {
      const { api, store } = await setup({ 'a, b': { 'c / d': { i: 'https://i' } }, plain: {} });
      await store.saveItem('https://i', 'https://i', 'i', [P('plain'), ...store.model.item('https://i')!.tags]);
      const before = api.dump();
      expect(store.unnormalizedTags().map((t) => t.name)).toEqual(['a, b', 'c / d']);
      const { entry } = await store.normalizeNames();
      expect(store.unnormalizedTags()).toEqual([]);
      expect(tagsOf(store, 'https://i')).toEqual(['plain', 'a; b/c | d']);
      await entry!.undo();
      expect(api.dump()).toEqual(before);
      expect(store.model.item('https://i')!.tags.map((t) => t.length)).toEqual([1, 2]);
    });

    it('rejects separators in tag renames', async () => {
      const { store } = await setup({ a: {} });
      await expect(store.renameTag(P('a'), 'x, y')).rejects.toThrow(/","/);
    });
  });
});

describe('override storage', () => {
  it('round-trips through small chunks', () => {
    const o = new Map([['https://ü/' + 'x'.repeat(50), ['a/ü', 'b']]]);
    const enc = encodeOverrides(o, 7);
    expect(Object.keys(enc).length).toBeGreaterThan(3);
    expect(decodeOverrides(enc)).toEqual(o);
  });
});
