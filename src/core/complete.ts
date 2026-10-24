import { fuzzyFilter, type Match } from './fuzzy';
import { findChild, type Model, type TagNode } from './model';
import { formatPath, parseTagList } from './tags';
import type { TagPath } from './types';

export interface Completion {
  /** Text replacing the active segment, e.g. 'linux/terminal/'. */
  insert: string;
  /** Display label (same as insert for existing tags). */
  label: string;
  isNew: boolean;
  /** Highlight positions within `label`. */
  positions: number[];
  tag?: TagNode;
}

export interface CompletionState {
  /** Offset in the input where the active segment starts. */
  start: number;
  /** Offset where it ends (the caret). */
  end: number;
  query: string;
  items: Completion[];
}

const DEEP_LIMIT = 30;

/**
 * Completion for a comma separated list of tag paths. Only the segment under the caret is
 * completed: its directory part is resolved exactly (case-insensitive) and the last component is
 * fuzzy-matched against that tag's children. Matches deeper in the tree follow, ranked lower.
 */
export function complete(model: Model, input: string, caret = input.length): CompletionState {
  const before = input.slice(0, caret);
  const comma = before.lastIndexOf(',');
  const raw = before.slice(comma + 1);
  const lead = raw.length - raw.trimStart().length;
  const start = comma + 1 + lead;
  const seg = raw.trimStart();
  const slash = seg.lastIndexOf('/');
  const dir = seg.slice(0, slash + 1);
  const q = seg.slice(slash + 1).trim();
  const dirParts = dir.split('/').map((s) => s.trim()).filter(Boolean);

  let parent: TagNode | undefined = model.root;
  for (const p of dirParts) parent = parent && findChild(parent, p);

  const items: Completion[] = [];
  const seen = new Set<string>();
  const push = (c: Completion) => {
    if (seen.has(c.insert)) return;
    seen.add(c.insert);
    items.push(c);
  };

  if (parent) {
    const offset = parent.path.length ? formatPath(parent.path).length : 0;
    for (const { value, match } of fuzzyFilter(q, parent.tags, (t) => t.name)) {
      const label = formatPath(value.path);
      push({ insert: label, label, isNew: false, positions: shift(match, offset), tag: value });
    }
  }

  if (q) {
    const deep = fuzzyFilter(seg.trim(), model.allTags(), (t) => formatPath(t.path).slice(0, -1));
    for (const { value, match } of deep.slice(0, DEEP_LIMIT)) {
      const label = formatPath(value.path);
      push({ insert: label, label, isNew: false, positions: match.positions, tag: value });
    }
    const exists = parent && findChild(parent, q);
    if (!exists) {
      const base = parent ? (parent.path.length ? formatPath(parent.path) : '') : dir.replace(/^\s+/, '');
      const insert = `${base}${q}/`;
      push({ insert, label: `+ create ${insert}`, isNew: true, positions: [] });
    }
  }

  return { start, end: caret, query: q, items };
}

function shift(m: Match, by: number): number[] {
  return m.positions.map((p) => p + by);
}

/** Apply a completion; returns the new input and caret position. */
export function applyCompletion(input: string, state: CompletionState, c: Completion): { value: string; caret: number } {
  const value = input.slice(0, state.start) + c.insert + input.slice(state.end);
  return { value, caret: state.start + c.insert.length };
}

/** Map each typed segment to existing names (case-insensitively) where they exist. */
export function canonicalize(model: Model, path: TagPath): TagPath {
  const out: TagPath = [];
  let cur: TagNode | undefined = model.root;
  for (const seg of path) {
    const next: TagNode | undefined = cur && findChild(cur, seg);
    out.push(next ? next.name : seg);
    cur = next;
  }
  return out;
}

export function parseTagInput(model: Model, input: string): TagPath[] {
  return parseTagList(input).map((p) => canonicalize(model, p));
}

/** Which typed paths (fully or partially) don't exist yet. */
export function newTags(model: Model, tags: TagPath[]): TagPath[] {
  return tags.filter((t) => !model.resolve(t));
}
