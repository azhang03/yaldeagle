import { bindings, defineConfig } from 'cf/config';
import * as entrypoint from './src/index.ts' with { type: 'cf-worker' };

export default defineConfig({
  worker: {
    name: 'yaldaq-feed',
    compatibilityDate: '2026-11-04',
    entrypoint,
    env: {
      FEED: bindings.r2({ name: 'yaldaq-feed' }),
    },
  },
});
