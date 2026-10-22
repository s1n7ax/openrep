# Contributing to OpenRep

Thanks for helping! OpenRep has two kinds of contributions:

- **Data**: exercises, animations and workout schedules in `data/`. They are
  plain JSON files described in [docs/data-format.md](docs/data-format.md).
- **Code**: the app itself (Svelte, TypeScript, three.js, Capacitor).

Every pull request is checked automatically: formatting, lint, type checks,
unit tests, the data validator, the end-to-end tests and the Android and iOS
builds (`.github/workflows/ci.yml`). A pull request with malformed data fails.

## Licence of contributions

- Code is licensed under the [GNU GPL v3.0](LICENSE) (`GPL-3.0-only`).
- Data (everything under `data/`) is dedicated to the public domain under
  [CC0 1.0](data/LICENSE).

By opening a pull request you agree that your contribution is released under
these licences. Only contribute data and images you made yourself or that are
public domain (or CC0) already: no photos or text copied from other sites.

## From the app: Submit

The quickest way to share a plan or an exercise:

1. A plan: open it and tap **Submit to OpenRep**. It becomes a community
   schedule (`data/schedules/<id>.json`). Your custom exercises in it become
   name-only entries, and weights are left out.
2. A custom exercise: open it, add at least one primary muscle and one step,
   and tap **Submit to OpenRep**. It becomes `data/exercises/<id>.json`.

The app copies the file to your clipboard and opens GitHub's "new file" page
with the file name (and, when it fits in the link, the content) filled in. If
the editor is empty, paste. Then choose **Commit changes…** and **Propose
changes** to open the pull request. You need a free GitHub account.

## By pull request

Fork the repository, add or change files under `data/`, run
`npm run validate:data` and open a pull request.

### Adding an exercise

1. Pick a kebab-case id that is not taken, e.g. `landmine-press`.
2. Create `data/exercises/landmine-press.json` with the fields in
   [docs/data-format.md](docs/data-format.md#exercise). Use
   `"source": { "name": "community" }`.
3. Add common alternative names to `aliases`: search uses them.
4. Photos are optional. Put them in `data/exercises/images/<id>/` as WebP, at
   most 400 px wide, and list them in `images`
   (`"images/landmine-press/0.webp"`).

### Adding a schedule

Create `data/schedules/<id>.json` ([format](docs/data-format.md#schedule)).
Reference catalog exercises by `exerciseId`. For an exercise that is not in
the catalog, use a name-only entry (`"name": "Sled push"`); the app copies it
into plans as a custom exercise.

### Adding an animation

Animations exist for 30 core exercises; every other exercise shows its muscles
on a still figure. To animate one:

1. Create `data/animations/<exerciseId>.json` for an existing exercise
   ([format](docs/data-format.md#animation)). Copy a similar animation as a
   starting point: `pullups.json` (hanging from a bar), `barbell-squat.json`
   (standing with a bar on the back), `dumbbell-flyes.json` (lying on a bench),
   `seated-cable-rows.json` (cable machine).
2. Preview it while you edit (see [Development setup](#development-setup)):

   ```sh
   npm run dev
   ```

   - `http://localhost:5173/#/exercises/<id>` shows the exercise page with the
     movement playing.
   - `http://localhost:5173/#/dev/pose/<id>?t=0.25` shows the figure full
     screen, frozen at loop time `t` (0–1). Optional: `view=front|side|back|top`,
     `zoom=2` (closer) and `focus=x,y,z` (a world point to look at, e.g. a hand).

   The dev server builds the catalog from `data/` on every request and reloads
   the page when a file under `data/` changes.

3. Review the whole loop in one image:

   ```sh
   npm run contact-sheet -- <id>          # or: --all
   ```

   It writes `test-results/contact-sheets/<id>.png`: rows are camera views
   (`--views`, default `default,side`), columns are loop times (`--times`,
   default `0,0.25,0.5,0.75`). It starts its own dev server and a headless
   Chromium (see the Playwright notes below).

4. Check, at every column: feet on the floor or the machine, hands on the bar
   or handle, no limb passing through the body or the bench, a recognisable
   start and end position, and a smooth loop (the last keyframe repeats the
   first).
5. Run `npm test`. For every animation it checks that each IK target is reached
   within 2 cm, the loop closes, the figure is mid-movement at `t` 0.5 (not
   back at its start pose), and nothing sinks through the floor. Then run
   `npm run validate:data`.

Authoring rules (also in the comments at the top of `src/lib/three/pose.ts`
and `src/lib/three/props.ts`):

- Metres, y up, the figure faces +z with its feet on y = 0; its left is +x.
  Rotations are Euler degrees in X, Y, Z order.
- Prefer **IK targets** for hands and feet: they keep feet planted and hands on
  the bar. A hand target is the centre of the fist (the grip point); a foot
  target is the ball of the foot. Use `pole` to choose where the elbow or knee
  points.
- Hands holding a two-hand bar (prop attached to `hands`) or touching a
  pull-up or dip bar turn onto it with an overhand grip. For an underhand bar
  grip (curls), use **FK arms** (`leftShoulder`, `leftElbow`, `leftWrist`, …).
- When the hands must move with the torso (bar on the back, dumbbell at the
  chest), use FK arms too: IK targets would drift between keyframes. This
  helper computes the angles for a grip point fixed to the chest:

  ```sh
  npm run animation:fk-arms -- --target 0.2,0.15,-0.05 [--pole x,y,z] [--grip bar|handle|none]
  ```

  `--target` is the left grip point in the chest frame (chest joint at the
  origin, +x the figure's left, +y up the spine, +z forward); the right side is
  mirrored. It prints the six pose fields to paste into each keyframe.

- A hand target below 3 cm that holds nothing is a hand flat on the floor
  (push-up). A foot target below 3 cm stands on the floor; the heel lifts when
  the leg cannot reach or the ankle would bend over 45°.
- Props attached to `hands` sit between the grip points; to `leftHand` /
  `rightHand`, in that hand; to `feet`, at the balls of the feet (the
  leg-extension and leg-curl roller rides on the shins). `cableFrom` draws a
  cable machine from that point to the prop.

## Development setup

Requirements:

- Node.js 22 or newer and npm.
- For Android builds: JDK 21 and the Android SDK with platform 36 (set
  `ANDROID_HOME`).
- For iOS builds: macOS with Xcode.

```sh
npm ci
npm run dev                 # the app in a browser, catalog served from data/
```

Checks (the same ones CI runs):

```sh
npm run format              # or format:check
npm run lint
npm run check               # svelte-check and TypeScript
npm test                    # unit tests (Vitest)
npm run generate:schema -- --check
npm run validate:data
npm run build
npm run test:e2e            # end-to-end tests (Playwright, Chromium)
```

End-to-end tests build the app into `dist-e2e/` with a local catalog URL and
run it with `vite preview`. Install the browser once with
`npx playwright install chromium`. The 3D tests render with software WebGL and
are slow; on a machine with little memory, run them with `--workers=1`
(`npm run test:e2e -- --workers=1`).

Apps:

```sh
npm run android:build       # debug APK: android/app/build/outputs/apk/debug/app-debug.apk
npm run build && npx cap sync ios && npx cap open ios   # macOS: build and run in Xcode
```

Other scripts:

| Script                                 | What it does                                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run build:catalog -- --out <dir>` | Builds `catalog.json` and copies the images (`--json-only`: just the JSON).                                                                |
| `npm run generate:schema`              | Regenerates `data/schema/*.v1.json` after changing a schema in `src/lib/schema/`.                                                          |
| `npm run import:free-exercise-db`      | Re-imports free-exercise-db at the pinned commit (keeps existing images unless `--force`). Curated aliases live in `scripts/aliases.json`. |
| `npm run generate:app-assets`          | Regenerates the app icons and splash screens from `resources/icon.svg`.                                                                    |
| `npm run check:apk-version -- <apk>`   | Checks that an APK's versionName and versionCode come from `package.json`'s version (needs `ANDROID_HOME`).                                |

### NixOS notes

- **Android**: Gradle downloads its own `aapt2`, which does not run on NixOS.
  Point it at the SDK's: `export GRADLE_OPTS="-Dorg.gradle.project.android.aapt2FromMavenOverride=$ANDROID_HOME/build-tools/<version>/aapt2"`.
  The SDK directory must be writable (Gradle installs missing platforms into
  it), so use a copy of the Nix-provided SDK rather than the read-only store
  path.
- **Playwright**: use a browser set built for the same Playwright version as
  `@playwright/test` in `package.json` (nixpkgs `playwright-driver.browsers`)
  and tell Playwright about it:
  `export PLAYWRIGHT_BROWSERS_PATH=<that browser set>` and
  `export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true`. The contact-sheet
  script uses the same browsers.

## Code conventions

- TypeScript with relative imports that include the file extension.
- Svelte 5 (runes) components, scoped CSS with the design tokens in
  `src/app.css`.
- The data formats are defined once, in `src/lib/schema/`. After changing one,
  run `npm run generate:schema` and update `docs/data-format.md`.
- Pull request titles and commit messages follow
  [Conventional Commits](https://www.conventionalcommits.org) (`feat(ui): …`,
  `fix(data): …`). Pull requests are squash-merged, and release-please builds
  the changelog and the next version from these messages (`feat` → minor,
  `fix` → patch).
