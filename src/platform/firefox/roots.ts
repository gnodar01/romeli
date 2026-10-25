import type { BNode, RootLayout } from '../../core/types';

export const FIREFOX_ROOT_IDS = {
  root: 'root________',
  menu: 'menu________',
  toolbar: 'toolbar_____',
  unfiled: 'unfiled_____',
  mobile: 'mobile______',
} as const;

/** Top-level tag names that map onto Firefox's special root folders. */
const SPECIAL_TAGS: Record<string, string> = {
  toolbar: 'toolbar_____',
  menu: 'menu________',
  mobile: 'mobile______',
};

/** Tags live in "Other Bookmarks"; toolbar/, menu/ and (when non-empty) mobile/ map onto the other roots. */
export function firefoxRoots(tree: BNode[]): RootLayout {
  const ids = FIREFOX_ROOT_IDS;
  const top = tree[0]?.id === ids.root ? tree[0] : { id: ids.root, title: '', children: tree };
  const byId = new Map((top.children ?? []).map((c) => [c.id, c]));
  const other = byId.get(ids.unfiled) ?? { id: ids.unfiled, title: '', children: [] };
  const specials: RootLayout['specials'] = [];
  for (const [name, id] of Object.entries(SPECIAL_TAGS)) {
    const node = byId.get(id);
    if (!node) continue;
    if (id === ids.mobile && !node.children?.length) continue;
    specials.push({ name, node });
  }
  return { other, specials, reserved: Object.keys(SPECIAL_TAGS) };
}
