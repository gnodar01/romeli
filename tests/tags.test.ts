import { describe, expect, it } from 'vitest';
import { addTag, normalizeTags, parsePath, parseTagList, replaceTag, formatTagList } from '../src/core/tags';

const P = parsePath;

describe('tag paths', () => {
  it('parses lists with trailing slashes and spaces', () => {
    expect(parseTagList('linux/terminal/, tool/CLI/')).toEqual([['linux', 'terminal'], ['tool', 'CLI']]);
    expect(parseTagList(' , linux ,')).toEqual([['linux']]);
    expect(formatTagList([['a', 'b'], []])).toBe('a/b/, /');
  });

  it('adding a descendant replaces its ancestor in place', () => {
    expect(addTag([P('linux'), P('tool')], P('linux/terminal')).tags).toEqual([P('linux/terminal'), P('tool')]);
  });

  it('adding an ancestor of an existing tag is redundant', () => {
    const r = addTag([P('linux/terminal')], P('linux'));
    expect(r.redundant).toEqual(P('linux/terminal'));
    expect(r.tags).toEqual([P('linux/terminal')]);
  });

  it('root is an ancestor of everything', () => {
    expect(addTag([[]], P('tool')).tags).toEqual([P('tool')]);
    expect(normalizeTags([P('a'), [], P('a/b'), P('c'), P('c')])).toEqual([P('a/b'), P('c')]);
  });

  it('replace keeps position', () => {
    expect(replaceTag([P('a'), P('b'), P('c')], P('a'), P('x')).tags).toEqual([P('x'), P('b'), P('c')]);
    expect(replaceTag([P('a'), P('b/c')], P('a'), P('b')).redundant).toEqual(P('b/c'));
  });
});
