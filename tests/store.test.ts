import { describe, expect, it } from 'vitest';
import { parsePath as P } from '../src/core/tags';
import { decodeOverrides, encodeOverrides } from '../src/core/order';
import { setup } from './mock';

const ARCH = 'https://wiki.archlinux.org';

const tagsOf = (store: Awaited<ReturnType<typeof setup>>['store'], url: string) =>
  store.model.item(url)?.tags.map((t) => t.join('/'));

describe('existing bookmarks', () => {
  it('get their folder as primary tag', async () => {
    const { store } = await setup({ linux: { 'Arch wiki': ARCH } });
    expect(tagsOf(store, ARCH)).toEqual(['linux']);
  });

  it('toolbar/ and menu/ are top-level tags; unfiled root items are untagged', async () => {
    const { store } = await setup({ loose: 'https://loose.example' });
    expect(store.model.root.tags.map((t) => t.name)).toEqual(['toolbar', 'menu']);
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

  it('refuses to touch Firefox roots or move into self', async () => {
    const { store } = await setup({ a: { b: {} } });
    await expect(store.deleteTag(P('toolbar'))).rejects.toThrow(/root folder/);
    await expect(store.moveTag(P('a'), P('a/b'))).rejects.toThrow(/into itself/);
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

describe('override storage', () => {
  it('round-trips through small chunks', () => {
    const o = new Map([['https://ü/' + 'x'.repeat(50), ['a/ü', 'b']]]);
    const enc = encodeOverrides(o, 7);
    expect(Object.keys(enc).length).toBeGreaterThan(3);
    expect(decodeOverrides(enc)).toEqual(o);
  });
});
