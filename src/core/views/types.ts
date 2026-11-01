/**
 * Views: saved boolean filters over the tag tree. A var is a flat expression over tags; a view is
 * a flat expression over tags and vars. Precedence is `! > & > ^ > +` with no parentheses: vars
 * are the only grouping. Everything here is immutable: an edit returns new objects and leaves
 * unchanged `Def`s alone, which is what the evaluator's memo is keyed on.
 */

export type Op = '+' | '&' | '^';
export const OPS: readonly Op[] = ['+', '&', '^'];

/** A tag reference is a path key (`tech/linux`); a var reference is the var's name. */
export type Ref = { tag: string } | { var: string };

export interface Term {
  /** Ignored on the first term of an expression. */
  op: Op;
  not: boolean;
  ref: Ref;
}

export interface Def {
  /** Stable identity for the UI (open tabs, cursor keys); never shown or exported. */
  id: string;
  name: string;
  expr: Term[];
}

export interface ViewDefs {
  vars: Def[];
  views: Def[];
}

export type DefKind = keyof ViewDefs;

export const EMPTY_DEFS: ViewDefs = { vars: [], views: [] };

export const isVarRef = (r: Ref): r is { var: string } => 'var' in r;

/** Names are compared case-insensitively. */
export const nameKey = (name: string): string => name.toLowerCase();
