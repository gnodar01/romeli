import { describe, expect, it } from 'vitest';
import { Model } from '../src/core/model';
import type { BNode } from '../src/core/types';
import { chromeRoots } from '../src/platform/chrome/roots';
import { firefoxRoots } from '../src/platform/firefox/roots';

const folder = (id: string, children: BNode[] = [], extra: Partial<BNode> = {}): BNode => ({ id, title: id, children, ...extra });
const mark = (id: string, url: string): BNode => ({ id, title: id, url });
const names = (m: Model) => m.root.tags.map((t) => t.name);

describe('firefox roots', () => {
  const tree = (mobile: BNode[] = [], unfiled: BNode[] = []) => [
    folder('root________', [
      folder('menu________'),
      folder('toolbar_____'),
      folder('unfiled_____', unfiled),
      folder('mobile______', mobile),
    ]),
  ];

  it('maps toolbar/ and menu/, and mobile/ only when non-empty', () => {
    expect(names(new Model(firefoxRoots(tree())))).toEqual(['toolbar', 'menu']);
    expect(names(new Model(firefoxRoots(tree([mark('m', 'https://m')]))))).toEqual(['toolbar', 'menu', 'mobile']);
  });

  it('marks user folders shadowed by special tags with ~', () => {
    const m = new Model(firefoxRoots(tree([], [folder('menu', [mark('x', 'https://x')])])));
    expect(names(m)).toContain('menu~');
    expect(m.item('https://x')!.tags).toEqual([['menu~']]);
  });
});

describe('chrome roots', () => {
  const local = (other: BNode[] = [], extra: BNode[] = []) =>
    folder('0', [
      folder('1', [], { folderType: 'bookmarks-bar', syncing: false }),
      folder('2', other, { folderType: 'other', syncing: false }),
      ...extra,
    ]);

  it('maps the bookmarks bar to toolbar/ and has no menu/', () => {
    const m = new Model(chromeRoots([local([mark('x', 'https://x')])]));
    expect(names(m)).toEqual(['toolbar']);
    expect(m.root.id).toBe('2');
    expect(m.item('https://x')!.tags).toEqual([[]]);
  });

  it('a user folder named menu is an ordinary tag; toolbar is shadowed', () => {
    const m = new Model(chromeRoots([local([folder('menu'), folder('toolbar')])]));
    expect(names(m).sort()).toEqual(['menu', 'toolbar', 'toolbar~']);
  });

  it('shows mobile/ only when it has bookmarks', () => {
    const mobile = (c: BNode[]) => folder('3', c, { folderType: 'mobile', syncing: false });
    expect(names(new Model(chromeRoots([local([], [mobile([])])])))).toEqual(['toolbar']);
    expect(names(new Model(chromeRoots([local([], [mobile([mark('m', 'https://m')])])])))).toEqual(['toolbar', 'mobile']);
  });

  it('prefers the account (syncing) folders over the local ones', () => {
    const tree = local(
      [mark('local', 'https://local')],
      [
        folder('40', [mark('bar', 'https://bar')], { folderType: 'bookmarks-bar', syncing: true }),
        folder('41', [mark('acct', 'https://acct')], { folderType: 'other', syncing: true }),
      ],
    );
    const m = new Model(chromeRoots([tree]));
    expect(m.root.id).toBe('41');
    expect(m.tag(['toolbar'])!.id).toBe('40');
    expect([...m.items.keys()].sort()).toEqual(['https://acct', 'https://bar']);
  });

  it('ignores managed bookmarks', () => {
    const managed = folder('9', [mark('corp', 'https://corp')], { folderType: 'managed' });
    const m = new Model(chromeRoots([local([], [managed])]));
    expect(names(m)).toEqual(['toolbar']);
    expect(m.item('https://corp')).toBeUndefined();
  });

  it('falls back to the well-known ids when folderType is missing (Chrome < 134)', () => {
    const tree = folder('0', [folder('1'), folder('2', [mark('x', 'https://x')]), folder('3', [mark('m', 'https://m')])]);
    const m = new Model(chromeRoots([tree]));
    expect(names(m)).toEqual(['toolbar', 'mobile']);
    expect(m.item('https://x')!.tags).toEqual([[]]);
  });
});
