import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(import.meta.dirname, '..'),
  plugins: [svelte({ configFile: resolve(import.meta.dirname, '../svelte.config.js') })],
  server: { port: 5199, strictPort: true },
});
