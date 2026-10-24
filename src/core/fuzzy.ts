/**
 * Small fzf-flavoured matcher: ordered subsequence match with bonuses for consecutive runs,
 * word starts and prefix matches. Smart case: case-sensitive only if the query has uppercase.
 */
export interface Match {
  score: number;
  positions: number[];
}

const isBoundary = (s: string, i: number) => i === 0 || /[\s/\-_.:,()[\]]/.test(s[i - 1]) || (/[a-z]/.test(s[i - 1]) && /[A-Z]/.test(s[i]));

export function fuzzyMatch(query: string, text: string): Match | null {
  if (!query) return { score: 0, positions: [] };
  const sensitive = query !== query.toLowerCase();
  const q = sensitive ? query : query.toLowerCase();
  const t = sensitive ? text : text.toLowerCase();

  // Greedy forward pass to check for a match, then a backward pass from the end of that match
  // to tighten the window (the same trick fzf v1 uses).
  let qi = 0;
  let end = -1;
  for (let i = 0; i < t.length && qi < q.length; i++) if (t[i] === q[qi] && ++qi === q.length) end = i;
  if (end < 0) return null;
  let start = end;
  qi = q.length - 1;
  for (let i = end; i >= 0; i--) {
    if (t[i] === q[qi]) {
      if (--qi < 0) {
        start = i;
        break;
      }
    }
  }

  const positions: number[] = [];
  let score = 0;
  let prev = -2;
  qi = 0;
  for (let i = start; i <= end && qi < q.length; i++) {
    if (t[i] !== q[qi]) continue;
    let s = 16;
    if (prev === i - 1) s += 12;
    if (isBoundary(text, i)) s += 10;
    if (i === 0) s += 8;
    if (prev >= 0 && prev !== i - 1) s -= Math.min(i - prev - 1, 8);
    score += s;
    positions.push(i);
    prev = i;
    qi++;
  }
  score -= Math.min(start, 10);
  score -= Math.floor(text.length / 16);
  if (t === q) score += 30;
  else if (t.startsWith(q)) score += 15;
  return { score, positions };
}

export interface Ranked<T> {
  value: T;
  match: Match;
}

/** Filter and sort `items` by fuzzy score against `key(item)`. Stable for equal scores. */
export function fuzzyFilter<T>(query: string, items: T[], key: (item: T) => string): Ranked<T>[] {
  const out: (Ranked<T> & { i: number })[] = [];
  items.forEach((value, i) => {
    const match = fuzzyMatch(query, key(value));
    if (match) out.push({ value, match, i });
  });
  if (query) out.sort((a, b) => b.match.score - a.match.score || a.i - b.i);
  return out;
}
