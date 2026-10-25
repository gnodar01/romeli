/** Minimal shape of a native bookmark node (Firefox or Chrome) that romeli relies on. */
export interface BNode {
  id: string;
  parentId?: string;
  index?: number;
  title: string;
  url?: string;
  /** Firefox only. */
  type?: 'bookmark' | 'folder' | 'separator';
  /** Chrome only (134+): which permanent folder this is. */
  folderType?: 'bookmarks-bar' | 'other' | 'mobile' | 'managed';
  /** Chrome only (134+): whether the node is stored in the user's account (synced). */
  syncing?: boolean;
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

/** Where tags live in the native tree. Resolved by the platform shell (see src/platform). */
export interface RootLayout {
  /** The folder whose subfolders are the top-level tags and whose bookmarks are untagged. */
  other: BNode;
  /** Special top-level tags mapped onto the browser's other root folders, in display order. */
  specials: { name: string; node: BNode }[];
  /** Top-level names taken by special tags; a user folder with one is shown with a `~` suffix. */
  reserved: string[];
}

export type RootResolver = (tree: BNode[]) => RootLayout;

export const EMPTY_LAYOUT: RootLayout = { other: { id: '', title: '', children: [] }, specials: [], reserved: [] };
