/** Minimal shape of a Firefox bookmark node that romeli relies on. */
export interface BNode {
  id: string;
  parentId?: string;
  index?: number;
  title: string;
  url?: string;
  type?: 'bookmark' | 'folder' | 'separator';
  dateAdded?: number;
  dateGroupModified?: number;
  children?: BNode[];
}

/** The subset of `browser.bookmarks` used by romeli; mocked in tests. */
export interface BookmarksApi {
  getTree(): Promise<BNode[]>;
  create(details: { parentId: string; title: string; url?: string; index?: number }): Promise<BNode>;
  move(id: string, dest: { parentId?: string; index?: number }): Promise<BNode>;
  update(id: string, changes: { title?: string; url?: string }): Promise<BNode>;
  remove(id: string): Promise<void>;
  removeTree(id: string): Promise<void>;
}

/** Persistent key/value store (storage.sync in the extension, a Map in tests). */
export interface KVStore {
  get(keys: string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

/** A hierarchical tag path, e.g. ['linux', 'terminal']. The root (untagged) is []. */
export type TagPath = string[];

export const ROOT_IDS = {
  root: 'root________',
  menu: 'menu________',
  toolbar: 'toolbar_____',
  unfiled: 'unfiled_____',
  mobile: 'mobile______',
} as const;

/** Top-level tag names that map onto Firefox's special root folders. */
export const SPECIAL_TAGS: Record<string, string> = {
  toolbar: ROOT_IDS.toolbar,
  menu: ROOT_IDS.menu,
  mobile: ROOT_IDS.mobile,
};
