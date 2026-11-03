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

| Option        | What it does                                                                                                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `?seed=N`     | Uses the seed N for the random choices. The console shows the seed of each visit. The same seed gives the same moves.                                                                                          |
| `?manual`     | Turns the brain off. Keys start each action: H hop, T turn left, Shift+T turn right, S squawk, L look, R run. Visit actions: J jump 2 units forward, F face a random angle, G gaze on or off, I tilt, N shake. |
| `?bounds`     | Draws the room bounds and one circle for each item on the ground. The eagle stays in the bounds and does not land in a circle.                                                                                 |
| `?mounts`     | Shows a dot on each mount point of the eagle (where gear attaches).                                                                                                                                            |
| `?debug`      | Puts `yaldeagle` in the dev console, with `stage`, `eagle`, `animator`, `brain`, `exhibits`, `visits`, and `gear`. Example: `yaldeagle.visits.mode()`                                                          |
| `?panel=<id>` | Opens the panel of one item at once, without a visit. The ids are in `src/room/items.ts`, for example `?panel=fe`. Esc or × closes it.                                                                         |
| `?slow`       | Builds the panel at a quarter of the speed.                                                                                                                                                                    |

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

The item then shows its colors in the room. If the item has a `worn` entry, the eagle puts that gear on during a visit to the item. The eagle starts each page load with no gear.

## Code map

| Path                         | Use                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.html`                 | Page shell, with the canvas container and the panel host.                                                                                                                |
| `src/main.ts`                | Start-up code. It makes the stage, the exhibits, the eagle with its gear, the animator, the brain, the visits, and the pointer input, and runs them each frame.          |
| `src/style.css`              | Page style, and the place of the panel host.                                                                                                                             |
| `src/stage/stage.ts`         | Renderer, perspective camera, light over the room, ground, resize, and the frame loop.                                                                                   |
| `src/lib/bounds.ts`          | The `Bounds` rectangle on the ground and its math.                                                                                                                       |
| `src/lib/room.ts`            | Room coordinates (u to the screen right, v toward the camera) and the fixed room bounds.                                                                                 |
| `src/lib/view.ts`            | Camera views: the overview with its pan and zoom, the close view of a visit, and the flights between them. Tests: `view.test.ts`.                                        |
| `src/lib/rng.ts`             | The seeded random source.                                                                                                                                                |
| `src/lib/ease.ts`            | Easing curves.                                                                                                                                                           |
| `src/room/areas.ts`          | The four areas of the room and their colors.                                                                                                                             |
| `src/room/items.ts`          | The item data: place, status, text, and gear. Change the text here. Tests: `items.test.ts`.                                                                              |
| `src/room/kit.ts`            | The box kit for the item models, and the paint modes (color, grey, ghost, cut).                                                                                          |
| `src/room/models.ts`         | The 14 item models, and the parts that the eagle can wear on their own.                                                                                                  |
| `src/room/exhibit.ts`        | One exhibit: the patch, the floor ring, and the floating item with its state look (earned, progress, locked).                                                            |
| `src/room/gear.ts`           | The earned gear on the eagle mounts. It is hidden at the start, and a visit puts it on.                                                                                  |
| `src/room/plan.ts`           | The visit planner: the camera direction, the eagle spot, and the items to hide. No Three.js. Tests: `plan.test.ts`.                                                      |
| `src/room/visit.ts`          | The visit: the jump, the flight down, the gesture, the panel, and the way back. It holds the app mode (wander, going, focus, leaving).                                   |
| `src/room/tooltip.ts`        | The text box at the pointer.                                                                                                                                             |
| `src/input/pointer.ts`       | Hover, click, and Esc on the canvas, and touch: pan, pinch, and tap.                                                                                                     |
| `src/input/gestures.ts`      | Tap, pan, and pinch from touch pointer events. No DOM. Tests: `gestures.test.ts`.                                                                                        |
| `src/panel/content.ts`       | Turns an item into the panel text. No DOM. Tests: `content.test.ts`.                                                                                                     |
| `src/panel/build.ts`         | Builds the panel like a steel frame building (blueprint, footings, columns, beams, wall panels), with Web Animations.                                                    |
| `src/panel/panel.css`        | The panel style.                                                                                                                                                         |
| `src/eagle/model.ts`         | `buildEagle()`: the eagle from boxes, with its part tree (legs and body turn at the hips) and mount points.                                                              |
| `src/eagle/palette.ts`       | The colors of the eagle.                                                                                                                                                 |
| `src/eagle/mount-markers.ts` | The dots for `?mounts`.                                                                                                                                                  |
| `src/eagle/actions.ts`       | The actions (idle, hop, turn, squawk, look, the run, and the visit actions jump, face, tilt, shake, hop in place) and `TUNING`, the timings and weights of the behavior. |
| `src/eagle/brain.ts`         | Decides the next action. It keeps the eagle in the room bounds and off the items, and it can restart from a new pose. No Three.js and no DOM. Tests: `brain.test.ts`.    |
| `src/eagle/animator.ts`      | Plays the actions on the eagle's parts, with the gaze for visits.                                                                                                        |
| `src/eagle/manual-keys.ts`   | The keys for `?manual`.                                                                                                                                                  |
| `public/`                    | Static files.                                                                                                                                                            |
| `vite.config.ts`             | Vite and Vitest config.                                                                                                                                                  |

Files in `src/lib/`, `src/room/areas.ts`, `src/room/items.ts`, `src/room/plan.ts`, `src/panel/content.ts`, `src/input/gestures.ts`, `actions.ts`, and `brain.ts` do not import Three.js or use the DOM, so Vitest can test them without a browser.

## License

MIT. See `LICENSE`.
