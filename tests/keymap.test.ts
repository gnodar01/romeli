import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, eventToKey, formatBindings, fullBindings, platformWarnings, sanitizeBindings } from '../src/core/keymap';

const ev = (key: string, mods: Partial<Record<'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey', boolean>> = {}, code?: string) => ({
  key,
  code,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
});

describe('eventToKey', () => {
  it('maps macOS Option characters back to the physical key', () => {
    expect(eventToKey(ev('˚', { altKey: true }, 'KeyK'))).toBe('<A-k>');
    expect(eventToKey(ev('', { altKey: true, shiftKey: true }, 'KeyK'))).toBe('<A-K>');
    expect(eventToKey(ev('Dead', { altKey: true }, 'KeyE'))).toBe('<A-e>');
    expect(eventToKey(ev('¡', { altKey: true }, 'Digit1'))).toBe('<A-1>');
  });
  it('keeps printable Alt characters and everything without Alt', () => {
    expect(eventToKey(ev('k', { altKey: true }, 'KeyK'))).toBe('<A-k>');
    expect(eventToKey(ev('!', { altKey: true, shiftKey: true }, 'Digit1'))).toBe('<A-!>');
    expect(eventToKey(ev('é', {}, 'KeyE'))).toBe('é');
    expect(eventToKey(ev('Dead', {}, 'KeyE'))).toBeNull();
    expect(eventToKey(ev('u', { ctrlKey: true }, 'KeyU'))).toBe('<C-u>');
  });
});

describe('bindings JSON', () => {
  it('exports every given action with overrides applied', () => {
    const full = fullBindings({ up: ['K'] }, ['up', 'down']);
    expect(full).toEqual({ up: ['K'], down: DEFAULT_BINDINGS.down });
  });
  it('imports only the differences from the defaults', () => {
    const { bindings, problems } = sanitizeBindings({ ...fullBindings({}, ['up', 'down', 'top']), down: ['J'], top: 'gg <Home> <C-g>' });
    expect(bindings).toEqual({ down: ['J'], top: ['gg', '<Home>', '<C-g>'] });
    expect(problems).toEqual([]);
  });
  it('reports unknown actions and bad values, keeping the rest', () => {
    const { bindings, problems } = sanitizeBindings({ nope: ['x'], up: [1], down: ['a b'], quit: [] });
    expect(bindings).toEqual({ quit: [] });
    expect(problems).toEqual(['unknown action "nope"', 'up: expected a list of keys', 'down: expected a list of keys']);
    expect(sanitizeBindings([]).problems).toEqual(['not an object']);
  });
  it('formats one action per line, quoting awkward keys', () => {
    const b = { up: ['k', '<Up>'], quit: [','], help: ['"', '\\'] };
    expect(formatBindings(b)).toBe('{\n  "up": ["k", "<Up>"],\n  "quit": [","],\n  "help": ["\\"", "\\\\"]\n}');
    expect(JSON.parse(formatBindings(b))).toEqual(b);
  });
  it('round-trips', () => {
    const overrides = { up: ['K', '<C-p>'], quit: [] };
    expect(sanitizeBindings(JSON.parse(JSON.stringify(fullBindings(overrides, ['up', 'down', 'quit'])))).bindings).toEqual(overrides);
  });
});

describe('platformWarnings', () => {
  const b = { up: ['<D-k>'], down: ['<A-˚>'], tabClose: ['<C-w>'], top: ['gg', '<C-u>'] };
  it('flags ⌘ and reserved Ctrl keys off macOS, and Option characters everywhere', () => {
    expect(platformWarnings(b, false).map((w) => w.split(' ')[0])).toEqual(['<D-k>', '<A-˚>', '<C-w>']);
    expect(platformWarnings(b, true).map((w) => w.split(' ')[0])).toEqual(['<A-˚>']);
  });
});
