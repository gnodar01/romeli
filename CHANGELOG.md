# romeli Changelog

All notable changes to romeli. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.1] - 2026-10-27

### Fixed

- When pressing `o` to open an item, Firefox fell back to using first created window instead of the last focused one
  due to extension-API limitations (Chrome support is more robust). This has been fixed by adding a listener, and having
  romeli keep track of focused windows itself via `storage.session` state. Now pressing `o` will always place the item
  in the active tab of the last-focused, unminimized, *normal* window, or the last-focused, *normal* window if all are
  minimized.

## [0.3.0] - 2026-10-26

### Added

- **Merge duplicates.** A folder can hold the same URL more than once. The launch "tidy up" prompt (alongside
  folder-name normalization) now offers to merge such duplicates, keeping the oldest copy, and `u` undoes it. The
  settings page has a *merge* button too.
- MIT license added.
- **Firefox auto-update.** The Firefox manifest now has an `update_url` pointing at `updates.json` in this repo, so
  installed copies update themselves. `npm run release:firefox` publishes the signed `.xpi` (and the Chrome zip, if
  built) as a GitHub Release and adds the entry to `updates.json`. Testers on 0.2.0 or older need to install this
  version by hand once.

### Fixed

- Two bookmarks with the same URL in the same folder crashed the browser view. They now show as one entry, and
  deleting that entry removes both copies.

## [0.2.0] - 2026-10-25

### Added

- **Chrome support.** One codebase for both browsers, with browser-specific API differences accounted for.
  The core is now browser-agnostic, and everything browser-specific lives behind a `Platform` interface.
  - Chrome's roots are found by `folderType`, preferring the signed-in account's (`syncing`) bookmarks.
  - Chrome uses `activeTab` instead of `tabs`, so there's no install warning, and gets favicons from `_favicon`.
  - Settings in Chrome can't change its own global keyboard shortcuts, so the options page shows them
    read-only with a link to `chrome://extensions/shortcuts`.
  - There is no `menu/` tag on Chrome.
- **Reveal the current page.** The open-browser shortcut and toolbar button jump to the current page's primary tag
  when it's bookmarked, including when the romeli window is already open.
- **`g[` / `g]`** go to an item's previous / next tag, wrapping around.
- **Keymap JSON import/export** (Settings → *browser keys*), separate from the theme. Actions left out keep their
  defaults. ⌥ keys are written by physical key (`<A-k>`, not `˚`), and applying warns about keys unlikely to work on
  the current OS (⌘ keys off macOS, and the Ctrl keys Firefox and Chrome keep for themselves on Windows/Linux).

### Changed

- **Fewer `storage.sync` writes.** Each bookmark op saves tag-order overrides once at the end (`Store.batched`), even
  when it touches many items or fails part way, and only chunks that actually changed are written. This keeps
  bulk operations under Chrome's limit of 120 sync writes per minute.

### Fixed

- A long tag path in the header pushed the tab list out of place. The path is now truncated with an ellipsis.

## [0.1.0] - 2026-10-24

First release, Firefox only.

### Added

- Native Firefox bookmarks managed as [geekmarks](https://geekmarks.dmitryfrank.com/)-style hierarchical tags.
- A keyboard-only, yazi-like Miller-column browser: navigation, history, tabs, visual selection, yank/cut/paste of
  items and tag subtrees, create/rename/edit, delete one copy (`d`) or every copy (`D`), find, fuzzy filter, fuzzy
  jump (`z`), search, sorting, recursive view, copy URL/name/path, and undo/redo for every op. Every key remappable.
- A create/edit popup with tag-list completion
- Global shortcuts to open romeli and to bookmark the current page.
- Tag order per item (oldest copy is primary), with reorders stored in `storage.sync` so they sync.
- Favicons captured from open tabs; nothing is fetched.
- **Customizable theme.** 13 palette colors (Dracula by default) drive about 50 semantic roles. Each role can point
  at another palette slot or a fixed CSS color. Presets (Dracula, Alucard, Gruvbox, Nord), font family, font size
  and row height, JSON copy/paste, and live sync across every open window. Native scrollbars and dropdowns go light
  or dark to match the background.
- **Folder-name normalization.** Folder names containing `,` or `/` (which separate tags) can be renamed on launch
  (`,`→`;`, `/`→`|`) in one undoable step, or from settings. Renames reject both characters.
- Find (`/`) highlights every match and shows `[n/m]` in the status bar; `n`/`N` step through them.
- A grouped, scrollable key-reference pane on `?`, `~` or `F1`.
- `s` searches bookmarks and `S` searches tags; Shift+Enter opens the result in a new browser tab or romeli tab.
- Bookmark form: Enter cycles name → url → tags (Shift+Enter goes back), and ⌘↵ / Ctrl+↵ saves.
- Settings: record global shortcuts by pressing them, separate macOS defaults (`MacCtrl+Shift+M` /
  `MacCtrl+Shift+B`), and errors that stay until dismissed.
- Scripts to bump the version, build, and sign an unlisted `.xpi` through AMO.

[Unreleased]: https://github.com/gnodar01/romeli/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/gnodar01/romeli/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/gnodar01/romeli/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/gnodar01/romeli/commits/v0.1.0
