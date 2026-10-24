import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyPreset,
  fullTheme,
  PALETTE,
  PALETTE_KEYS,
  PRESETS,
  resolveRole,
  ROLE_KEYS,
  ROLES,
  sanitizeTheme,
  schemeOf,
  themeCss,
  themeVars,
} from '../src/core/theme';

const uiFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? uiFiles(join(dir, e.name)) : /\.(svelte|css)$/.test(e.name) ? [join(dir, e.name)] : [],
  );

describe('theme defaults', () => {
  it('every role defaults to a palette color', () => {
    for (const k of ROLE_KEYS) expect(PALETTE_KEYS).toContain(ROLES[k].default);
  });

  it('the empty theme is the Dracula palette', () => {
    const vars = themeVars({});
    for (const k of PALETTE_KEYS) expect(vars[`--p-${k}`]).toBe(PALETTE[k]);
    expect(vars['--tag']).toBe('var(--p-purple)');
    expect(themeCss({})).toContain('color-scheme: dark');
  });

  it('every CSS variable used by the UI is defined by the theme', () => {
    const defined = new Set(Object.keys(themeVars({})));
    const used = new Set(uiFiles('src/ui').flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/var\((--[\w-]+)/g)].map((m) => m[1])));
    expect([...used].filter((v) => !defined.has(v))).toEqual([]);
  });

  it('UI styles use roles, never palette slots or raw colors', () => {
    for (const f of uiFiles('src/ui')) {
      const css = readFileSync(f, 'utf8');
      expect(css, f).not.toMatch(/var\(--p-/);
      expect(css.slice(css.indexOf('<style')), f).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    }
  });

  it('presets define the whole palette', () => {
    for (const p of PRESETS) expect(Object.keys(p.palette).sort()).toEqual([...PALETTE_KEYS].sort());
  });
});

describe('sanitizeTheme', () => {
  it('keeps only valid, non-default values', () => {
    const { theme, problems } = sanitizeTheme({
      palette: { bg: '#000000', fg: PALETTE.fg, nope: '#fff', red: 'purple', cyan: 'not a color!' },
      roles: { tag: 'pink', url: 'cyan', bogus: 'red', accent: '#123456', dim: 'rgb(1, 2, 3)' },
      scheme: 'light',
      fontSize: 13,
      row: 100,
      font: 'Iosevka, monospace',
    });
    expect(theme).toEqual({
      palette: { bg: '#000000' },
      roles: { tag: 'pink', accent: '#123456', dim: 'rgb(1, 2, 3)' },
      row: 48,
      font: 'Iosevka, monospace',
    });
    expect(problems).toHaveLength(4);
  });

  it('rejects CSS injection through the font', () => {
    const { theme, problems } = sanitizeTheme({ font: 'x; } body { display: none' });
    expect(theme.font).toBeUndefined();
    expect(problems).toHaveLength(1);
  });

  it('uses the given color validator', () => {
    expect(sanitizeTheme({ roles: { tag: 'rebeccapurple' } }, () => false).theme).toEqual({});
  });

  it('round-trips the full export to the compact form', () => {
    const t = { palette: { bg: '#101010' }, roles: { tag: 'green' }, row: 22 };
    expect(sanitizeTheme(fullTheme({})).theme).toEqual({});
    expect(sanitizeTheme(fullTheme(t)).theme).toEqual(t);
  });
});

describe('roles and presets', () => {
  it('roles follow the palette unless overridden with a color', () => {
    expect(resolveRole({ palette: { purple: '#abcdef' } }, 'tag')).toBe('#abcdef');
    expect(resolveRole({ palette: { purple: '#abcdef' }, roles: { tag: 'red' } }, 'tag')).toBe(PALETTE.red);
    expect(resolveRole({ roles: { tag: '#111111' } }, 'tag')).toBe('#111111');
  });

  it('a preset swaps the palette, keeping roles, font and row height', () => {
    const alucard = PRESETS.find((p) => p.name === 'Alucard')!;
    const t = applyPreset({ roles: { tag: 'green' }, row: 24, palette: { bg: '#000000' } }, alucard);
    expect(t.palette?.bg).toBe(alucard.palette.bg);
    expect(t).toMatchObject({ roles: { tag: 'green' }, row: 24 });
    expect(applyPreset(t, PRESETS[0])).toEqual({ roles: { tag: 'green' }, row: 24 });
  });
});

describe('color scheme', () => {
  it('follows the background brightness', () => {
    expect(schemeOf({})).toBe('dark');
    expect(schemeOf(applyPreset({}, PRESETS.find((p) => p.name === 'Alucard')!))).toBe('light');
    expect(schemeOf({ roles: { bg: 'rgb(240, 240, 240)' } })).toBe('light');
    expect(schemeOf({ roles: { bg: '#555' } })).toBe('dark');
    expect(schemeOf({ roles: { bg: 'fg' } })).toBe('light');
    expect(themeCss({ palette: { bg: '#ffffff' } })).toContain('color-scheme: light');
  });

  it('treats unparsable colors as dark unless normalized', () => {
    expect(schemeOf({ roles: { bg: 'white' } })).toBe('dark');
    expect(schemeOf({ roles: { bg: 'white' } }, () => '#ffffff')).toBe('light');
  });

  it('ignores a legacy scheme key', () => {
    expect(sanitizeTheme({ scheme: 'light' })).toEqual({ theme: {}, problems: [] });
  });
});
