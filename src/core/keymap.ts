/**
 * yazi-flavoured keymap. Keys are written like yazi/vim: 'j', 'G', 'gg', '<C-u>', '<Space>',
 * '<Esc>', ',a'. Each action can have several bindings; users override per action.
 */
export const ACTIONS = {
  // navigation
  up: 'Move cursor up',
  down: 'Move cursor down',
  parent: 'Go to parent tag',
  enter: 'Enter tag / open item',
  top: 'Go to top',
  bottom: 'Go to bottom',
  halfUp: 'Half page up',
  halfDown: 'Half page down',
  pageUp: 'Page up',
  pageDown: 'Page down',
  back: 'Back in history',
  forward: 'Forward in history',
  goRoot: 'Go to top-level tags',
  goToolbar: 'Go to toolbar/',
  goMenu: 'Go to menu/',
  prevTagLocation: "Go to the item's previous tag",
  nextTagLocation: "Go to the item's next tag",
  // opening
  open: 'Open in current tab (on a tag: enter)',
  openNew: 'Open in new tab (on a tag: open all items)',
  // selection
  toggleSelect: 'Toggle selection and move down',
  visual: 'Visual mode (select range)',
  visualUnset: 'Visual mode (unselect range)',
  selectAll: 'Select all',
  invertSelection: 'Invert selection',
  // clipboard
  yank: 'Yank (p adds a tag)',
  cut: 'Cut (p moves)',
  paste: 'Paste into current tag',
  pasteInto: 'Paste into hovered tag',
  cancelYank: 'Cancel yank/cut',
  // edits
  delete: 'Delete copy / tag',
  deleteAll: 'Delete item everywhere',
  create: 'Create (end with / for a tag)',
  rename: 'Rename',
  editTags: 'Edit tags of item',
  // search
  find: 'Find next (in column)',
  findPrev: 'Find previous (in column)',
  findNext: 'Next match',
  findPrevMatch: 'Previous match',
  filter: 'Filter column',
  jump: 'Jump anywhere (fuzzy)',
  search: 'Search items by title/url (S-Enter: new tab)',
  searchTags: 'Search tags (S-Enter: new romeli tab)',
  // view
  sortAlpha: 'Sort alphabetically',
  sortAlphaRev: 'Sort alphabetically (reverse)',
  sortCreated: 'Sort by date added',
  sortCreatedRev: 'Sort by date added (reverse)',
  sortModified: 'Sort by date modified',
  sortModifiedRev: 'Sort by date modified (reverse)',
  sortNative: 'Sort by {browser} order',
  sortNativeRev: 'Sort by {browser} order (reverse)',
  toggleTagsFirst: 'Toggle tags first',
  toggleRecursive: 'Toggle recursive view',
  // tabs
  tabNew: 'New tab',
  tabClose: 'Close tab',
  tabPrev: 'Previous tab',
  tabNext: 'Next tab',
  tab1: 'Switch to tab 1',
  tab2: 'Switch to tab 2',
  tab3: 'Switch to tab 3',
  tab4: 'Switch to tab 4',
  tab5: 'Switch to tab 5',
  tab6: 'Switch to tab 6',
  tab7: 'Switch to tab 7',
  tab8: 'Switch to tab 8',
  tab9: 'Switch to tab 9',
  // clipboard (system)
  copyUrl: 'Copy URL',
  copyTitle: 'Copy title',
  copyPath: 'Copy tag path',
  // misc
  undo: 'Undo',
  redo: 'Redo',
  help: 'Show all keys',
  escape: 'Cancel / clear',
  quit: 'Close romeli',
} as const;

export type Action = keyof typeof ACTIONS;

/** An action's description, with `{browser}` filled in (e.g. "Sort by Firefox order"). */
export const describeAction = (a: Action, browser: string): string => ACTIONS[a].replace('{browser}', browser);

/** Sections for the help pane, in display order. */
export const ACTION_GROUPS: [string, Action[]][] = [
  ['navigation', ['up', 'down', 'parent', 'enter', 'top', 'bottom', 'halfUp', 'halfDown', 'pageUp', 'pageDown', 'back', 'forward', 'goRoot', 'goToolbar', 'goMenu', 'prevTagLocation', 'nextTagLocation']],
  ['open', ['open', 'openNew']],
  ['selection', ['toggleSelect', 'visual', 'visualUnset', 'selectAll', 'invertSelection']],
  ['yank & paste', ['yank', 'cut', 'paste', 'pasteInto', 'cancelYank']],
  ['edit', ['delete', 'deleteAll', 'create', 'rename', 'editTags', 'undo', 'redo']],
  ['search', ['find', 'findPrev', 'findNext', 'findPrevMatch', 'filter', 'jump', 'search', 'searchTags']],
  ['view', ['sortAlpha', 'sortAlphaRev', 'sortCreated', 'sortCreatedRev', 'sortModified', 'sortModifiedRev', 'sortNative', 'sortNativeRev', 'toggleTagsFirst', 'toggleRecursive']],
  ['tabs', ['tabNew', 'tabClose', 'tabPrev', 'tabNext', 'tab1', 'tab2', 'tab3', 'tab4', 'tab5', 'tab6', 'tab7', 'tab8', 'tab9']],
  ['clipboard', ['copyUrl', 'copyTitle', 'copyPath']],
  ['misc', ['help', 'escape', 'quit']],
];
export type Bindings = Record<Action, string[]>;

export const DEFAULT_BINDINGS: Bindings = {
  up: ['k', '<Up>'],
  down: ['j', '<Down>'],
  parent: ['h', '<Left>', '<BS>'],
  enter: ['l', '<Right>'],
  top: ['gg', '<Home>'],
  bottom: ['G', '<End>'],
  halfUp: ['<C-u>'],
  halfDown: ['<C-d>'],
  pageUp: ['<C-b>', '<PageUp>'],
  pageDown: ['<C-f>', '<PageDown>'],
  back: ['H'],
  forward: ['L'],
  goRoot: ['gh'],
  goToolbar: ['gb'],
  goMenu: ['gm'],
  prevTagLocation: ['g['],
  nextTagLocation: ['g]'],
  open: ['o', '<Enter>'],
  openNew: ['O', '<S-Enter>'],
  toggleSelect: ['<Space>'],
  visual: ['v'],
  visualUnset: ['V'],
  selectAll: ['<C-a>'],
  invertSelection: ['<C-i>'],
  yank: ['y'],
  cut: ['x'],
  paste: ['p'],
  pasteInto: ['P'],
  cancelYank: ['Y', 'X'],
  delete: ['d'],
  deleteAll: ['D'],
  create: ['a'],
  rename: ['r'],
  editTags: ['e'],
  find: ['/'],
  findPrev: [],
  findNext: ['n'],
  findPrevMatch: ['N'],
  filter: ['f'],
  jump: ['z'],
  search: ['s'],
  searchTags: ['S'],
  sortAlpha: [',a'],
  sortAlphaRev: [',A'],
  sortCreated: [',c'],
  sortCreatedRev: [',C'],
  sortModified: [',m'],
  sortModifiedRev: [',M'],
  sortNative: [',n'],
  sortNativeRev: [',N'],
  toggleTagsFirst: [',t'],
  toggleRecursive: ['R'],
  tabNew: ['t'],
  tabClose: ['<C-c>'],
  tabPrev: ['['],
  tabNext: [']'],
  tab1: ['1'],
  tab2: ['2'],
  tab3: ['3'],
  tab4: ['4'],
  tab5: ['5'],
  tab6: ['6'],
  tab7: ['7'],
  tab8: ['8'],
  tab9: ['9'],
  copyUrl: ['cc'],
  copyTitle: ['cn'],
  copyPath: ['ct'],
  undo: ['u'],
  redo: ['<C-r>'],
  help: ['?', '~', '<F1>'],
  escape: ['<Esc>'],
  quit: ['q'],
};

const NAMED: Record<string, string> = {
  ' ': 'Space',
  Enter: 'Enter',
  Escape: 'Esc',
  Tab: 'Tab',
  Backspace: 'BS',
  Delete: 'Del',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
};

type KeyEventLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey'> & { code?: string };

/**
 * The character a key press stands for. With Alt held, macOS's Option produces another character
 * (⌥K → '˚', ⌥E → a dead key), so a letter or digit key falls back to its physical key: `<A-k>`
 * then means the same key on every OS.
 */
function keyChar(e: KeyEventLike): string {
  const printable = e.key.length === 1 && e.key >= ' ' && e.key <= '~';
  if (!e.altKey || printable || !e.code) return e.key;
  if (/^Key[A-Z]$/.test(e.code)) return e.shiftKey ? e.code[3] : e.code[3].toLowerCase();
  if (/^Digit\d$/.test(e.code)) return e.code[5];
  return e.key;
}

/** Convert a keyboard event into a key token ('j', 'G', '<C-u>', '<S-Tab>'), or null for bare modifiers. */
export function eventToKey(e: KeyEventLike): string | null {
  const key = keyChar(e);
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Dead', 'Unidentified'].includes(key)) return null;
  const mods = (e.ctrlKey ? 'C-' : '') + (e.altKey ? 'A-' : '') + (e.metaKey ? 'D-' : '');
  const named = NAMED[key] ?? (/^F\d{1,2}$/.test(key) ? key : null);
  if (named) {
    const shift = e.shiftKey && named !== 'Space' ? 'S-' : '';
    const m = mods + shift;
    return `<${m}${named}>`;
  }
  if (key.length !== 1) return null;
  return mods ? `<${mods}${key}>` : key;
}

/** Split '<C-u>gg' into ['<C-u>', 'g', 'g']. */
export function parseKeys(seq: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < seq.length; ) {
    if (seq[i] === '<') {
      const close = seq.indexOf('>', i + 1);
      if (close > i + 1) {
        out.push(seq.slice(i, close + 1));
        i = close + 1;
        continue;
      }
    }
    out.push(seq[i++]);
  }
  return out;
}

export function mergeBindings(overrides: Partial<Record<string, string[]>> | undefined): Bindings {
  const out = { ...DEFAULT_BINDINGS };
  for (const [k, v] of Object.entries(overrides ?? {})) {
    if (k in ACTIONS && Array.isArray(v)) out[k as Action] = v.filter((s) => typeof s === 'string' && s.length);
  }
  return out;
}

/** Every action's keys, for the JSON export: the defaults with the user's overrides applied. */
export function fullBindings(overrides: Partial<Record<string, string[]>> | undefined, actions: readonly Action[]): Partial<Bindings> {
  const all = mergeBindings(overrides);
  return Object.fromEntries(actions.map((a) => [a, all[a]]));
}

/** JSON with one action per line: `"up": ["k", "<Up>"]`. */
export function formatBindings(b: Partial<Bindings>): string {
  const lines = Object.entries(b).map(([a, keys]) => `  ${JSON.stringify(a)}: [${keys!.map((k) => JSON.stringify(k)).join(', ')}]`);
  return `{\n${lines.join(',\n')}\n}`;
}

/**
 * Parse imported JSON ({ action: ["k", "<Up>"] }, or a space-separated string) into overrides:
 * only actions whose keys differ from the defaults. Omitted actions keep their defaults.
 */
export function sanitizeBindings(raw: unknown): { bindings: Partial<Record<Action, string[]>>; problems: string[] } {
  const problems: string[] = [];
  const bindings: Partial<Record<Action, string[]>> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { bindings, problems: ['not an object'] };
  for (const [k, v] of Object.entries(raw)) {
    if (!Object.hasOwn(ACTIONS, k)) {
      problems.push(`unknown action "${k}"`);
      continue;
    }
    const list = typeof v === 'string' ? v.split(/\s+/) : Array.isArray(v) ? v : null;
    if (!list || list.some((s) => typeof s !== 'string' || /\s/.test(s.trim()))) {
      problems.push(`${k}: expected a list of keys`);
      continue;
    }
    const keys = (list as string[]).map((s) => s.trim()).filter(Boolean);
    const a = k as Action;
    if (keys.join(' ') !== DEFAULT_BINDINGS[a].join(' ')) bindings[a] = keys;
  }
  return { bindings, problems };
}

/** Ctrl shortcuts Firefox and Chrome keep for themselves on Windows/Linux (on macOS they're on ⌘). */
const RESERVED_CTRL = new Set(['<C-w>', '<C-t>', '<C-n>', '<C-q>', '<C-Tab>', '<C-S-Tab>']);

/** Keys in `bindings` that are unlikely to work on this OS (e.g. after importing another machine's keys). */
export function platformWarnings(bindings: Partial<Record<Action, string[]>>, isMac: boolean): string[] {
  const out = new Set<string>();
  for (const [a, seqs] of Object.entries(bindings) as [Action, string[]][]) {
    for (const k of seqs.flatMap(parseKeys)) {
      const m = /^<((?:[CADS]-)+)(.+)>$/.exec(k);
      if (!m) continue;
      const [, mods, base] = m;
      if (!isMac && mods.includes('D-')) out.add(`${k} (${a}): ⌘ is the Windows/Super key here, usually taken by the OS`);
      if (mods.includes('A-') && base.length === 1 && !(base >= ' ' && base <= '~')) out.add(`${k} (${a}): a macOS ⌥ character; write the plain key instead`);
      if (!isMac && RESERVED_CTRL.has(k)) out.add(`${k} (${a}): reserved by the browser on Windows/Linux`);
    }
  }
  return [...out];
}

export interface Pending {
  keys: string[];
  /** Possible continuations: [remaining keys, action]. */
  next: [string, Action][];
}

export type FeedResult = { action: Action } | { pending: Pending } | { none: true };

const SEP = '\u0000';

/** Turns key tokens into actions, buffering multi-key sequences (which-key style). */
export class KeyResolver {
  private map = new Map<string, Action>();
  private prefixes = new Set<string>();
  private buf: string[] = [];

  constructor(bindings: Bindings) {
    for (const [action, seqs] of Object.entries(bindings) as [Action, string[]][]) {
      for (const seq of seqs) {
        const keys = parseKeys(seq);
        if (!keys.length) continue;
        this.map.set(keys.join(SEP), action);
        for (let i = 1; i < keys.length; i++) this.prefixes.add(keys.slice(0, i).join(SEP));
      }
    }
  }

  get pending(): string[] {
    return this.buf;
  }

  reset() {
    this.buf = [];
  }

  feed(key: string): FeedResult {
    const keys = [...this.buf, key];
    const id = keys.join(SEP);
    if (this.prefixes.has(id)) {
      this.buf = keys;
      return { pending: { keys, next: this.continuations(keys) } };
    }
    this.buf = [];
    const action = this.map.get(id);
    if (action) return { action };
    // An unknown continuation of a prefix: retry the key on its own (like vim).
    if (keys.length > 1) return this.feed(key);
    return { none: true };
  }

  private continuations(keys: string[]): [string, Action][] {
    const prefix = keys.join(SEP) + SEP;
    const out: [string, Action][] = [];
    for (const [id, action] of this.map) {
      if (id.startsWith(prefix)) out.push([id.slice(prefix.length).split(SEP).join(''), action]);
    }
    return out.sort((a, b) => a[0].localeCompare(b[0]));
  }
}
