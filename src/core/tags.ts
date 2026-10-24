import type { TagPath } from './types';

/** Storage/identity key of a path: 'linux/terminal'. Root is ''. */
export const pathKey = (p: TagPath): string => p.join('/');

/** Display form with trailing slash: 'linux/terminal/'. Root is '/'. */
export const formatPath = (p: TagPath): string => (p.length ? p.join('/') + '/' : '/');

/** Parse 'linux/terminal/' (or 'linux/terminal') into ['linux', 'terminal']. */
export const parsePath = (s: string): TagPath =>
  s
    .split('/')
    .map((x) => x.trim())
    .filter(Boolean);

/** Parse a comma separated tag list: 'linux/terminal/, tool/CLI/'. */
export const parseTagList = (s: string): TagPath[] =>
  s
    .split(',')
    .map(parsePath)
    .filter((p) => p.length > 0);

export const formatTagList = (tags: TagPath[]): string => tags.map(formatPath).join(', ');

export const samePath = (a: TagPath, b: TagPath): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** True if `a` is a strict ancestor of `b`. The root is an ancestor of every non-root path. */
export const isAncestor = (a: TagPath, b: TagPath): boolean =>
  a.length < b.length && a.every((x, i) => x === b[i]);

export const isAncestorOrSelf = (a: TagPath, b: TagPath): boolean => samePath(a, b) || isAncestor(a, b);

export interface AddResult {
  tags: TagPath[];
  /** Set when the tag was not added because a descendant (or the tag itself) is already present. */
  redundant?: TagPath;
}

/**
 * Add `tag` to an ordered tag list, following geekmarks' redundancy rules:
 * - if the tag or one of its descendants is already present, nothing changes;
 * - ancestors of the tag are removed, and the tag takes the position of the first one removed
 *   (so replacing the primary ancestor keeps the item's location semantics);
 * - otherwise it is inserted at `at` (default: appended).
 */
export function addTag(tags: TagPath[], tag: TagPath, at = tags.length): AddResult {
  const existing = tags.find((t) => isAncestorOrSelf(tag, t));
  if (existing) return { tags, redundant: existing };
  let insertAt = -1;
  const out: TagPath[] = [];
  for (const t of tags) {
    if (isAncestor(t, tag)) {
      if (insertAt < 0) insertAt = out.length;
      continue;
    }
    out.push(t);
  }
  // Nothing was replaced, so `out` equals `tags` and `at` indexes it directly.
  if (insertAt < 0) insertAt = Math.min(at, out.length);
  out.splice(insertAt, 0, tag);
  return { tags: out };
}

/** Normalize a user-entered list: dedupe and collapse redundant ancestors, left to right. */
export function normalizeTags(tags: TagPath[]): TagPath[] {
  let out: TagPath[] = [];
  for (const t of tags) out = addTag(out, t).tags;
  return out;
}

/** Remove a tag (exact match) from the list. */
export const removeTag = (tags: TagPath[], tag: TagPath): TagPath[] => tags.filter((t) => !samePath(t, tag));

/** Replace `from` with `to`, keeping its position, then re-apply redundancy rules. */
export function replaceTag(tags: TagPath[], from: TagPath, to: TagPath): AddResult {
  const i = tags.findIndex((t) => samePath(t, from));
  const without = removeTag(tags, from);
  return addTag(without, to, i < 0 ? without.length : i);
}

/** Re-root `p` if it lives under `oldPrefix`. */
export function rebase(p: TagPath, oldPrefix: TagPath, newPrefix: TagPath): TagPath {
  return isAncestorOrSelf(oldPrefix, p) ? [...newPrefix, ...p.slice(oldPrefix.length)] : p;
}
