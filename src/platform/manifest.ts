type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Deep-merges objects; arrays and scalars in `overlay` replace those in `base`. */
function merge(base: Json, overlay: Json): Json {
  const out: Json = { ...base };
  for (const [k, v] of Object.entries(overlay)) out[k] = isObject(v) && isObject(out[k]) ? merge(out[k] as Json, v) : v;
  return out;
}

/** The manifest for one browser: the shared base plus that browser's overlay, at package.json's version. */
export function buildManifest(base: Json, overlay: Json, version: string): Json {
  const { manifest_version, name, ...rest } = merge(base, overlay);
  return { manifest_version, name, version, ...rest };
}
