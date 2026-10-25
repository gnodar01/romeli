import type { Overrides } from './model';
import type { KVStore } from './types';

/**
 * Tag-order overrides are persisted in storage.sync, which caps each key at 8KB and the store at
 * 512 keys. The map is serialized once and split into fixed-size string chunks; 2500 chars stays
 * under the per-item byte quota even for 3-byte UTF-8 characters.
 */
const PREFIX = 'order.';
const COUNT = 'order.count';
const CHUNK = 2500;

export function encodeOverrides(o: Overrides, size = CHUNK): Record<string, unknown> {
  const json = JSON.stringify([...o]);
  const out: Record<string, unknown> = {};
  let n = 0;
  for (let i = 0; i < json.length; i += size) out[PREFIX + n++] = json.slice(i, i + size);
  out[COUNT] = n;
  return out;
}

export function decodeOverrides(rec: Record<string, unknown>): Overrides {
  const n = Number(rec[COUNT] ?? 0);
  let json = '';
  for (let i = 0; i < n; i++) {
    const part = rec[PREFIX + i];
    if (typeof part !== 'string') return new Map(); // partially synced; fall back to defaults
    json += part;
  }
  if (!json) return new Map();
  try {
    const entries = JSON.parse(json) as [string, string[]][];
    return new Map(entries.filter(([k, v]) => typeof k === 'string' && Array.isArray(v)));
  } catch {
    return new Map();
  }
}

export class OrderStore {
  constructor(private kv: KVStore) {}

  async load(): Promise<Overrides> {
    return decodeOverrides(await this.kv.get(null));
  }

  /**
   * Writes only the chunks that differ from what's stored, so saving unchanged overrides costs no
   * writes (Chrome allows 120 storage.sync writes per minute; reads are free).
   */
  async save(o: Overrides): Promise<void> {
    const prev = await this.kv.get(null);
    const next = encodeOverrides(o);
    const changed = Object.fromEntries(Object.entries(next).filter(([k, v]) => prev[k] !== v));
    if (Object.keys(changed).length) await this.kv.set(changed);
    const stale: string[] = [];
    for (let i = next[COUNT] as number; i < Number(prev[COUNT] ?? 0); i++) stale.push(PREFIX + i);
    if (stale.length) await this.kv.remove(stale);
  }

  static isOrderKey(key: string): boolean {
    return key.startsWith(PREFIX);
  }
}
