# romeli

A keyboard-driven Firefox extension that manages your **native Firefox bookmarks** as
[geekmarks-style hierarchical tags](https://dmitryfrank.com/projects/geekmarks/article), with a
[yazi](https://yazi-rs.github.io/)-like Miller-column interface in the [Dracula](https://draculatheme.com) palette.
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
| `Alt+Shift+M` | Open the browser (also the toolbar button) |
| `Alt+Shift+B` | Bookmark the current page (opens edit mode if already bookmarked) |

Change them in romeli's settings page or `about:addons → ⚙ → Manage Extension Shortcuts`.

**Tag input** (create/edit): `Tab` accepts a completion, `↑/↓` or `C-n/C-p` cycle, `,` starts the next tag,
`C-w` deletes back one level, `Enter` saves, `Esc` cancels. Unknown tags are offered as `+ create … [new]`.

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
| `/` `?` `n` `N` | find in column |
| `f` | filter column (fuzzy) |
| `z` `s` | fuzzy jump to any tag or item / search items by title or url |
| `,a` `,c` `,m` `,n` (+ shift = reverse) `,t` | sort alpha / added / modified / Firefox order, tags-first toggle |
| `R` | recursive view (include items from subtags) |
| `t` `1`–`9` `[` `]` `C-c` | tabs |
| `cc` `cn` `ct` | copy url / name / tag path |
| `u` `C-r` | undo / redo |
| `~` / `F1` | help (Enter runs the selected action) |
| `Esc` `q` | cancel / close |

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
via puppeteer.

## Notes

* Favicons are captured from your tabs (when you bookmark or visit a bookmarked page); nothing is fetched.
* On Linux/Windows `Ctrl+W` is reserved by Firefox and closes the window; use `Ctrl+Backspace` in the tag field there.
* A top-level folder literally named `toolbar`/`menu`/`mobile` in Other Bookmarks is shown as `toolbar~/` etc.
