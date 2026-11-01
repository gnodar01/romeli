import { formatPath, parsePath, pathKey } from '../tags';
import { nameProblem, newId } from './defs';
import { isVarRef, nameKey, type Def, type DefKind, type Op, type Term, type ViewDefs } from './types';

/**
 * The text form of views, for import/export:
 *
 *     [vars]
 *     linux_news :=
 *         tech/linux/
 *       & media/articles/tech/
 *
 *     [views]
 *     linux := {linux_discussions} + {linux_news}
 *
 * A definition starts at column 0 with `name :=`; indented lines continue it; `#` lines are
 * comments. Operators are `+` (or `|`), `&`, `^`, written with spaces around them, and `!`
 * negates. A tag path ends with `/` (so `c++/` is fine); paths that would read as something else
 * are written as JSON strings ("!important/").
 */

export interface Problem {
  line: number;
  msg: string;
  /** Warnings don't stop an import. */
  warn?: boolean;
}

const quote = (path: string) => (/^[!{"&+^|#]/.test(path) || path.includes('\n') ? JSON.stringify(path) : path);

function formatTerm(t: Term, i: number): string {
  const operand = isVarRef(t.ref) ? `{${t.ref.var}}` : quote(formatPath(parsePath(t.ref.tag)));
  return `${i === 0 ? '    ' : `  ${t.op} `}${t.not ? '!' : ''}${operand}`;
}

export function formatDefs(defs: ViewDefs): string {
  const section = (kind: DefKind) =>
    [`[${kind}]`, ...defs[kind].map((d) => [`${d.name} :=`, ...d.expr.map(formatTerm)].join('\n'))].join('\n\n');
  return `${section('vars')}\n\n${section('views')}\n`;
}

interface Chunk {
  text: string;
  line: number;
}

/** Parse one definition body (its chunks of text with their line numbers) into terms. */
function parseBody(chunks: Chunk[], problems: Problem[]): Term[] | null {
  const terms: Term[] = [];
  for (const { text, line } of chunks) {
    const fail = (msg: string) => {
      problems.push({ line, msg });
      return null;
    };
    let i = 0;
    const ws = () => {
      while (i < text.length && /\s/.test(text[i])) i++;
    };
    for (ws(); i < text.length; ws()) {
      let op: Op = '+';
      if (terms.length) {
        const c = text[i];
        if (!'+|&^'.includes(c) || (i + 1 < text.length && !/\s/.test(text[i + 1]))) return fail(`expected an operator (+ & ^) at "${text.slice(i)}"`);
        op = c === '&' ? '&' : c === '^' ? '^' : '+';
        i++;
        ws();
      }
      let not = false;
      if (text[i] === '!') {
        not = true;
        i++;
        ws();
      }
      if (i >= text.length) return fail('expected a tag or {var} after the operator');
      if (text[i] === '"') {
        const m = /^"(?:[^"\\]|\\.)*"/.exec(text.slice(i));
        if (!m) return fail('unterminated quoted path');
        const path = parsePath(JSON.parse(m[0]) as string);
        if (!path.length) return fail('empty tag path');
        terms.push({ op, not, ref: { tag: pathKey(path) } });
        i += m[0].length;
      } else if (text[i] === '{') {
        const end = text.indexOf('}', i);
        if (end < 0) return fail('unterminated {var}');
        terms.push({ op, not, ref: { var: text.slice(i + 1, end).trim() } });
        i = end + 1;
      } else {
        const m = /^.*?\/(?=\s|$)/.exec(text.slice(i));
        if (!m) return fail(`tag paths end with / ("${text.slice(i)}")`);
        terms.push({ op, not, ref: { tag: pathKey(parsePath(m[0])) } });
        i += m[0].length;
      }
    }
  }
  return terms;
}

/**
 * Parse the text form. Ids are reused for names that already exist in `prev` (so open view tabs
 * stay attached). Problems without `warn` mean the text should not be applied.
 */
export function parseDefs(text: string, prev: ViewDefs = { vars: [], views: [] }): { defs: ViewDefs; problems: Problem[] } {
  const problems: Problem[] = [];
  const defs: ViewDefs = { vars: [], views: [] };
  type Pending = { kind: DefKind; name: string; line: number; chunks: Chunk[]; def?: Def };
  let kind = null as DefKind | null;
  let cur = null as Pending | null;
  const pending: Pending[] = [];

  text.split(/\r?\n/).forEach((raw, n) => {
    const line = n + 1;
    if (!raw.trim() || /^\s*#/.test(raw)) return;
    const header = /^\s*\[(vars|views)\]\s*$/.exec(raw);
    if (header) {
      kind = header[1] as DefKind;
      cur = null;
      return;
    }
    if (/^\s/.test(raw)) {
      if (cur) cur.chunks.push({ text: raw, line });
      else problems.push({ line, msg: 'indented line outside a definition' });
      return;
    }
    const at = raw.indexOf(':=');
    if (at < 0) return void problems.push({ line, msg: 'expected "name := …"' });
    if (!kind) return void problems.push({ line, msg: 'definition before a [vars] or [views] header' });
    cur = { kind, name: raw.slice(0, at).trim(), line, chunks: [{ text: raw.slice(at + 2), line }] };
    pending.push(cur);
  });

  for (const p of pending) {
    const problem = nameProblem(defs, p.kind, p.name);
    if (problem) {
      problems.push({ line: p.line, msg: problem });
      continue;
    }
    const expr = parseBody(p.chunks, problems);
    if (!expr) continue;
    const id = prev[p.kind].find((d) => nameKey(d.name) === nameKey(p.name))?.id ?? newId();
    p.def = { id, name: p.name, expr };
    defs[p.kind].push(p.def);
  }

  const varNames = new Set(defs.vars.map((d) => nameKey(d.name)));
  for (const p of pending) {
    for (const t of p.def?.expr ?? []) {
      if (!isVarRef(t.ref)) continue;
      if (p.kind === 'vars') problems.push({ line: p.line, msg: `vars cannot reference vars ({${t.ref.var}} in ${p.name})` });
      else if (!varNames.has(nameKey(t.ref.var))) problems.push({ line: p.line, msg: `unknown var {${t.ref.var}} in ${p.name}`, warn: true });
    }
  }
  problems.sort((a, b) => a.line - b.line);
  return { defs, problems };
}
