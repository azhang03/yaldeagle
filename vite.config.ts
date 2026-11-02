import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // F1 has no tests. F4 adds the first ones.
    passWithNoTests: true,
  },
});
