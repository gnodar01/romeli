/**
 * Theme model. A theme is a palette of named colors plus semantic roles (one per UI element),
 * each pointing at a palette slot by default. Users override palette slots, roles (with a palette
 * slot name or any CSS color), the font and the row height. Only differences from the defaults
 * are stored.
 */

export const PALETTE = {
  bg: '#282a36',
  'bg-dark': '#21222c',
  'bg-darker': '#191a21',
  cur: '#44475a',
  fg: '#f8f8f2',
  comment: '#6272a4',
  cyan: '#8be9fd',
  green: '#50fa7b',
  orange: '#ffb86c',
  pink: '#ff79c6',
  purple: '#bd93f9',
  red: '#ff5555',
  yellow: '#f1fa8c',
} as const;

export type PaletteKey = keyof typeof PALETTE;
export const PALETTE_KEYS = Object.keys(PALETTE) as PaletteKey[];

interface RoleDef {
  label: string;
  default: PaletteKey;
}

const role = (label: string, def: PaletteKey): RoleDef => ({ label, default: def });

/** Semantic roles, grouped as shown on the options page. Each becomes the CSS variable `--<role>`. */
export const ROLE_GROUPS = {
  base: {
    bg: role('background', 'bg'),
    fg: role('text', 'fg'),
    dim: role('dim text, hints, item icons', 'comment'),
    border: role('box & popup borders', 'comment'),
    divider: role('pane dividers & separator lines', 'cur'),
    accent: role('titles, prompts, focused labels', 'pink'),
    caret: role('text cursor', 'pink'),
    'popup-bg': role('completions & which-key background', 'bg-dark'),
    backdrop: role('overlay backdrop (55% opacity)', 'bg-darker'),
    scrollbar: role('scrollbar thumb', 'cur'),
    'text-sel-bg': role('selected text background', 'purple'),
    'text-sel-fg': role('selected text', 'bg'),
  },
  header: {
    'path-root': role('path root', 'pink'),
    'path-sep': role('path separators', 'comment'),
    'path-cwd': role('current tag', 'purple'),
    'path-leaf': role('entry under cursor', 'fg'),
    tab: role('inactive tab', 'comment'),
    'tab-active-bg': role('active tab background', 'purple'),
    'tab-active-fg': role('active tab text', 'bg'),
  },
  lists: {
    tag: role('tags (names, icons, chips, completions)', 'purple'),
    'tag-primary': role('primary tag chip', 'pink'),
    'tag-new': role('new tag (will be created)', 'orange'),
    url: role('URLs', 'cyan'),
    title: role('preview title', 'fg'),
    'line-bg': role('current line (inactive pane, menus)', 'cur'),
    'cursor-tag-bg': role('cursor on a tag', 'purple'),
    'cursor-item-bg': role('cursor on a bookmark', 'cyan'),
    'cursor-fg': role('text under the cursor', 'bg'),
    selected: role('selected entries (visual mode)', 'yellow'),
    'mark-yank': role('yanked mark', 'green'),
    'mark-cut': role('cut mark & strike-through', 'red'),
    match: role('fuzzy match highlight', 'pink'),
    'find-bg': role('find match background', 'yellow'),
    'find-fg': role('find match text', 'bg'),
    star: role('primary-tag star in preview', 'yellow'),
    key: role('key names (help, which-key hints)', 'yellow'),
    'whichkey-key': role('which-key keys', 'pink'),
    'whichkey-border': role('which-key top border', 'purple'),
  },
  status: {
    'mode-fg': role('mode pill text', 'bg'),
    'mode-normal': role('normal mode pill', 'pink'),
    'mode-visual': role('visual / unset mode pill', 'orange'),
    'mode-select': role('select mode pill', 'yellow'),
    position: role('[n/m] position', 'pink'),
    'badge-yank': role('yank badge', 'green'),
    'badge-cut': role('cut badge', 'red'),
    'badge-select': role('selection badge', 'yellow'),
    'badge-find': role('find badge', 'yellow'),
    'badge-filter': role('filter / recording badge', 'cyan'),
  },
  messages: {
    ok: role('info messages, confirm "y"', 'green'),
    warn: role('warnings, key conflicts', 'orange'),
    error: role('errors, confirm border & "N"', 'red'),
  },
  settings: {
    'modified': role('customized setting', 'cyan'),
    'focus-bg': role('focused row background', 'bg-darker'),
    'row-line': role('row separator', 'bg-dark'),
    'button-bg': role('button background', 'cur'),
  },
} as const satisfies Record<string, Record<string, RoleDef>>;

type Groups = typeof ROLE_GROUPS;
export type RoleGroup = keyof Groups;
export type RoleKey = { [G in RoleGroup]: keyof Groups[G] }[RoleGroup] & string;

export const ROLES = Object.assign({}, ...Object.values(ROLE_GROUPS)) as Record<RoleKey, RoleDef>;
export const ROLE_KEYS = Object.keys(ROLES) as RoleKey[];

export const DEFAULT_FONT = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace";
export const DEFAULT_FONT_SIZE = 13;
export const DEFAULT_ROW = 20;

/** Stored theme: only what differs from the defaults. */
export interface Theme {
  palette?: Partial<Record<PaletteKey, string>>;
  /** A palette key or a CSS color. */
  roles?: Partial<Record<RoleKey, string>>;
  font?: string;
  fontSize?: number;
  row?: number;
}

export interface Preset {
  name: string;
  palette: Record<PaletteKey, string>;
}

export const PRESETS: Preset[] = [
  { name: 'Dracula', palette: { ...PALETTE } },
  {
    name: 'Alucard',
    palette: {
      bg: '#fffbeb',
      'bg-dark': '#f4efd9',
      'bg-darker': '#e9e3ca',
      cur: '#cfcfde',
      fg: '#1f1f1f',
      comment: '#635d97',
      cyan: '#036a96',
      green: '#14710a',
      orange: '#a34d14',
      pink: '#a3144d',
      purple: '#644ac9',
      red: '#cb3a2a',
      yellow: '#846e15',
    },
  },
  {
    name: 'Gruvbox',
    palette: {
      bg: '#282828',
      'bg-dark': '#1d2021',
      'bg-darker': '#141617',
      cur: '#3c3836',
      fg: '#ebdbb2',
      comment: '#928374',
      cyan: '#8ec07c',
      green: '#b8bb26',
      orange: '#fe8019',
      pink: '#d3869b',
      purple: '#83a598',
      red: '#fb4934',
      yellow: '#fabd2f',
    },
  },
  {
    name: 'Nord',
    palette: {
      bg: '#2e3440',
      'bg-dark': '#272c36',
      'bg-darker': '#20242c',
      cur: '#434c5e',
      fg: '#eceff4',
      comment: '#7b88a1',
      cyan: '#88c0d0',
      green: '#a3be8c',
      orange: '#d08770',
      pink: '#b48ead',
      purple: '#81a1c1',
      red: '#bf616a',
      yellow: '#ebcb8b',
    },
  },
];

const isPaletteKey = (v: string): v is PaletteKey => Object.hasOwn(PALETTE, v);

/** A permissive color check usable without a DOM; the UI passes `CSS.supports` instead. */
export function looksLikeColor(v: string): boolean {
  return (
    /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ||
    /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([-\w\s.,%/+]*\)$/i.test(v) ||
    /^[a-z]+$/i.test(v)
  );
}

const clampInt = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : undefined;

/**
 * Validate an untrusted theme (storage or pasted JSON) and drop defaults, unknown keys and bad
 * values. Returns the compact theme plus human-readable problems.
 */
export function sanitizeTheme(raw: unknown, isColor: (v: string) => boolean = looksLikeColor): { theme: Theme; problems: string[] } {
  const problems: string[] = [];
  const theme: Theme = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { theme, problems: raw == null ? [] : ['not an object'] };
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : undefined);

  const palette: Partial<Record<PaletteKey, string>> = {};
  for (const [k, v] of Object.entries((r.palette as object) ?? {})) {
    const s = str(v);
    if (!isPaletteKey(k)) problems.push(`unknown palette color "${k}"`);
    else if (!s || isPaletteKey(s) || !isColor(s)) problems.push(`palette ${k}: invalid color "${String(v)}"`);
    else if (s.toLowerCase() !== PALETTE[k]) palette[k] = s;
  }
  if (Object.keys(palette).length) theme.palette = palette;

  const roles: Partial<Record<RoleKey, string>> = {};
  for (const [k, v] of Object.entries((r.roles as object) ?? {})) {
    const s = str(v);
    if (!Object.hasOwn(ROLES, k)) problems.push(`unknown role "${k}"`);
    else if (!s || !(isPaletteKey(s) || isColor(s))) problems.push(`role ${k}: invalid value "${String(v)}"`);
    else if (s !== ROLES[k as RoleKey].default) roles[k as RoleKey] = s;
  }
  if (Object.keys(roles).length) theme.roles = roles;

  const font = str(r.font);
  if (font && font !== DEFAULT_FONT) {
    if (/[;{}<>]|url\(/i.test(font)) problems.push('font: invalid characters');
    else theme.font = font;
  }
  const fontSize = clampInt(r.fontSize, 8, 32);
  if (fontSize !== undefined && fontSize !== DEFAULT_FONT_SIZE) theme.fontSize = fontSize;
  const row = clampInt(r.row, 12, 48);
  if (row !== undefined && row !== DEFAULT_ROW) theme.row = row;
  return { theme, problems };
}

/** Resolve a role to a CSS value: palette refs become `var(--p-<key>)`. */
export function roleValue(theme: Theme, k: RoleKey): string {
  const v = theme.roles?.[k] ?? ROLES[k].default;
  return isPaletteKey(v) ? `var(--p-${v})` : v;
}

/** Resolve a role to a concrete color string (palette refs followed). */
export function resolveRole(theme: Theme, k: RoleKey): string {
  const v = theme.roles?.[k] ?? ROLES[k].default;
  return isPaletteKey(v) ? paletteValue(theme, v) : v;
}

export const paletteValue = (theme: Theme, k: PaletteKey): string => theme.palette?.[k] ?? PALETTE[k];

/** The full set of CSS custom properties for a theme. */
export function themeVars(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const k of PALETTE_KEYS) vars[`--p-${k}`] = paletteValue(theme, k);
  for (const k of ROLE_KEYS) vars[`--${k}`] = roleValue(theme, k);
  vars['--mono'] = theme.font ?? DEFAULT_FONT;
  vars['--font-size'] = `${theme.fontSize ?? DEFAULT_FONT_SIZE}px`;
  vars['--font-size-sm'] = `${(theme.fontSize ?? DEFAULT_FONT_SIZE) - 1}px`;
  vars['--row'] = `${theme.row ?? DEFAULT_ROW}px`;
  return vars;
}

/** Parse `#rgb`, `#rrggbb` (with optional alpha) or `rgb()/rgba()` with 0-255 channels. */
export function parseRgb(c: string): [number, number, number] | undefined {
  const hex = c.trim().match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((h) => h + h).join('') : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
  }
  const fn = c.trim().match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  return fn ? [+fn[1], +fn[2], +fn[3]] : undefined;
}

/**
 * Native widgets (scrollbars, dropdowns, spinners) must match the painted background, not the OS:
 * light when the `bg` role is lighter than perceptual mid-grey (relative luminance 0.18, L* ≈ 50). Unparsable colors count as dark.
 * `normalize` turns any CSS color into one `parseRgb` understands (the UI uses a canvas).
 */
export function schemeOf(theme: Theme, normalize: (c: string) => string = (c) => c): 'dark' | 'light' {
  const rgb = parseRgb(normalize(resolveRole(theme, 'bg')));
  if (!rgb) return 'dark';
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.18 ? 'light' : 'dark';
}

export function themeCss(theme: Theme, normalize?: (c: string) => string): string {
  const body = Object.entries(themeVars(theme))
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return `:root {\n${body}\n  color-scheme: ${schemeOf(theme, normalize)};\n}\n`;
}

/** Switch to a preset's palette, keeping role overrides, font and row height. */
export function applyPreset(theme: Theme, preset: Preset): Theme {
  return sanitizeTheme({ ...theme, palette: preset.palette }).theme;
}

/** Every setting spelled out (defaults included): the editable JSON export. */
export function fullTheme(theme: Theme): Required<Theme> {
  return {
    font: theme.font ?? DEFAULT_FONT,
    fontSize: theme.fontSize ?? DEFAULT_FONT_SIZE,
    row: theme.row ?? DEFAULT_ROW,
    palette: Object.fromEntries(PALETTE_KEYS.map((k) => [k, paletteValue(theme, k)])) as Record<PaletteKey, string>,
    roles: Object.fromEntries(ROLE_KEYS.map((k) => [k, theme.roles?.[k] ?? ROLES[k].default])) as Record<RoleKey, string>,
  };
}
