# OpenRep

OpenRep is a free, open-source gym companion for iOS and Android. Open your
plan at the gym, tap an exercise to see a 3D figure performing it with the
targeted muscles glowing, and log your sets. No account, no backend, and it
works offline.

## Features

- **Plans**: any number of workout plans with days and exercises; per exercise
  sets, reps (a number or a range such as 8–12) or a time, optional weight,
  rest and notes. Edit, reorder and delete plans, days and exercises. Group
  two or more exercises into a superset (A1, A2, …) with one round count and
  one rest after each round.
- **Exercise catalog**: over 870 exercises, from the public-domain
  [free-exercise-db](https://github.com/yuhonas/free-exercise-db) plus community
  contributions. Search by name or alternative name ("skull crusher" finds
  Lying Triceps Press), filter by muscle and equipment. Hold an exercise in
  the list to preview it (its 3D movement, or its start and end photos)
  before adding or opening it. Exercises that are missing can be added as
  your own custom exercises.
- **Exercise pages**: alternative names, equipment, primary and secondary
  muscles, step-by-step instructions, photos and a 3D view you can rotate and
  zoom. Primary muscles glow strongly, secondary ones faintly. 70 core
  exercises (bench press, squat, deadlift, pull-up, plank, …) play the full
  movement; every other exercise shows the glow on a still figure.
- **Workout log**: start a day of a plan and go through it one exercise per
  screen, its 3D view on top (swipe to the photos of exercises without an
  animation) and its sets below as circles; scroll to move to the next one.
  Sets start filled with what you did last time; tap a circle when the set
  is done (the sets before it are ticked too), change the weight with − / +
  (it carries to the sets after it), and see the exercise's past workouts,
  change reps or add and remove sets in the ⋯ options. Ticking a set starts
  a rest countdown (the plan's rest, or the default rest from Settings) that
  shows when to start the next set, and finishing an exercise plays a short
  celebration, then moves on to the next one. Supersets are logged round by
  round on one screen, with the rest after each round. History lists past
  workouts. Weights in kg or lb.
- **Community schedules**: browse schedules and copy one into your plans to
  edit it. Three starter schedules ship with the app: Beginner Full Body,
  Push/Pull/Legs and Upper/Lower.
- **Catalog updates**: when online, the app downloads the latest catalog from
  this repository; the copy built into the app works offline from the first
  launch.
- **Contributing from the app**: Submit on one of your plans or custom
  exercises opens GitHub with the file ready to propose as a pull request.
- **Backup**: export everything (plans, custom exercises, history, settings)
  to one file and import it on this or another phone.

## Install

**Android**: open the [latest release](https://github.com/s1n7ax/openrep/releases/latest)
on your phone and download `OpenRep-<version>.apk`. Open the file; Android
asks you to allow your browser (or file manager) to install unknown apps.
Allow it, go back and tap **Install**. Next to each APK is a `.sha256` file
with its SHA-256 checksum.

To update, install the newer APK from the Releases page the same way: it
installs over the previous version and keeps your data. This works only
between APKs from the Releases page; a build from elsewhere (such as a debug
build) is signed with a different key and does not install over it.

**iOS**: there is no direct-download install yet. You can build the app from
source with Xcode (see [Building](#building)).

## Privacy

- No account, no login, no analytics, no ads, no tracking.
- Your plans, custom exercises, workouts and settings are stored only on your
  device. Phone backups (Google, iCloud) do not include them. To move to a new
  phone, use Settings → Backup: Export backup on the old phone, then Import
  backup on the new one.
- The app goes online only to download catalog updates from GitHub
  (`raw.githubusercontent.com`) and when you open GitHub yourself with Submit
  or the repository link. A Content-Security-Policy in the app allows no other
  network connections.

The full [privacy policy](docs/privacy-policy.md) covers every build: Google
Play, F-Droid, GitHub Releases and builds from source.

## Open data

Exercises, animations and schedules are plain JSON files in [`data/`](data),
documented in [docs/data-format.md](docs/data-format.md) with JSON Schemas in
[`data/schema/`](data/schema). They are CC0: other projects can use them
freely. The aggregated catalog is published at
`https://raw.githubusercontent.com/s1n7ax/openrep/catalog/catalog.json` on
every change to `main`.

## Building

You need Node.js 22 or newer.

```sh
npm ci
npm run dev        # run the app in a browser for development
npm run build      # web build in dist/ (with the bundled catalog)
```

**Android** (JDK 21, Android SDK with platform 36, `ANDROID_HOME` set):

```sh
npm run android:build
# → android/app/build/outputs/apk/debug/app-debug.apk
```

Install the debug APK with `adb install` or by copying it to the phone. Every
CI run also uploads it as the `openrep-debug-apk` artifact.

**iOS** (macOS with Xcode):

```sh
npm run build
npx cap sync ios
npx cap open ios   # then run it from Xcode
```

The app is not in the app stores yet. Releases to Google Play and F-Droid are
automated; [docs/releasing.md](docs/releasing.md) describes them and the
one-time store setup.

**Tests and checks**: `npm run format:check`, `npm run lint`, `npm run check`,
`npm test`, `npm run validate:data`, `npm run test:e2e:smoke` (the end-to-end
smoke tests; CI runs the full end-to-end suite, `npm run test:e2e`). See
[CONTRIBUTING.md](CONTRIBUTING.md) for details and platform notes.

## Project layout

```text
src/                 the app (Svelte 5, TypeScript)
  routes/            screens
  components/        shared UI
  lib/schema/        data formats (Zod), the single source of truth
  lib/three/         3D figure, muscles, IK, animation playback, props
data/                exercises, animations, schedules (CC0)
scripts/             catalog build, data validation, schema generation, tools
e2e/                 end-to-end tests (Playwright)
android/, ios/       Capacitor native projects
fastlane/metadata/   store listing for Google Play and F-Droid
fdroid/              F-Droid build recipe
docs/                data format, releasing, privacy policy
```

## Contributing

Exercises, animations, schedules and code are all welcome. Start with
[CONTRIBUTING.md](CONTRIBUTING.md).

## Licences

- Code: [GNU General Public License v3.0](LICENSE) (`GPL-3.0-only`).
- Data in `data/` (exercises, animations, schedules, photos):
  [CC0 1.0 Universal](data/LICENSE). The exercises and photos imported from
  free-exercise-db are public domain under the Unlicense.
- Third-party works (free-exercise-db, three.js, Svelte, Capacitor, Zod, MakeHuman):
  [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
