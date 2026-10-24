import { describe, expect, it } from 'vitest';
import { applyCompletion, complete, parseTagInput } from '../src/core/complete';
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
