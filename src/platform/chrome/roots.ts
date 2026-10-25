import type { BNode, RootLayout } from '../../core/types';

type FolderType = NonNullable<BNode['folderType']>;

/** Permanent-folder ids of a profile with only local bookmarks (and of Chrome < 134). */
const LEGACY_IDS: Record<string, FolderType> = { '1': 'bookmarks-bar', '2': 'other', '3': 'mobile' };

/**
 * Tags live in "Other bookmarks"; toolbar/ and (when non-empty) mobile/ map onto the bookmarks bar
 * and mobile folder. Chrome has no bookmarks menu, and "Managed bookmarks" is ignored.
 *
 * Signed in without full sync, Chrome keeps two sets of permanent folders: local ones and account
 * ones (`syncing: true`) with unpredictable ids. Romeli manages the account set when it exists.
 */
export function chromeRoots(tree: BNode[]): RootLayout {
  const top = tree[0]?.id === '0' ? tree[0] : { id: '0', title: '', children: tree };
  const pick = (type: FolderType): BNode | undefined => {
    const all = (top.children ?? []).filter((c) => (c.folderType ?? LEGACY_IDS[c.id]) === type);
    return all.find((c) => c.syncing) ?? all[0];
  };
  const other = pick('other') ?? { id: '2', title: '', children: [] };
  const specials: RootLayout['specials'] = [];
  const bar = pick('bookmarks-bar');
  if (bar) specials.push({ name: 'toolbar', node: bar });
  const mobile = pick('mobile');
  if (mobile?.children?.length) specials.push({ name: 'mobile', node: mobile });
  return { other, specials, reserved: ['toolbar', 'mobile'] };
}
