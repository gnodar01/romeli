/** Small text helpers shared by the UI. */

/** A label split into plain text and its parenthesized comments ("(view editor only)", "(inactive pane, menus)"), for styling. */
export function descriptionParts(desc: string): { text: string; comment: boolean }[] {
  return desc
    .split(/(\([^)]*\))/)
    .filter(Boolean)
    .map((text) => ({ text, comment: /^\(.*\)$/.test(text) }));
}
