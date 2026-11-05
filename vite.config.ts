import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { STEAM_ROUTE, steamResponse } from './src/stats/steam.ts';

/** Serves the Steam route on the dev server, as api/steam.ts does on Vercel. */
function steamDevRoute(key: string | undefined): Plugin {
  return {
    name: 'steam-dev-route',
    configureServer(server) {
      server.middlewares.use(STEAM_ROUTE, (_req, res) => {
        void steamResponse(key).then(async (r) => {
          res.statusCode = r.status;
          r.headers.forEach((value, name) => res.setHeader(name, value));
          res.end(await r.text());
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  // The key comes from .env.local, which git ignores (*.local).
  plugins: [steamDevRoute(loadEnv(mode, process.cwd(), '').STEAM_API_KEY)],
  build: {
    // Three.js with WebGLRenderer is about 530 kB (134 kB gzip). Warn only above that.
    chunkSizeWarningLimit: 700,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
}));
