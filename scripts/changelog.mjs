// CHANGELOG.md helpers for the release scripts (Keep a Changelog layout: `## [x.y.z] - date` sections and a
// footer of `[x.y.z]: compare-url` links).
import { readFileSync } from 'node:fs';

export const CHANGELOG = 'CHANGELOG.md';
const REPO_URL = 'https://github.com/gnodar01/romeli';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const heading = (version) => new RegExp(`^## \\[${esc(version)}\\].*$`, 'm');

export const read = () => readFileSync(CHANGELOG, 'utf8');

// The body of the version's section (between its heading and the next `## ` or the link footer), or null.
export function section(text, version) {
  const m = heading(version).exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  const end = rest.search(/^(## |\[[^\]]+\]: )/m);
  return (end < 0 ? rest : rest.slice(0, end)).trim() || null;
}

// Dates the version's heading and points the footer at it: [Unreleased] compares from the new tag, and the
// version gets its own compare link (from the tag [Unreleased] used to start at).
export function finalize(text, version, date) {
  text = text.replace(heading(version), `## [${version}] - ${date}`);
  const unreleased = /^\[Unreleased\]: .*\/compare\/(v\S+?)\.\.\.HEAD$/m.exec(text);
  if (!unreleased) throw new Error(`${CHANGELOG}: no "[Unreleased]: …/compare/vX.Y.Z...HEAD" link`);
  const prev = unreleased[1];
  let footer = `[Unreleased]: ${REPO_URL}/compare/v${version}...HEAD`;
  if (!new RegExp(`^\\[${esc(version)}\\]: `, 'm').test(text) && prev !== `v${version}`) {
    footer += `\n[${version}]: ${REPO_URL}/compare/${prev}...v${version}`;
  }
  return text.replace(unreleased[0], footer);
}
