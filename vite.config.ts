import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    // Three.js with WebGLRenderer is about 530 kB (134 kB gzip). Warn only above that.
    chunkSizeWarningLimit: 700,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
