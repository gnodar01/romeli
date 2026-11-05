import { describe, expect, it } from 'vitest';
import { applyCompletion, complete, deleteBackSegment, deleteBackTag, parseTagInput } from '../src/core/complete';
import { fuzzyFilter, fuzzyMatch } from '../src/core/fuzzy';
import { setup } from './mock';

describe('fuzzyMatch', () => {
  it('matches subsequences with smart case', () => {
    expect(fuzzyMatch('lin', 'linux')).not.toBeNull();
    expect(fuzzyMatch('lnx', 'linux')!.positions).toEqual([0, 2, 4]);
    expect(fuzzyMatch('Lin', 'linux')).toBeNull();
    expect(fuzzyMatch('xyz', 'linux')).toBeNull();
  });

  it('prefers prefix and consecutive matches', () => {
    const r = fuzzyFilter('cl', ['tools/macro', 'CLI', 'cloud', 'clever'], (s) => s).map((x) => x.value);
    expect(r.slice(0, 1)).toEqual(['CLI']);
    expect(r).not.toContain('tools/macro'.replace('tools/macro', 'nope'));
  });
});

describe('tag completion (the create-bookmark walkthrough)', async () => {
  const { store } = await setup({
    linux: { terminal: { Alacritty: 'https://alacritty.org' }, kernel: {} },
    linus: {},
    tool: { CLI: {}, cloud: {} },
    music: {},
  });
  const m = store.model;

  it('"lin" suggests linux/ and linus/', () => {
    const c = complete(m, 'lin');
    expect(c.items.slice(0, 2).map((i) => i.insert).sort()).toEqual(['linus/', 'linux/']);
  });

  it('tab on linux/ then "term" completes linux/terminal/', () => {
    let s = complete(m, 'lin');
    const linux = s.items.find((i) => i.insert === 'linux/')!;
    let v = applyCompletion('lin', s, linux).value;
    expect(v).toBe('linux/');
    v += 'term';
    s = complete(m, v);
    expect(s.items[0].insert).toBe('linux/terminal/');
    v = applyCompletion(v, s, s.items[0]).value;
    expect(v).toBe('linux/terminal/');
  });

  it('after a comma, completes the new segment only', () => {
    let v = 'linux/terminal/, too';
    let s = complete(m, v);
    expect(s.items[0].insert).toBe('tool/');
    v = applyCompletion(v, s, s.items[0]).value + 'cl';
    s = complete(m, v);
    expect(s.items[0].insert).toBe('tool/CLI/');
    v = applyCompletion(v, s, s.items[0]).value;
    expect(v).toBe('linux/terminal/, tool/CLI/');
    expect(parseTagInput(m, v)).toEqual([['linux', 'terminal'], ['tool', 'CLI']]);
  });

  it('offers to create unknown tags', () => {
    const s = complete(m, 'tool/newthing');
    const create = s.items.find((i) => i.isNew)!;
    expect(create.insert).toBe('tool/newthing/');
    expect(complete(m, 'nope/deeper').items.find((i) => i.isNew)!.insert).toBe('nope/deeper/');
  });

  it('finds deep tags from the top level', () => {
    expect(complete(m, 'kern').items.map((i) => i.insert)).toContain('linux/kernel/');
  });

  it('canonicalizes case of existing tags', () => {
    expect(parseTagInput(m, 'TOOL/cli/new')).toEqual([['tool', 'CLI', 'new']]);
  });
});

import { ACTIONS, ACTION_GROUPS, DEFAULT_BINDINGS, SCREENS, bindingsFor, inputAction, mergeBindings, parseKeys, screenHas, type Action } from '../src/core/keymap';
describe('keymap', () => {
  it('groups every action exactly once, each usable on some screen', () => {
    const grouped = ACTION_GROUPS.flatMap(([, a]) => a);
    expect([...grouped].sort()).toEqual(Object.keys(ACTIONS).sort());
    for (const a of Object.keys(ACTIONS) as Action[]) expect(SCREENS.some((s) => screenHas(s, a)), a).toBe(true);
  });

  it.each(SCREENS)('binds no key twice on %s, and no binding is a prefix of another', (screen) => {
    const keys = Object.values(bindingsFor(DEFAULT_BINDINGS, screen)).flat();
    expect(keys.length).toBe(new Set(keys).size);
    const seqs = keys.map((k) => parseKeys(k).join(' '));
    for (const a of seqs) for (const b of seqs) if (a !== b) expect(b.startsWith(a + ' '), `${a} shadows ${b}`).toBe(false);
  });

  it('maps single key presses to text-input actions, following overrides', () => {
    const ev = (key: string, mods: { ctrlKey?: boolean; shiftKey?: boolean } = {}) => ({ key, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...mods });
    expect(inputAction(DEFAULT_BINDINGS, ev('Tab'))).toBe('complete');
    expect(inputAction(DEFAULT_BINDINGS, ev('Tab', { shiftKey: true }))).toBe(null);
    expect(inputAction(DEFAULT_BINDINGS, ev('w', { ctrlKey: true }))).toBe('deleteBack');
    const b = mergeBindings({ complete: ['<C-l>'], deleteBack: ['<C-h>', 'gg'] });
    expect(inputAction(b, ev('Tab'))).toBe(null);
    expect(inputAction(b, ev('l', { ctrlKey: true }))).toBe('complete');
    expect(inputAction(b, ev('h', { ctrlKey: true }))).toBe('deleteBack');
    expect(inputAction(b, ev('g'))).toBe(null);
  });
});

describe('delete back (C-w)', () => {
  it('drops the last segment in the tags field', () => {
    expect(deleteBackSegment('media/blogs/')).toBe('media/');
    expect(deleteBackSegment('media/bl')).toBe('media/');
    expect(deleteBackSegment('a/b/, c')).toBe('a/b/,');
    expect(deleteBackSegment('a/')).toBe('');
  });

  it('strips text after the last tag first, then one tag at a time', () => {
    const tags = new Set(['linux/', 'linux/kernel/']);
    const isTag = (p: string) => tags.has(p);
    expect(deleteBackTag('linux/kernel/My a/b title', isTag)).toBe('linux/kernel/');
    expect(deleteBackTag('linux/kernel/', isTag)).toBe('linux/');
    expect(deleteBackTag('linux/ker', isTag)).toBe('linux/');
    expect(deleteBackTag('linux/', isTag)).toBe('');
    expect(deleteBackTag('kern', isTag)).toBe('');
    expect(deleteBackTag('/x', isTag)).toBe('');
    expect(deleteBackTag('', isTag)).toBe('');
  });
});
