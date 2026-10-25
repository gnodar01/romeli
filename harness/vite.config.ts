import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';
import { targetOf } from '../vite.config.ts';

// TARGET=firefox (default) serves on 5199, TARGET=chrome on 5198, so both can run side by side.
const target = targetOf(process.env.TARGET);

export default defineConfig({
  root: resolve(import.meta.dirname, '..'),
  plugins: [svelte({ configFile: resolve(import.meta.dirname, '../svelte.config.js') })],
  define: { __TARGET__: JSON.stringify(target) },
  server: { port: target === 'chrome' ? 5198 : 5199, strictPort: true },
});
