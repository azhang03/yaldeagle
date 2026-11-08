# Yaldeagle

Yaldeagle is a small 3D toy for the browser, made for Nicholas Yalda. Nicholas is a civil engineer, and he wants every license and certificate he can get. A blocky eagle in the style of Crossy Road wanders a white room with 15 items about Nick: his licenses and certificates, his work, esports, and his extracurriculars.

- Click an item: the eagle jumps to it, the camera flies down, and a panel tells what the item stands for. A visit to an earned item puts its gear on the eagle. Esc, ×, or a click on the floor goes back.
- Click the floor: the eagle runs there, or jumps over an item in the way.
- Drag an item to move it. On a touch screen, hold the item for half a second first. The places reset when the page loads again.
- On a phone, swipe to pan, pinch to zoom, and tap to click.

## Requirements

- Node 20.19 or later in the 20 line, or Node 22.12 or later. CI checks Node 20 and Node 26.
- npm.

## Run

```sh
npm install
npm run dev
```

Then open the address that Vite prints.

The CS2 panel reads Nick's lifetime stats from Steam through the route `/api/steam`. The route needs a Steam Web API key (https://steamcommunity.com/dev/apikey). For the dev server, put it in `.env.local` (git ignores the file):

```sh
STEAM_API_KEY=your-key
```

Without the key, the Lifetime boxes show dashes, and the rest of the site works.

The YALDAQ view reads the YALDAQ feed: small JSON files that YALDAQ's host uploads to the store (see "The YALDAQ store"). The dev server reads them from a local folder at `/feed/v1/` in place of the store. Put the folder in `.env.local`:

```sh
YALDAQ_FEED_DIR="/path/to/a/folder/of/feed/files"
```

The folder holds `live.json`, `scores.json`, `days/<date>.json`, and `reveals/<envelope>.json` (schema 2, `src/yaldaq/data/contract.ts`). The dev route runs the store's upload check on each file and refuses a file that breaks a rule (status 422 and a warning in the terminal). Without the folder, each feed file gives 204, which the view shows as "No news yet". Never put real YALDAQ data in the repo.

Options for development. Add them to the address, for example `?bounds&mounts`. They also work on the live site.

| Option        | What it does                                                                                                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `?seed=N`     | Uses the seed N for the random choices. The console shows the seed of each visit. The same seed gives the same moves.                                                                                          |
| `?manual`     | Turns the brain off. Keys start each action: H hop, T turn left, Shift+T turn right, S squawk, L look, R run. Visit actions: J jump 2 units forward, F face a random angle, G gaze on or off, I tilt, N shake. |
| `?bounds`     | Draws the room bounds and one circle around each item on the ground. The eagle stays in the bounds and does not land in a circle. A circle moves with its item.                                                |
| `?mounts`     | Shows a dot on each mount point of the eagle (where gear attaches).                                                                                                                                            |
| `?debug`      | Puts `yaldeagle` in the dev console, with `stage`, `eagle`, `animator`, `brain`, `exhibits`, `visits`, and `gear`. Example: `yaldeagle.visits.mode()`                                                          |
| `?panel=<id>` | Opens the panel of one item at once, without a visit. The ids are in `src/room/items.ts`, for example `?panel=fe`. Esc or × closes it.                                                                         |
| `?slow`       | Builds the panel at a quarter of the speed.                                                                                                                                                                    |

## Scripts

| Script            | What it does                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `npm run dev`     | Starts the dev server with hot reload.                                                          |
| `npm run build`   | Type-checks the code, then builds the site into `dist/`.                                        |
| `npm run preview` | Serves the built site from `dist/`.                                                             |
| `npm test`        | Runs the unit tests once with Vitest.                                                           |
| `npm run check`   | Runs the type checks (the page, and `api/` with `vite.config.ts` in Node) and the format check. |
| `npm run format`  | Formats all files with Prettier.                                                                |

## Deploy

Vercel builds the site from GitHub. A push to `main` deploys to production. Each other branch and each pull request gets a preview link. Vercel runs `api/steam.ts` as a function. It reads `STEAM_API_KEY` from the project settings (Production and Preview).

CI (`.github/workflows/check.yml`) runs the checks, the tests, and the build on each pull request and each push to `main`.

Live site: https://yalda.si/ (it redirects to https://www.yalda.si/). The Vercel address https://yaldeagle.vercel.app/ also works.

The domain is at Namecheap, with Namecheap BasicDNS. Its records point to Vercel: an A record for `@` and a CNAME record for `www`, with the values that the Vercel project settings show under Domains.

## The YALDAQ store

The YALDAQ feed lives in a Cloudflare R2 bucket (`yaldaq-feed`) behind a small Worker (`feed/`, also named `yaldaq-feed`). The store root is https://yaldaq-feed.lucharnist.workers.dev/v1/.

- `GET /v1/<path>` serves `live.json`, `scores.json`, `days/<YYYY-MM-DD>.json`, and `reveals/env-<8 hex>.json` to every origin, with an ETag and a cache time (`src/yaldaq/data/feed-paths.ts`). A file that is not there yet gives 204. Any other path gives 404.
- `PUT /v1/<path>` stores a file. It needs `Authorization: Bearer <upload token>`. The Worker runs `checkUpload` (`src/yaldaq/data/check.ts`) and refuses a file that breaks a public rule: 422 with the rule name, for example `{"error":"sealed-key:price"}`. Other answers: 401 (no token or a wrong token), 413 (above 2 MB), 400 (not JSON), 200 (stored).
- The upload token is the Worker secret `UPLOAD_TOKEN`. Keep its copy outside every repo. The YALDAQ host uploads with it.

Deploy the Worker with the `cf` CLI and Node 22, from `feed/`. Load the Cloudflare token and account ID from a file outside the repo, and pass the upload token in a temporary dotenv file:

```sh
cd feed && npm install
export PATH=/opt/homebrew/opt/node@22/bin:$PATH CF_SEND_TELEMETRY=false
set -a; . ~/.config/yaldeagle/cloudflare.env; set +a
tmp=$(mktemp) && chmod 600 "$tmp" && printf 'UPLOAD_TOKEN=%s\n' "$(cat ~/.config/yaldeagle/feed-upload-token)" > "$tmp"
cf deploy --secrets-file "$tmp"; rm -f "$tmp"
```

The Cloudflare account also holds another project. Change only the Worker and the bucket named `yaldaq-feed`.

## Mark a credential as earned

1. In `src/room/items.ts`, find the item and change its `status` to `'earned'`.
2. Push to `main`. Vercel deploys the change.

The item then shows its colors in the room. If the item has a `worn` entry, the eagle puts that gear on during a visit to the item. The eagle starts each page load with no gear.

## Change the item text

All item text is in `src/room/items.ts`. The panel builds its sections from these fields:

| Field     | Section       | Shows                                                     |
| --------- | ------------- | --------------------------------------------------------- |
| `line`    | (under title) | Earned and in progress. A locked item shows a fixed lead. |
| `what`    | About         | Always.                                                   |
| `history` | Highlights    | Earned and in progress.                                   |
| `earn`    | Requirements  | In progress and locked.                                   |
| `stats`   | Stats         | The CS2 item only.                                        |
| `worn`    | On the eagle  | Items with gear (`worn.text`).                            |

The text is about Nick, in the third person, like an about-me page. Write facts only. Leave out a year or a detail that is not known, and do not put notes for the team on the page.

## Code map

| Path                              | Use                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`                      | Page shell, with the canvas container, the panel host, and the link preview tags (Open Graph) for Discord and other apps.                                                                                                                                                                                                                                                                   |
| `src/main.ts`                     | Start-up code. It makes the stage, the exhibits, the eagle with its gear, the animator, the brain, the visits, and the pointer input, and runs them each frame.                                                                                                                                                                                                                             |
| `src/style.css`                   | Page style, and the place of the panel host.                                                                                                                                                                                                                                                                                                                                                |
| `src/stage/stage.ts`              | Renderer, perspective camera, light over the room, ground, resize, and the frame loop.                                                                                                                                                                                                                                                                                                      |
| `src/lib/bounds.ts`               | The `Bounds` rectangle on the ground and its math.                                                                                                                                                                                                                                                                                                                                          |
| `src/lib/room.ts`                 | Room coordinates (u to the screen right, v toward the camera) and the fixed room bounds.                                                                                                                                                                                                                                                                                                    |
| `src/lib/view.ts`                 | Camera views: the overview with its pan and zoom, the close view of a visit, and the flights between them. Tests: `view.test.ts`.                                                                                                                                                                                                                                                           |
| `src/lib/rng.ts`                  | The seeded random source.                                                                                                                                                                                                                                                                                                                                                                   |
| `src/lib/ease.ts`                 | Easing curves.                                                                                                                                                                                                                                                                                                                                                                              |
| `src/room/areas.ts`               | The four areas of the room and their colors.                                                                                                                                                                                                                                                                                                                                                |
| `src/room/items.ts`               | The item data: place, status, text, and gear. Change the text here. Tests: `items.test.ts`.                                                                                                                                                                                                                                                                                                 |
| `src/room/kit.ts`                 | The box kit for the item models, and the paint modes (color, grey, ghost, cut).                                                                                                                                                                                                                                                                                                             |
| `src/room/models.ts`              | The 15 item models, and the parts that the eagle can wear on their own.                                                                                                                                                                                                                                                                                                                     |
| `src/room/exhibit.ts`             | One exhibit: the patch, the floor ring, and the floating item with its state look (earned, progress, locked). It has a place of the moment, which a drag changes.                                                                                                                                                                                                                           |
| `src/room/gear.ts`                | The earned gear on the eagle mounts. It is hidden at the start, and a visit puts it on.                                                                                                                                                                                                                                                                                                     |
| `src/room/plan.ts`                | The visit planner: the camera direction, the eagle spot, and the items to hide. No Three.js. Tests: `plan.test.ts`.                                                                                                                                                                                                                                                                         |
| `src/room/visit.ts`               | The app mode (wander, running, going, focus, leaving), the visit (the jump, the flight down, the gesture, the panel, the way back), and the trip to a clicked floor point.                                                                                                                                                                                                                  |
| `src/room/place.ts`               | The limits of a dragged item place. No Three.js. Tests: `place.test.ts`.                                                                                                                                                                                                                                                                                                                    |
| `src/room/trip.ts`                | The trip planner: the end point of a run to a clicked point, and a jump when an item is in the way. No Three.js. Tests: `trip.test.ts`.                                                                                                                                                                                                                                                     |
| `src/room/tooltip.ts`             | The text box at the pointer.                                                                                                                                                                                                                                                                                                                                                                |
| `src/input/pointer.ts`            | Hover, click, and Esc on the canvas, the item drag (a mouse drag, or a long press on touch), and touch: pan, pinch, and tap.                                                                                                                                                                                                                                                                |
| `src/input/gestures.ts`           | Tap, pan, and pinch from touch pointer events. No DOM. Tests: `gestures.test.ts`.                                                                                                                                                                                                                                                                                                           |
| `src/panel/content.ts`            | Turns an item into the panel text. No DOM. Tests: `content.test.ts`.                                                                                                                                                                                                                                                                                                                        |
| `src/panel/build.ts`              | Builds the panel like a steel frame building (blueprint, footings, columns, beams, wall panels), with Web Animations.                                                                                                                                                                                                                                                                       |
| `src/panel/panel.css`             | The panel style.                                                                                                                                                                                                                                                                                                                                                                            |
| `src/stats/steam.ts`              | Nick's lifetime stats from the Steam Web API: the server call with the key, and the summary. No DOM. Tests: `stats.test.ts`.                                                                                                                                                                                                                                                                |
| `src/stats/leetify.ts`            | Nick's CS2 stats from the Leetify public API. No DOM. Tests: `stats.test.ts`.                                                                                                                                                                                                                                                                                                               |
| `src/stats/cs2.ts`                | Loads both sources once for each page load, in memory only (a Leetify rule), and makes the text of the stat boxes. No DOM. Tests: `stats.test.ts`.                                                                                                                                                                                                                                          |
| `api/steam.ts`                    | The Vercel function for `/api/steam`. The dev server serves the same route (`vite.config.ts`).                                                                                                                                                                                                                                                                                              |
| `src/eagle/model.ts`              | `buildEagle()`: the eagle from boxes, with its part tree (legs and body turn at the hips) and mount points.                                                                                                                                                                                                                                                                                 |
| `src/eagle/palette.ts`            | The colors of the eagle.                                                                                                                                                                                                                                                                                                                                                                    |
| `src/eagle/mount-markers.ts`      | The dots for `?mounts`.                                                                                                                                                                                                                                                                                                                                                                     |
| `src/eagle/actions.ts`            | The actions (idle, hop, turn, squawk, look, the run, and the visit actions jump, face, tilt, shake, hop in place) and `TUNING`, the timings and weights of the behavior.                                                                                                                                                                                                                    |
| `src/eagle/brain.ts`              | Decides the next action. It keeps the eagle in the room bounds and off the items, and it can restart from a new pose. No Three.js and no DOM. Tests: `brain.test.ts`.                                                                                                                                                                                                                       |
| `src/eagle/animator.ts`           | Plays the actions on the eagle's parts, with the gaze for visits.                                                                                                                                                                                                                                                                                                                           |
| `src/eagle/manual-keys.ts`        | The keys for `?manual`.                                                                                                                                                                                                                                                                                                                                                                     |
| `src/yaldaq/data/contract.ts`     | The YALDAQ feed files, schema 2: the types of `live.json`, the day files, the reveal files, and `scores.json`. The contract with YALDAQ's exporter.                                                                                                                                                                                                                                         |
| `src/yaldaq/data/feed-paths.ts`   | The feed file paths, the store address, the dev address, and the cache time of each file kind.                                                                                                                                                                                                                                                                                              |
| `src/yaldaq/data/check.ts`        | The upload check of the store: the path, the schema, no Kalshi keys, no sealed keys outside a reveal file, and no early reveal. The Worker and the dev route run it. Tests: `check.test.ts`.                                                                                                                                                                                                |
| `src/yaldaq/data/feed.ts`         | Fetches and polls the feed, keeps one range of day files, loads the reveal files and the scores, and gives the feed state (connecting, empty, live, offline). Tests: `feed.test.ts`.                                                                                                                                                                                                        |
| `src/yaldaq/data/model.ts`        | The model from the feed files, and the state at any time: jobs, spend, envelopes and their counts, calls, the quiet rule, the last 24 hours, and the replay moments. Tests: `model.test.ts`.                                                                                                                                                                                                |
| `src/yaldaq/data/clock.ts`        | The live clock (5 minutes behind the wall clock) and the replay clock, with the URL options `?t=`, `?speed=`, and `?paused`. Tests: `clock.test.ts`.                                                                                                                                                                                                                                        |
| `src/yaldaq/data/scores.ts`       | The scoreboard at any time, from `scores.json`. Tests: `scores.test.ts`.                                                                                                                                                                                                                                                                                                                    |
| `src/yaldaq/data/facts.ts`        | The facts of each badge subject at any time. Tests: `facts.test.ts`.                                                                                                                                                                                                                                                                                                                        |
| `src/yaldaq/data/text.ts`         | The roles, the event lines, and the job and pilot text.                                                                                                                                                                                                                                                                                                                                     |
| `src/yaldaq/data/format.ts`       | Time, money, and percent formats (UTC).                                                                                                                                                                                                                                                                                                                                                     |
| `src/yaldaq/data/test-fixture.ts` | A small made-up feed for the tests, and a fake fetch. It is not YALDAQ data.                                                                                                                                                                                                                                                                                                                |
| `feed/`                           | The Cloudflare Worker of the YALDAQ store (see "The YALDAQ store"). It has its own `package.json` and config.                                                                                                                                                                                                                                                                               |
| `public/`                         | Static files: the link preview image (`og.png`, 1200 by 630, a picture of the room with a title card), the Leetify badge from their logo pack (`public/leetify/`), and the rank icons of the CS2 peaks (`public/ranks/`: the Global Elite badge from the CS:GO game files, the FACEIT level icon from FACEIT's site, and the CS2 Premier badge from the game files, in the red tier color). |
| `vite.config.ts`                  | Vite and Vitest config, the dev route for `/api/steam`, and the dev route for the YALDAQ feed at `/feed/v1/`.                                                                                                                                                                                                                                                                               |
| `tsconfig.node.json`              | The type check for `api/` and `vite.config.ts`, with Node types.                                                                                                                                                                                                                                                                                                                            |

Files in `src/lib/`, `src/stats/`, `src/yaldaq/data/`, `src/room/areas.ts`, `src/room/items.ts`, `src/room/plan.ts`, `src/room/place.ts`, `src/room/trip.ts`, `src/panel/content.ts`, `src/input/gestures.ts`, `actions.ts`, and `brain.ts` do not import Three.js or use the DOM, so Vitest can test them without a browser.

## License

MIT. See `LICENSE`.
