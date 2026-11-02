# Yaldeagle

Yaldeagle is a small 3D toy for the browser. A blocky eagle in the style of Crossy Road wanders an empty white space. It hops, turns, looks around, and squawks. The game is for Nicholas Yalda. Nicholas is a civil engineer, and he wants every license and certificate he can get. Later versions add gear on the eagle for each license.

## Requirements

- Node 20.19 or later in the 20 line, or Node 22.12 or later. CI checks Node 20 and Node 26.
- npm.

## Run

```sh
npm install
npm run dev
```

Then open the address that Vite prints.

## Scripts

| Script            | What it does                                             |
| ----------------- | -------------------------------------------------------- |
| `npm run dev`     | Starts the dev server with hot reload.                   |
| `npm run build`   | Type-checks the code, then builds the site into `dist/`. |
| `npm run preview` | Serves the built site from `dist/`.                      |
| `npm test`        | Runs the unit tests once with Vitest.                    |
| `npm run check`   | Runs the type check and the format check.                |
| `npm run format`  | Formats all files with Prettier.                         |

## Deploy

Vercel builds the site from GitHub. A push to `main` deploys to production. Each other branch and each pull request gets a preview link.

CI (`.github/workflows/check.yml`) runs the checks, the tests, and the build on each pull request and each push to `main`.

Live site: (added after the first deploy)

## Code map

| Path             | Use                     |
| ---------------- | ----------------------- |
| `index.html`     | Page shell.             |
| `src/main.ts`    | Start-up code.          |
| `src/style.css`  | Page style.             |
| `public/`        | Static files.           |
| `vite.config.ts` | Vite and Vitest config. |

Later features add `src/stage/`, `src/eagle/`, and `src/lib/`.

## License

MIT. See `LICENSE`.
