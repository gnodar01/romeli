# romeli

A Firefox extension (Manifest V3) that manages **native Firefox bookmarks** as geekmarks-style hierarchical tags,
through a keyboard-only, yazi-like Miller-column UI (Dracula by default, fully themeable). There is no server: the Firefox bookmark
tree is the source of truth, and Firefox Sync carries it. The README has the user-facing keymap and the mapping rules.

## Commands

```sh
npm run build      # vite → dist/ (the extension)
npm test           # vitest: tests/*.test.ts (core semantics; in-memory mock in tests/mock.ts)
npm run check      # svelte-check (must stay at 0 errors / 0 warnings)
npx web-ext lint --source-dir dist   # expected: 0 errors, 2 benign warnings (Android min version, Svelte innerHTML)
npm start          # web-ext run: temporary install in a fresh Firefox profile (opens a real window)
npm run harness    # serves the real UI with a mocked `browser` at localhost:5199/harness/{browser,create,options}.html
npm run e2e        # with the harness running: puppeteer drives the UI in headless Firefox (harness/drive*.mjs)
```

Verify UI changes end to end, not only with the unit tests. Start the harness in the background, run the
relevant `harness/drive*.mjs <outdir>` script, and read its screenshots. Put scratch output in the session
scratchpad. Extend the drive scripts when you add behavior. Stop the harness afterwards
(`pkill -f "vite --config harness/vite.config.ts"`).

For refactors that should not change the look, capture the drive screenshots before and after and diff them with
ImageMagick: `compare -metric AE before.png after.png /dev/null` prints 0 when they're pixel-identical.

## Architecture

- `src/core/`: all semantics. Pure TypeScript with no `browser` globals, unit-tested.
  - `model.ts`: builds a `Model` from `bookmarks.getTree()`. Folders are `TagNode`s, bookmarks are `Copy`s, and an `Item` is all copies sharing one URL.
  - `store.ts`: **the only place that mutates bookmarks.**
    - Every op re-reads the tree first, so the native tree wins.
    - Every op returns an `OpResult` whose `UndoEntry` is expressed as URLs and tag paths, because bookmark ids change when bookmarks are recreated.
    - The key primitive is `setItemTags(url, title, tags)`. It reconciles an item's copies to an exact ordered tag list, and moves copies where it can instead of recreating them, so `dateAdded` survives.
  - `tags.ts`: path helpers and the geekmarks redundancy rules (`addTag`, `replaceTag`, `normalizeTags`).
  - `order.ts`: tag-order overrides stored in `storage.sync`, split into chunks of 2500 chars or fewer to stay under the per-item quota.
  - `complete.ts`: completion for the tag-list input. `fuzzy.ts`: an fzf-like matcher.
  - `keymap.ts`: actions, `ACTION_GROUPS` (help-pane sections), default bindings, and the multi-key `KeyResolver`.
  - `undo.ts`: the undo/redo stack.
  - `theme.ts`: palette (`PALETTE`), semantic roles (`ROLE_GROUPS`, each defaulting to a palette slot), presets, `sanitizeTheme`, and `themeCss`, which generates every color/font/row CSS variable (`--p-<slot>` for the palette, `--<role>` for roles). `color-scheme` (native scrollbars and dropdowns) is never a setting: `schemeOf` derives it from the brightness of the `bg` role.
- `src/adapter/browser.ts`: wrappers for the WebExtension APIs, plus settings (`storage.sync` key `settings`), the theme (`storage.sync` key `theme`, diffs only; `initTheme` paints from a `localStorage` CSS cache first, then follows storage changes), favicons (`storage.local`), change events, and opening URLs.
- `src/background/index.ts`:
  - handles the commands (`open-browser`, `create-bookmark`) and opens the browser and create windows as single-instance popups (ids kept in `storage.session`);
  - captures favicons from tabs.
- `src/ui/`: Svelte 5 (runes).
  - `browser/App.svelte`: the main app. It holds state, the action dispatcher `exec()`, and the overlays.
  - `browser/view.ts`: entry lists, sorting, stable entry keys, and shared UI types.
  - `create/`: the create/edit popup.
  - `options/`: settings (keymap, global shortcuts, folder-name normalization, `ThemeEditor.svelte`). App's styles sit in a `main :global { … }` block so child components like ThemeEditor share the row, input and button styles.
  - `components/`: shared components.
  - `theme.css`: base styles only. Colors, font and row height come from the generated theme.
- `harness/`: dev-only. `shim.ts` fakes `browser` using `tests/mock.ts` and seeds a tree, including deliberately "bad" folder names.

## Data model invariants (don't break these)

- **Tags are folders.**
  - Top-level tags are the children of "Other Bookmarks" (`unfiled_____`).
  - `toolbar/`, `menu/` and `mobile/` (mobile only when non-empty) are special tags mapped onto the Firefox roots. They are `fixed` and cannot be renamed, moved or deleted.
  - Items directly in "Other Bookmarks" are untagged (path `[]`, shown as `/`).
- **An item's extra tags are extra bookmark copies with the same URL.** WebExtensions cannot read or write native Firefox tags.
- **Item identity is the exact URL.**
- **Tag order:** copies are ordered by `dateAdded` ascending, and the oldest copy is primary (the item's "real" location). Only orders that differ from that are stored as overrides, keyed by URL with tag-path keys. Renaming or moving a tag must rewrite the overrides (`rewriteOrders`, `normalizeNames`).
- **Redundancy is collapsed:** adding a descendant tag replaces its ancestor in place, and adding an ancestor of an existing tag is a no-op with a warning.
- **`d` vs `D`:** `d` on an item removes that one copy, and removing the last copy deletes the bookmark. `D` removes every copy.
- **Deleting a tag** untags its items. Items left with no tags move to the root rather than being deleted.
- **`y` vs `x`:** `y`+`p` adds a tag. `x`+`p` replaces the tag the copy was cut from, keeping its position. On tags, `y`+`p` copies the subtree and `x`+`p` moves the folder.
- **Folder names must not contain `,` or `/`.** These separate entries in tag lists.
  - Romeli offers to normalize offending names (`,`→`;`, `/`→`|`); the "ask" flag is `settings.askNormalize`.
  - Renames reject both characters.
  - Bookmark titles are never touched, because they are never parsed.

## UX conventions (user preferences)

- **Keyboard first:** everything must be drivable from the keyboard. Follow yazi's bindings unless there's a reason not to, and keep every key remappable through `ACTIONS`/`DEFAULT_BINDINGS`. A new action needs an entry in `ACTION_GROUPS`; a test enforces this, and also that no key is bound twice.
- **Look:**
  - TUI feel: monospace, box-drawing style borders, a status bar with a mode pill and `[n/m]` counts.
  - Dracula by default, but every color is themeable: styles use **role** variables only (`var(--tag)`, `var(--cursor-fg)`…), never palette slots (`--p-*`) or raw colors. A new colored element gets a role in `ROLE_GROUPS` (defaulting to a palette slot) so it's customizable; tests enforce that every `var(--x)` used in `src/ui` exists. Use `var(--font-size-sm)` instead of fixed font sizes.
  - Native controls match the background romeli paints, not the OS or Firefox light/dark mode. The user chose one theme with a derived scheme over separate light and dark themes that follow the OS. Revisit that only if they ask.
  - Selection colour is purple with dark text, so it must stay distinguishable from the current-line grey.
- **Confirmations:** destructive actions (`d`, `D`, tag deletion, normalization) always ask y/N, and undo (`u`, `C-r`) must work for every store op.
- **Bookmark form:** Enter cycles name → url → tags, and ⌘↵ / Ctrl+↵ saves. In the tags field, Tab accepts a completion.
- **Global shortcuts:** `MacCtrl+Shift+M` / `MacCtrl+Shift+B` on macOS and `Alt+Shift+M` / `Alt+Shift+B` elsewhere, set through per-platform `suggested_key` in `public/manifest.json`.
- **About the user:** they're on macOS and like being asked about genuine design choices. Explain trade-offs briefly, and surface conflicts in their requests instead of silently picking one.

## Gotchas

- **Shell aliases** in this environment: `rm` is interactive and `cp` adds `-r`. Use `/bin/rm -f` and `/bin/cp -R` in scripts, or the command will hang or fail.
- **Real-extension automation doesn't work:** puppeteer/WebDriver BiDi cannot navigate to or see `moz-extension://` pages. Test the UI through the harness, and leave anything needing real APIs to the user (`npm start`).
- **Svelte:** never name a variable `state` (or anything else whose `$`-prefixed name is a rune) in a component. Svelte treats `$state` as a store subscription, which breaks the build. Use `$state.raw` for large immutable objects (the `Model`). Use `untrack(() => prop)` when a prop only seeds local state.
- **Svelte exports:** don't `export` types from a component's instance script. Put shared UI types in `src/ui/browser/view.ts`.
- **TypeScript:** svelte-check needs TS 6, so `typescript@~6` is pinned. Don't upgrade it to 7.
- **`Ctrl+W`** (delete back one level in the tag input) is reserved by Firefox on Linux/Windows.
- **Opening URLs** must target a `normal` window, never romeli's popup (`activeNormalTab`).
- **Event pages:** the background script is MV3 (`"type": "module"`) and can be suspended. Keep its state in `storage.session`, not in variables.
- **Firefox version:** the minimum is 140 (`data_collection_permissions`).
- **Harness flakiness:** the first harness run after editing source files can log `error loading dynamically imported module` (vite re-optimizing). Re-run before treating it as a bug.
- **Puppeteer in Firefox:** triple-click doesn't select an input's text. To replace a value, use `el.focus(); el.select()`, press Backspace, then type (see `setInput` in `harness/drive-theme.mjs`).

## State of the project

v1, the first round of feedback, and the customizable theme are implemented and verified through the harness. None of it
has been verified as an installed extension on real bookmarks by an agent. For the theme, that leaves the color pickers, the
JSON copy button, and native controls actually rendering light or dark. Check `git log` for history; the user commits their own work.
