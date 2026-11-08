import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { STEAM_ROUTE, steamResponse } from './src/stats/steam.ts';
import { checkUpload } from './src/yaldaq/data/check.ts';
import { DEV_FEED_URL, FEED_PATH } from './src/yaldaq/data/feed-paths.ts';

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

/**
 * Serves the YALDAQ feed files of a local folder at /feed/v1/, as the store does. A missing file
 * gives 204. A file that the store would refuse gives 422 and a warning, so the dev page never
 * shows data that could not go public.
 */
function yaldaqFeedDevRoute(dir: string | undefined): Plugin {
  return {
    name: 'yaldaq-feed-dev-route',
    configureServer(server) {
      server.middlewares.use(DEV_FEED_URL, (req, res) => {
        const path = (req.url ?? '').split('?')[0]?.replace(/^\//, '') ?? '';
        const send = (status: number, body?: string): void => {
          res.statusCode = status;
          res.setHeader('cache-control', 'no-store');
          if (body !== undefined) res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(body);
        };
        if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, '{"error":"method"}');
        if (!FEED_PATH.test(path)) return send(404, '{"error":"not-found"}');
        if (!dir) return send(204);
        void readFile(join(dir, path), 'utf8').then(
          (text) => {
            let data: unknown;
            try {
              data = JSON.parse(text);
            } catch {
              console.warn(`[yaldaq feed] ${path}: bad JSON`);
              return send(422, '{"error":"bad-json"}');
            }
            const result = checkUpload(path, data, Date.now());
            if (!result.ok) {
              console.warn(`[yaldaq feed] ${path}: refused by rule ${result.rule}`);
              return send(422, JSON.stringify({ error: result.rule }));
            }
            send(200, req.method === 'HEAD' ? undefined : text);
          },
          () => send(204),
        );
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // The values come from .env.local, which git ignores (*.local).
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [steamDevRoute(env.STEAM_API_KEY), yaldaqFeedDevRoute(env.YALDAQ_FEED_DIR)],
    build: {
      // Three.js with WebGLRenderer is about 530 kB (134 kB gzip). Warn only above that.
      chunkSizeWarningLimit: 700,
    },
    test: {
      include: ['src/**/*.test.ts'],
      environment: 'node',
    },
  };
});
