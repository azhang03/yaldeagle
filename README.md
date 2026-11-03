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

Options for development. Add them to the address, for example `?bounds&mounts`. They also work on the live site.

| Option    | What it does                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `?seed=N` | Uses the seed N for the random choices. The console shows the seed of each visit. The same seed gives the same moves.                                                                                   |
| `?manual` | Turns the brain off. Keys start each action: H hop, T turn left, Shift+T turn right, S squawk, L look. Visit actions: J jump 2 units forward, F face a random angle, G gaze on or off, I tilt, N shake. |
| `?bounds` | Draws the room bounds and one circle for each item on the ground. The eagle stays in the bounds and does not land in a circle.                                                                          |
| `?mounts` | Shows a dot on each mount point of the eagle (where gear attaches).                                                                                                                                     |
| `?debug`  | Puts `yaldeagle` in the dev console, with `stage`, `eagle`, `animator`, `brain`, and `exhibits`. Example: `yaldeagle.brain.pose()`                                                                      |

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

Live site: https://yaldeagle.vercel.app/

## Mark a credential as earned

1. In `src/room/items.ts`, find the item and change its `status` to `'earned'`.
2. Push to `main`. Vercel deploys the change.

The item then shows its colors in the room. If the item has a `worn` entry, the eagle also wears it.

## Code map

| Path                         | Use                                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`                 | Page shell.                                                                                                                      |
| `src/main.ts`                | Start-up code. It makes the stage, the exhibits, the eagle with its gear, the animator, and the brain, and runs them each frame. |
| `src/style.css`              | Page style.                                                                                                                      |
| `src/stage/stage.ts`         | Renderer, perspective camera, light over the room, ground, resize, and the frame loop.                                           |
| `src/lib/bounds.ts`          | The `Bounds` rectangle on the ground and its math.                                                                               |
| `src/lib/room.ts`            | Room coordinates (u to the screen right, v toward the camera) and the fixed room bounds.                                         |
| `src/lib/view.ts`            | Camera views: the overview of the room. Tests: `view.test.ts`.                                                                   |
| `src/lib/rng.ts`             | The seeded random source.                                                                                                        |
| `src/lib/ease.ts`            | Easing curves.                                                                                                                   |
| `src/room/areas.ts`          | The four areas of the room and their colors.                                                                                     |
| `src/room/items.ts`          | The item data: place, status, text, and gear. Change the text here. Tests: `items.test.ts`.                                      |
| `src/room/kit.ts`            | The box kit for the item models, and the paint modes (color, grey, ghost, cut).                                                  |
| `src/room/models.ts`         | The 14 item models, and the parts that the eagle can wear on their own.                                                          |
| `src/room/exhibit.ts`        | One exhibit: the patch, the floor ring, and the floating item with its state look (earned, progress, locked).                    |
| `src/room/gear.ts`           | Puts the earned gear on the eagle mounts.                                                                                        |
| `src/eagle/model.ts`         | `buildEagle()`: the eagle from boxes, with its part tree and mount points.                                                       |
| `src/eagle/palette.ts`       | The colors of the eagle.                                                                                                         |
| `src/eagle/mount-markers.ts` | The dots for `?mounts`.                                                                                                          |
| `src/eagle/actions.ts`       | The actions (idle, hop, turn, squawk, look) and `TUNING`, the timings and weights of the behavior.                               |
| `src/eagle/brain.ts`         | Decides the next action. No Three.js and no DOM. Tests: `brain.test.ts`.                                                         |
| `src/eagle/animator.ts`      | Plays the actions on the eagle's parts.                                                                                          |
| `src/eagle/manual-keys.ts`   | The keys for `?manual`.                                                                                                          |
| `public/`                    | Static files.                                                                                                                    |
| `vite.config.ts`             | Vite and Vitest config.                                                                                                          |

Files in `src/lib/`, `src/room/areas.ts`, `src/room/items.ts`, `actions.ts`, and `brain.ts` do not import Three.js or use the DOM, so Vitest can test them without a browser.

## License

MIT. See `LICENSE`.
