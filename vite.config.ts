import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { catalogPlugin } from './scripts/vite-plugin-catalog.ts';

export default defineConfig({
  plugins: [svelte(), catalogPlugin()],
});
