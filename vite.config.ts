import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { catalogPlugin } from './scripts/vite-plugin-catalog.ts';

export default defineConfig({
  plugins: [svelte(), catalogPlugin()],
  build: {
    // The 3D viewer chunk is mostly three.js (~700 kB). It is loaded on demand
    // from the device, never over the network, so its size is acceptable.
    chunkSizeWarningLimit: 800,
  },
});
