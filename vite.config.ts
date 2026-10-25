import { defineConfig, type Plugin } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildManifest } from './src/platform/manifest.ts';

const r = (p: string) => resolve(import.meta.dirname, p);
const readJson = (p: string) => JSON.parse(readFileSync(r(p), 'utf8'));

export const TARGETS = ['firefox', 'chrome'] as const;
export type Target = (typeof TARGETS)[number];

export function targetOf(env: string | undefined): Target {
  const t = env ?? 'firefox';
  if (!(TARGETS as readonly string[]).includes(t)) throw new Error(`TARGET must be one of ${TARGETS.join(', ')}, got "${t}"`);
  return t as Target;
}

const target = targetOf(process.env.TARGET);

/** Emits manifest.json (base + overlay) and the target's own icons from src/platform/<target>/. */
function platformFiles(target: Target): Plugin {
  return {
    name: 'romeli-platform-files',
    generateBundle() {
      const manifest = buildManifest(
        readJson('src/platform/manifest.base.json'),
        readJson(`src/platform/${target}/manifest.json`),
        readJson('package.json').version,
      );
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: JSON.stringify(manifest, null, 2) + '\n' });
      const icons = r(`src/platform/${target}/icons`);
      if (existsSync(icons)) {
        for (const f of readdirSync(icons)) this.emitFile({ type: 'asset', fileName: `icons/${f}`, source: readFileSync(resolve(icons, f)) });
      }
    },
  };
}

export default defineConfig({
  root: r('src'),
  publicDir: r('public'),
  base: '',
  plugins: [svelte({ configFile: r('svelte.config.js') }), platformFiles(target)],
  define: { __TARGET__: JSON.stringify(target) },
  build: {
    outDir: r(`dist/${target}`),
    emptyOutDir: true,
    target: target === 'chrome' ? 'chrome134' : 'firefox128',
    minify: false,
    rollupOptions: {
      input: {
        background: r('src/background/index.ts'),
        browser: r('src/ui/browser/index.html'),
        create: r('src/ui/create/index.html'),
        options: r('src/ui/options/index.html'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  test: {
    root: import.meta.dirname,
    include: ['tests/**/*.test.ts'],
  },
});
