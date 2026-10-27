# romeli

A Firefox and Chrome extension (Manifest V3) that manages **native browser bookmarks** as geekmarks-style hierarchical tags,
through a keyboard-only, yazi-like Miller-column UI (Dracula by default, fully themeable). There is no server: the browser's bookmark
tree is the source of truth, and its sync carries it. The README has the user-facing keymap and the mapping rules.
One codebase builds both: `TARGET=firefox|chrome` picks the platform at build time (`dist/firefox`, `dist/chrome`).

## Commands

```sh
npm run build      # vite → dist/firefox and dist/chrome (build:firefox / build:chrome for one)
npm test           # vitest: tests/*.test.ts (core semantics on every mock flavor; in-memory mock in tests/mock.ts)
npm run check      # svelte-check (must stay at 0 errors / 0 warnings)
npm run check:dist # each dist/ has only its own browser's code; manifest files exist
npm run lint:ext   # web-ext lint --self-hosted dist/firefox (allows update_url); expected: 0 errors, 2 benign warnings (Android min version, Svelte innerHTML)
npm start          # web-ext run: temporary install in a fresh Firefox profile (opens a real window)
npm run start:chrome    # same for Chrome: your installed Chrome, fresh temporary profile (needs build:chrome first)
npm run harness    # Firefox-shaped mock UI at localhost:5199/harness/{browser,create,options}.html
npm run harness:chrome  # Chrome-shaped mock UI (API exposed as `chrome`) at localhost:5198
npm run e2e [outdir]    # drive*.mjs against both harnesses (starts them if needed); screenshots in <outdir>/<target>/
npm run e2e:chrome-real # builds dist/chrome, loads it in Chrome for Testing, drives the REAL extension (harness/real-chrome.mjs)
npm run verify     # all of the above in order; run before handing work back
```

Verify UI changes end to end, not only with the unit tests: `node harness/e2e.mjs <scratchpad>/out [firefox|chrome]`,
then read the screenshots. A single script runs with `TARGET=chrome node harness/drive.mjs <outdir>` (harness must
be up). Put scratch output in the session scratchpad. Extend the drive scripts when you add behavior; use
`checker()` from `harness/lib.mjs` for assertions that should fail the run. Stop any harness you started yourself
(`pkill -f "vite --config harness/vite.config.ts"`). Chrome for Testing comes from
`npx @puppeteer/browsers install chrome@stable` (found in `~/.cache/puppeteer`, or set `CHROME`).

For refactors that should not change the look, capture the drive screenshots before and after and diff them with
ImageMagick: `compare -metric AE before.png after.png /dev/null` prints 0 when they're pixel-identical.

## Architecture

- `src/core/`: all semantics. Pure, browser-agnostic TypeScript with no `browser` globals, unit-tested. Never put
  browser ids, browser names or browser-specific behavior here.
  - `model.ts`: builds a `Model` from a `RootLayout` (which folder is "Other Bookmarks", which roots are special
    tags, which top-level names are reserved), resolved from `getTree()` by the platform. Folders are `TagNode`s,
    bookmarks are `Copy`s, and an `Item` is all copies sharing one URL.
  - `store.ts`: **the only place that mutates bookmarks.**
    - Every op re-reads the tree first, so the native tree wins.
    - Every op returns an `OpResult` whose `UndoEntry` is expressed as URLs and tag paths, because bookmark ids change when bookmarks are recreated.
    - The key primitive is `setItemTags(url, title, tags)`. It reconciles an item's copies to an exact ordered tag list, and moves copies where it can instead of recreating them, so `dateAdded` survives.
    - Order overrides are saved once per op: `batched()` defers `saveOrders` to the end of the outermost op.
  - `tags.ts`: path helpers and the geekmarks redundancy rules (`addTag`, `replaceTag`, `normalizeTags`).
  - `order.ts`: tag-order overrides stored in `storage.sync`, split into chunks of 2500 chars or fewer to stay under the per-item quota.
  - `complete.ts`: completion for the tag-list input. `fuzzy.ts`: an fzf-like matcher.
  - `keymap.ts`: actions, `ACTION_GROUPS` (help-pane sections), default bindings, and the multi-key `KeyResolver`.
  - `undo.ts`: the undo/redo stack.
  - `theme.ts`: palette (`PALETTE`), semantic roles (`ROLE_GROUPS`, each defaulting to a palette slot), presets, `sanitizeTheme`, and `themeCss`, which generates every color/font/row CSS variable (`--p-<slot>` for the palette, `--<role>` for roles). `color-scheme` (native scrollbars and dropdowns) is never a setting: `schemeOf` derives it from the brightness of the `bg` role.
- `src/platform/`: **the only place for browser-gated code.**
  - `types.ts`: the `Platform` interface (root resolver, browser name, hidden actions, favicon source, whether
    shortcuts are editable, bookmark events, background extras). `firefox/` and `chrome/` implement it.
  - `index.ts`: `platform`, chosen by the build-time constant `__TARGET__` (vite `define`), so the other
    browser's code is tree-shaken out (`check:dist` enforces it). Tests import `firefox`/`chrome` directly.
  - `ext.ts`: `ext`, the promise-based API namespace (`browser` in Firefox, `chrome` in Chrome). Use it instead of `browser.`.
  - `*/roots.ts`: pure root resolvers. Firefox: fixed `*_____` ids. Chrome: by `folderType`, preferring the
    account (`syncing: true`) set, falling back to ids `1`/`2`/`3`; `managed` ignored; no `menu/`.
  - `manifest.base.json` + `<target>/manifest.json`: deep-merged by `buildManifest` in the vite build, version from
    `package.json` (`npm run bump` only touches package.json). Chrome's PNG icons live in `chrome/icons/`
    (`node scripts/icons.mjs` regenerates them from `public/icons/romeli.svg`).
- `src/adapter/browser.ts`: wrappers for the WebExtension APIs (through `ext`), plus settings (`storage.sync` key `settings`), the theme (`storage.sync` key `theme`, diffs only; `initTheme` paints from a `localStorage` CSS cache first, then follows storage changes), favicons (`storage.local`), change events, and opening URLs.
- `src/background/index.ts` (a Firefox event page / a Chrome service worker):
  - handles the commands (`open-browser`, `create-bookmark`) and opens the browser and create windows as single-instance popups (ids kept in `storage.session`);
  - calls `platform.startBackground` (Firefox: captures favicons from tabs).
- `src/ui/`: Svelte 5 (runes).
  - `browser/App.svelte`: the main app. It holds state, the action dispatcher `exec()`, and the overlays.
  - `browser/view.ts`: entry lists, sorting, stable entry keys, and shared UI types.
  - `create/`: the create/edit popup.
  - `options/`: settings (keymap with its own JSON import/export, global shortcuts, folder-name normalization, `ThemeEditor.svelte`). App's styles sit in a `main :global { … }` block so child components like ThemeEditor share the row, input and button styles.
  - `components/`: shared components.
  - `theme.css`: base styles only. Colors, font and row height come from the generated theme.
- `harness/`: dev-only. `shim.ts` fakes the API (as `browser`, or as `chrome` with TARGET=chrome) using
  `tests/mock.ts` and seeds a tree, including deliberately "bad" folder names. `lib.mjs` has the launcher and
  `checker()`; `e2e.mjs` runs everything for both targets; `real-chrome.mjs` is the real-extension test.
- `tests/mock.ts`: `MockBookmarks(flavor)` with flavors `firefox`, `chrome`, `chrome-account`. Store tests run
  under `describe.each(FLAVORS)`. The Chrome flavor reproduces real Chrome quirks (no `type`, numeric ids,
  permanent folders refuse changes, same-folder `move` index counted *before* removal). `tests/contract.mjs`
  runs one API probe against both the mock and real Chrome; both must equal `tests/fixtures/chrome-bookmarks.json`
  (re-record with `node harness/real-chrome.mjs <out> --record` only if real Chrome changed).

## Data model invariants (don't break these)

- **Tags are folders.**
  - Top-level tags are the children of "Other Bookmarks" (Firefox `unfiled_____`, Chrome the `other` folder).
  - `toolbar/`, `menu/` and `mobile/` (mobile only when non-empty) are special tags mapped onto the browser's roots (Chrome has no `menu/`). They are `fixed` and cannot be renamed, moved or deleted.
  - Items directly in "Other Bookmarks" are untagged (path `[]`, shown as `/`).
- **An item's extra tags are extra bookmark copies with the same URL.** WebExtensions cannot read or write native Firefox tags.
- **Item identity is the exact URL.** A tag holds an item once: duplicate copies in one folder show as one entry,
  `Item.tags` lists each path once (`copies` keeps them all), and the launch "tidy up" prompt (with folder-name
  normalization, same `askNormalize` flag) offers `mergeDuplicates`, keeping the oldest copy.
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

- **Firefox vs Chrome:** a change for one browser must keep the other green: run `npm run verify`. Behavior that
  differs goes behind `Platform`, not `if (chrome)` checks scattered in the UI. Known differences:
  - Chrome: no bookmarks menu, `goMenu` hidden (`hiddenActions`) and unbound; ids are numeric strings; nodes have
    no `type`; an empty mobile folder is absent from the tree; same-folder `move` index is pre-removal.
  - Chrome can't change its own shortcuts (no `commands.update`/`reset`); the options page shows them read-only
    and links to `chrome://extensions/shortcuts`. `commands.getAll()` also returns `_execute_action` (no description).
  - Chrome uses `activeTab` instead of `tabs` (no install warning), so it only sees the active tab's URL/title
    when a command or the toolbar button fires. Favicons come from `/_favicon/?pageUrl=…` (`favicon` permission).
  - Chrome's `storage.sync` allows 120 writes/minute (Firefox has no such limit); writes beyond it fail. Store ops
    run inside `Store.batched`, which defers order saves to one write at the end of the op (also on failure), and
    `OrderStore.save` writes only changed chunks. A new op that loops over items must stay inside `itemOp`/`batched`;
    the `storage.sync writes` tests (MemoryKV `writes`/`writeLimit`) and the batch step in `real-chrome.mjs` check it.
    Don't add per-keystroke sync writes.
  - The background is a service worker on Chrome: no DOM, register every listener at the top level, keep state in
    `storage.session`.
- **Shell aliases** in this environment: `rm` is interactive and `cp` adds `-r`. Use `/bin/rm -f` and `/bin/cp -R` in scripts, or the command will hang or fail.
- **Real-extension automation doesn't work in Firefox:** puppeteer/WebDriver BiDi cannot navigate to or see `moz-extension://` pages. Test the UI through the harness, and leave anything needing real Firefox APIs to the user (`npm start`). Chrome works (`npm run e2e:chrome-real`); branded Google Chrome refuses to load unpacked extensions from the command line, so it uses Chrome for Testing.
- **Svelte:** never name a variable `state` (or anything else whose `$`-prefixed name is a rune) in a component. Svelte treats `$state` as a store subscription, which breaks the build. Use `$state.raw` for large immutable objects (the `Model`). Use `untrack(() => prop)` when a prop only seeds local state.
- **Svelte exports:** don't `export` types from a component's instance script. Put shared UI types in `src/ui/browser/view.ts`.
- **TypeScript:** svelte-check needs TS 6, so `typescript@~6` is pinned. Don't upgrade it to 7.
- **`Ctrl+W`** (delete back one level in the tag input) is reserved by Firefox and Chrome on Linux/Windows.
- **Opening URLs** must target a `normal` window, never romeli's popup (`activeNormalTab`).
- **Event pages:** the background script is MV3 (`"type": "module"`) and can be suspended. Keep its state in `storage.session`, not in variables.
- **Browser versions:** Firefox 140+ (`data_collection_permissions`), Chrome 134+ (`folderType`/`syncing` on bookmark nodes).
- **Harness flakiness:** the first harness run after editing source files can log `error loading dynamically imported module` (vite re-optimizing). Re-run before treating it as a bug.
- **Puppeteer in Firefox:** triple-click doesn't select an input's text. To replace a value, use `el.focus(); el.select()`, press Backspace, then type (see `setInput` in `harness/drive-theme.mjs`).

## Releasing

1. `npm run verify` must pass (unit tests, svelte-check, both builds, dist checks, web-ext lint, both harnesses, real Chrome).
2. `npm run bump [-- patch|minor|major|x.y.z]` bumps `package.json`; the build stamps the version into both manifests.
3. Firefox: commit and push the bump, then `npm run sign` produces a signed, unlisted `.xpi` in `artifacts/` (AMO API
   keys in `.env`). `npm run release:firefox [-- --notes "…"]` puts it (and the Chrome zip, if built) on a GitHub Release
   `v<version>` and adds an entry to `updates.json`; pushing `updates.json` ships it. Installed copies poll it through
   the manifest's `update_url` (`raw.githubusercontent.com/gnodar01/romeli/main/updates.json`). That URL is permanent:
   moving the file, renaming the repo or making it private strands every install. `check:dist` and the manifest test
   enforce the `update_url`. 0.2.0 and older had none, so those testers install the next version by hand once.
   Maintainer and tester guides are in `tutorials/` (git-ignored).
4. Chrome: `npm run package:chrome` produces `artifacts/romeli-chrome-<version>.zip`. Testers either unzip it and use
   `chrome://extensions` → Developer mode → *Load unpacked* (no auto-update; reload after replacing the folder), or
   install from a Chrome Web Store listing (unlisted is fine for testers). The store checklist is in the README.
   Don't put a `key` in the Chrome manifest: the store rejects it.

## State of the project

- v1, the first round of feedback, and the customizable theme are implemented and verified through the harness.
- Chrome port (2026-10-25): core is browser-agnostic, and everything browser-specific is in `src/platform/`.
  - Verified by an agent through both harnesses and as a real extension in Chrome for Testing: bookmark ops, undo,
    popups, `_favicon`, options, and a 150-item batch under the `storage.sync` write quota.
  - The user then QA'd it by hand in real Chrome (`npm run start:chrome`) and reported everything working.
- Post-port features (2026-10-25), verified through both harnesses: the open-browser shortcut / toolbar button
  reveals the current tab's page at its primary tag (`?reveal=` on open, a `reveal` runtime message to an open window);
  `g[`/`g]` cycle an item's tags; the keymap has its own JSON import/export with per-OS warnings; ⌥ keys are
  recorded by physical key (`eventToKey`).
- "Modified" dates: neither browser exposes a bookmark's last-modified time to extensions (only folders'
  `dateGroupModified`; Chrome also has `dateLastUsed`), so sort-by-modified orders items by `dateAdded`. The user
  looked at the options (tracking edits ourselves, deriving a date, showing last visited) and chose to leave it as is.
- Never verified by an agent:
  - the installed Firefox extension on real bookmarks;
  - Chrome's account (`syncing`) bookmarks on a signed-in profile;
  - real keyboard commands (and so `activeTab` on create-bookmark and the open-browser reveal);
  - a real macOS ⌥ key press producing `<A-k>` (puppeteer can't type Option characters);
  - the theme's color pickers, the JSON copy button, and native controls actually rendering light or dark.
- `npm run start:chrome` shows an "unsupported command-line flag: --disable-blink-features=AutomationControlled" bar.
  It's added by web-ext and harmless. Passing `--args=--enable-blink-features=AutomationControlled` hides it, but then
  sites see `navigator.webdriver` and Google sign-in may refuse, so it's deliberately left alone.
- Check `git log` for history; the user commits their own work.
