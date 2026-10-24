# romeli

A keyboard-driven Firefox extension that manages your **native Firefox bookmarks** as
[geekmarks-style hierarchical tags](https://dmitryfrank.com/projects/geekmarks/article), with a
[yazi](https://yazi-rs.github.io/)-like Miller-column interface in the [Dracula](https://draculatheme.com) palette (fully themeable).
No server: Firefox's bookmark tree is the source of truth and Firefox Sync carries it everywhere.

## How tags map onto bookmarks

| Concept | Firefox representation |
|---|---|
| Hierarchical tag `linux/terminal/` | Folder `Other Bookmarks/linux/terminal` (created on demand, `mkdir -p`) |
| `toolbar/`, `menu/` | The Bookmarks Toolbar / Bookmarks Menu roots |
| Item with tags `linux/terminal/, tool/CLI/` | One bookmark **copy** per tag, all sharing the URL |
| Primary tag (first in list) | The oldest copy — i.e. the item's "real" location |
| Untagged item | Bookmark directly in *Other Bookmarks* (`/`) |

* WebExtensions cannot access Firefox's built-in tags, so secondary tags are real copies. This keeps the native
  tree, the Library and Firefox Sync complete.
* Tag order defaults to copy age (oldest = primary). Reorders done in romeli (`e`) are stored in `storage.sync`
  (only for items whose order differs), keyed by URL and tag *path*, so it syncs too.
* Deleting the primary copy makes the next tag primary automatically.
* Redundancy is collapsed geekmarks-style: adding `linux/terminal/` replaces `linux/`; adding `linux/` when
  `linux/terminal/` exists is a no-op with a warning.
* Edits made in Firefox's own bookmark manager win: romeli listens to bookmark events and rebuilds.

## Usage

| Shortcut | |
|---|---|
| `Ctrl+Shift+M` (macOS) · `Alt+Shift+M` | Open the browser (also the toolbar button) |
| `Ctrl+Shift+B` (macOS) · `Alt+Shift+B` | Bookmark the current page (opens edit mode if already bookmarked) |

Firefox picks the macOS or Windows/Linux default automatically on install. Change them in romeli's settings page
(press *record*, then the combination) or `about:addons → ⚙ → Manage Extension Shortcuts`.

**Bookmark form** (create/edit): `Enter` / `Shift+Enter` cycle name → url → tags, `⌘Enter` (macOS) or
`Ctrl+Enter` saves, `Esc` cancels. In the tags field `Tab` accepts a completion, `↑/↓` or `C-n/C-p` cycle,
`,` starts the next tag, `C-w` deletes back one level. Unknown tags are offered as `+ create … [new]`.

### Browser keys (all remappable in settings)

| Keys | Action |
|---|---|
| `h j k l`, arrows | parent / down / up / enter tag or open item |
| `gg` `G` `C-u` `C-d` `C-b` `C-f` | top / bottom / half page / page |
| `H` `L` | back / forward in history |
| `gh` `gb` `gm` | top level / `toolbar/` / `menu/` |
| `o` / `Enter` | open in current tab (on a tag: enter) |
| `O` | open in new tab (on a tag: open all its items) |
| `Space` `v` `V` `C-a` `C-i` | toggle select / visual / visual-unset / select all / invert |
| `y` then `p` | add the current tag to the yanked items (on tags: copy the subtree) |
| `x` then `p` | move: replace the tag the item was cut from (on tags: move the folder) |
| `P` | paste into the hovered tag · `Y`/`X` cancel |
| `d` | delete this copy / tag (items losing their last tag become untagged) — confirms |
| `D` | delete the item everywhere — confirms |
| `a` | create (`name/` creates a tag, a url or name opens the bookmark form) |
| `r` `e` | rename / edit an item's url, name and tag list |
| `/` `n` `N` | find in column: all occurrences highlighted, `[n/m]` in the status bar, `Esc` clears |
| `f` | filter column (fuzzy) |
| `z` | fuzzy jump to any tag or item |
| `s` / `S` | search bookmarks (title/url) / tags — `Shift+Enter` opens in a new browser tab / romeli tab |
| `,a` `,c` `,m` `,n` (+ shift = reverse) `,t` | sort alpha / added / modified / Firefox order, tags-first toggle |
| `R` | recursive view (include items from subtags) |
| `t` `1`–`9` `[` `]` `C-c` | tabs |
| `cc` `cn` `ct` | copy url / name / tag path |
| `u` `C-r` | undo / redo |
| `?` `~` `F1` | key reference pane (`j/k` scroll, `J/K` half page, `gg/G`, `Esc`) |
| `Esc` `q` | cancel / close |

### Theme

Settings → *theme*. The palette (13 colors, Dracula by default) drives about 50 semantic roles (selection, tags,
cursor lines, mode pills, marks, badges…). Point any role at another palette color (`purple`) or at a fixed CSS
color (`#ff0000`, `rgb(…)`). Presets (Dracula, Alucard, Gruvbox, Nord) swap the palette but keep your role
overrides; native controls (scrollbars, dropdowns) go light or dark to match the background. Font family, font size and row height are also there, and the whole theme can be
copied out and pasted back in as JSON. The theme syncs (`storage.sync` key `theme`, differences only) and applies
live to every open romeli window.

## Development

```sh
npm install
npm run build        # → dist/
npm start            # web-ext run (temporary install in a fresh Firefox profile)
npm test             # vitest: tag semantics, ordering, ops + undo, fuzzy/completion
npm run check        # svelte-check (TypeScript)
npm run package      # zip into artifacts/
```

Source layout: `src/core` holds all semantics (pure, tested against an in-memory bookmarks mock in `tests/mock.ts`),
`src/adapter` wraps the WebExtension APIs, `src/ui` is Svelte (browser, create popup, options),
`src/background` handles commands, windows and favicon capture.

**UI harness**: `npm run harness` serves the real UI at `http://localhost:5199/harness/{browser,create,options}.html`
with a mocked `browser` API and a seeded tree; with it running, `npm run e2e` drives the UI in headless Firefox
via puppeteer (`harness/drive*.mjs`, screenshots go to `/tmp`).

## Notes

* Folder names containing `,` or `/` are ambiguous in tag lists. On launch romeli offers to rename them
  (`,` → `;`, `/` → `|`, undoable with `u`); answering no is remembered (synced), and the settings page has
  a *normalize* button and the "ask on launch" toggle. Bookmark titles are never touched — only folder names
  are parsed as tags.
* Favicons are captured from your tabs (when you bookmark or visit a bookmarked page); nothing is fetched.
* On Linux/Windows `Ctrl+W` is reserved by Firefox and closes the window; use `Ctrl+Backspace` in the tag field there.
* A top-level folder literally named `toolbar`/`menu`/`mobile` in Other Bookmarks is shown as `toolbar~/` etc.
