import { readFileSync } from 'node:fs';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { catalogPlugin } from './scripts/vite-plugin-catalog.ts';

const { version } = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  plugins: [svelte(), catalogPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  build: {
    // The 3D viewer chunk is mostly three.js (~700 kB). It is loaded on demand
    // from the device, never over the network, so its size is acceptable.
    chunkSizeWarningLimit: 800,
  },
});
