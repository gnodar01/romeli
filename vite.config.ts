import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';

const r = (p: string) => resolve(import.meta.dirname, p);

export default defineConfig({
  root: r('src'),
  publicDir: r('public'),
  base: '',
  plugins: [svelte({ configFile: r('svelte.config.js') })],
  build: {
    outDir: r('dist'),
    emptyOutDir: true,
    target: 'firefox128',
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
