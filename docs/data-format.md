# OpenRep data format (v1)

OpenRep's exercises, animations and schedules are plain JSON files in this
repository, one file per item. They are released under
[CC0 1.0](../data/LICENSE): use them in any project, for any purpose, without
asking.

```text
data/
├── exercises/<id>.json            exercise files
├── exercises/images/<id>/<n>.webp exercise photos
├── animations/<exerciseId>.json   3D animations
├── schedules/<id>.json            workout schedules
├── schema/*.v1.json               JSON Schema of each format
└── LICENSE                        CC0 1.0
```

The formats are defined once, as [Zod](https://zod.dev) schemas in
`src/lib/schema/`. The JSON Schema files in `data/schema/` are generated from
them (`npm run generate:schema`) for use outside this repository; CI fails when
they are out of date. The schema files' `$id` is their URL on GitHub, e.g.
`https://raw.githubusercontent.com/s1n7ax/openrep/main/data/schema/exercise.v1.json`.

`npm run validate:data` checks every file against its schema plus the rules
the schemas cannot express (see [Validation](#validation)). Every pull request
runs it.

## Conventions

- **Ids** are kebab-case: lowercase letters and digits separated by single
  dashes (`^[a-z0-9]+(-[a-z0-9]+)*$`), e.g. `barbell-bench-press-medium-grip`.
- **The file name is the id**: `data/exercises/pushups.json` has
  `"id": "pushups"`; an animation file is named after its `exerciseId`.
- **Every file has a `formatVersion`**. This document describes version 1.
- **No other fields**: the v1 objects are strict, so a field not listed here is
  an error.
- **Text** fields marked "text" must contain something other than whitespace.

## Exercise

`data/exercises/<id>.json` — schema `data/schema/exercise.v1.json`.

| Field              | Type                    | Description                                                                                                   |
| ------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `formatVersion`    | `1`                     |                                                                                                               |
| `id`               | id                      | Equals the file name.                                                                                         |
| `name`             | text                    | Display name.                                                                                                 |
| `aliases`          | text[]                  | Other names people use, e.g. `"skull crusher"`. Searched like the name. No duplicates, not the name.          |
| `category`         | category                | See [enums](#enums).                                                                                          |
| `level`            | level                   | `beginner`, `intermediate` or `expert`.                                                                       |
| `force`            | force or `null`         | `pull`, `push` or `static`.                                                                                   |
| `mechanic`         | mechanic or `null`      | `compound` or `isolation`.                                                                                    |
| `equipment`        | equipment or `null`     | See [enums](#enums).                                                                                          |
| `primaryMuscles`   | muscle[] (at least one) | Glow strongly on the 3D figure.                                                                               |
| `secondaryMuscles` | muscle[]                | Glow faintly. A muscle cannot be both primary and secondary; no muscle is listed twice.                       |
| `instructions`     | text[]                  | Step-by-step instructions, in order.                                                                          |
| `images`           | image path[]            | Paths relative to `data/exercises/`, like `images/<exercise-id>/<name>.webp` (also png, jpg, jpeg).           |
| `source`           | object                  | `{ "name": "free-exercise-db", "id": "<upstream id>" }` for imported exercises, or `{ "name": "community" }`. |

```json
{
  "formatVersion": 1,
  "id": "pushups",
  "name": "Pushups",
  "aliases": ["push-up", "push up", "push-ups", "press-up"],
  "category": "strength",
  "level": "beginner",
  "force": "push",
  "mechanic": "compound",
  "equipment": "body only",
  "primaryMuscles": ["chest"],
  "secondaryMuscles": ["shoulders", "triceps"],
  "instructions": ["Lie on the floor face down …", "…"],
  "images": ["images/pushups/0.webp", "images/pushups/1.webp"],
  "source": { "name": "free-exercise-db", "id": "Pushups" }
}
```

The imported exercises come from
[free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Unlicense).
Their photos were converted to WebP, at most 400 px wide.

### Enums

| Enum      | Values                                                                                                                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| muscle    | `abdominals`, `abductors`, `adductors`, `biceps`, `calves`, `chest`, `forearms`, `glutes`, `hamstrings`, `lats`, `lower back`, `middle back`, `neck`, `quadriceps`, `shoulders`, `traps`, `triceps` |
| equipment | `bands`, `barbell`, `body only`, `cable`, `dumbbell`, `e-z curl bar`, `exercise ball`, `foam roll`, `kettlebells`, `machine`, `medicine ball`, `other`                                              |
| category  | `cardio`, `olympic weightlifting`, `plyometrics`, `powerlifting`, `strength`, `stretching`, `strongman`                                                                                             |
| level     | `beginner`, `intermediate`, `expert`                                                                                                                                                                |
| force     | `pull`, `push`, `static`                                                                                                                                                                            |
| mechanic  | `compound`, `isolation`                                                                                                                                                                             |

## Animation

`data/animations/<exerciseId>.json` — schema `data/schema/animation.v1.json`.

An animation is one repetition of an exercise, played as a loop on the 3D
figure. Exercises without an animation are shown on a still standing figure
with the same muscle glow.

| Field           | Type                      | Description                                                                                                                                                                                                          |
| --------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formatVersion` | `1`                       |                                                                                                                                                                                                                      |
| `exerciseId`    | id                        | The exercise it animates; equals the file name. The exercise must exist.                                                                                                                                             |
| `durationSec`   | number, > 0 and ≤ 60      | Length of one loop (one repetition) in seconds.                                                                                                                                                                      |
| `camera`        | `{ position, target }`    | Optional initial camera (world points). Default: a 3/4 view framing the figure and props, from the front — or from behind when most primary muscles are on the back. Choose a camera that shows the primary muscles. |
| `props`         | prop[]                    | Equipment, see [Props](#props).                                                                                                                                                                                      |
| `keyframes`     | keyframe[] (at least two) | Poses over the loop, see [Keyframes](#keyframes).                                                                                                                                                                    |

### Coordinate system

- Metres, **y up**. The figure stands at the origin, faces **+z**, with its feet
  on the floor (y = 0). The figure's left is **+x**.
- Positions are `[x, y, z]`. Rotations are Euler angles `[x, y, z]` in
  **degrees**, applied in X, Y, Z order.

### The figure

A ~1.78 m adult. Its joints form this hierarchy; each joint is also the name of
its pose field:

```text
pelvis ─ spine ─ chest ─ neck ─ head
                   ├─ leftShoulder  ─ leftElbow  ─ leftWrist  (hand)
                   └─ rightShoulder ─ rightElbow ─ rightWrist (hand)
pelvis ─ leftHip  ─ leftKnee  ─ leftAnkle  (foot)
pelvis ─ rightHip ─ rightKnee ─ rightAnkle (foot)
```

In the rest pose (every rotation zero) the figure stands upright with its arms
hanging at its sides, palms facing the thighs, and the pelvis joint is 0.98 m
above the floor. The exact segment lengths are in
`src/lib/three/dimensions.ts` (upper arm 0.29 m, forearm 0.255 m, thigh and
shin 0.43 m, …). Limb bones point along their local −y axis; the elbow and knee
hinge around local +x.

### Keyframes

| Field  | Type                                         | Description                                                                                 |
| ------ | -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `t`    | number, 0–1                                  | Time in the loop. The first keyframe has `t` 0, the last `t` 1, and `t` increases strictly. |
| `ease` | `linear`, `easeIn`, `easeOut` or `easeInOut` | Optional easing from this keyframe to the next. Default `easeInOut`.                        |
| `pose` | pose                                         | The pose at `t`.                                                                            |

Between keyframes positions are interpolated linearly and rotations along the
shortest arc (slerp). The loop wraps from `t` 1 to `t` 0, so the pose at `t` 1
should equal the pose at `t` 0.

### Pose

| Field                                    | Type                     | Description                                                                          |
| ---------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------ |
| `pelvis`                                 | `{ position, rotation }` | World position and rotation of the pelvis joint (the root).                          |
| `spine`, `chest`, `neck`, `head`         | rotation                 | Optional rotation relative to the parent joint.                                      |
| `leftHand`, `rightHand`                  | IK target                | Where the hand goes, see [IK targets](#ik-targets).                                  |
| `leftFoot`, `rightFoot`                  | IK target                | Where the foot goes.                                                                 |
| `leftShoulder`, `leftElbow`, `leftWrist` | rotation                 | FK angles of the left arm, relative to the parent joint (and the same for `right…`). |
| `leftHip`, `leftKnee`, `leftAnkle`       | rotation                 | FK angles of the left leg (and the same for `right…`).                               |

Each limb is driven **either** by its IK target **or** by its FK angles, never
both in one pose. A limb with an IK target must have one in every keyframe of
the file. Omitted rotations are zero (the rest pose).

### IK targets

`{ "target": [x, y, z], "pole": [x, y, z] }` — world points. The arm or leg is
solved with analytic two-bone IK so the hand or foot reaches `target`; the
elbow or knee bends towards `pole`. Without a pole, elbows point back and
slightly out and knees point forward. Targets out of reach are clamped (the
limb stretches straight towards them); the repository's tests require every
target of the shipped animations to be reached within 2 cm.

- **Hand target** = the grip point, the centre of the closed fist. The wrist
  stays straight. A hand holding a two-hand bar (prop attached to `hands`) or a
  bar it touches (pull-up bar, dip bars) turns so the bar runs through the fist,
  preferring an overhand grip; other hands keep a neutral forearm (palm towards
  the body when the arm hangs). Use FK arms for an underhand (supinated) bar
  grip.
- **Empty hand on the floor**: a hand target below 0.03 m that holds nothing is
  the palm centre of a hand lying flat on the floor, fingers pointing where the
  chest faces (push-up).
- **Foot target** = the ball of the foot, on the sole. On the floor (below
  0.03 m) or on the leg press plate the sole rests flat when the leg can reach,
  otherwise the heel lifts just enough (calf raise, plank). On the floor the
  heel also lifts when a flat foot would bend the ankle more than 45° (rear foot
  of a lunge). Feet in the air keep a neutral ankle.

### Props

| Field       | Type       | Description                                                                                                                                                                                   |
| ----------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`      | prop type  | `barbell`, `ez-bar`, `dumbbell`, `kettlebell`, `bench`, `incline-bench`, `cable-handle`, `rope-handle`, `lat-bar`, `pull-up-bar`, `dip-bars`, `leg-press`, `leg-extension`, `leg-curl`, `mat` |
| `attach`    | attachment | `none`, `hands`, `leftHand`, `rightHand`, `feet`, `leftFoot`, `rightFoot`                                                                                                                     |
| `position`  | position   | Optional; see below.                                                                                                                                                                          |
| `rotation`  | rotation   | Optional; see below.                                                                                                                                                                          |
| `cableFrom` | position   | Optional world point: draws a cable machine pulley there and a cable from it to the prop.                                                                                                     |

Placement by attachment:

- `none`: the prop stands in the world at `position` with `rotation`.
- `hands`: centred between the two grip points along the hand-to-hand axis
  (local +x from the right hand to the left hand, local +y towards `cableFrom`
  or up). `position` is a world offset; `rotation` turns the prop in that
  frame. A barbell, EZ bar, lat bar, cable handle or pull-up bar attached to
  the hands is held as a bar.
- `leftHand` / `rightHand`: at that hand's grip point, turning with the hand;
  the handle runs along the hand's thumb axis (local +z). `rotation` turns the
  prop in the hand's frame.
- `feet` / `leftFoot` / `rightFoot`: at the ball of the foot (or between both
  feet), keeping the world rotation `rotation`. The leg-extension and leg-curl
  roller is the exception: it rides on the shins, placed at the ankle joint (or
  between both), with `position` and `rotation` in the frame of the (left)
  lower leg: +y up the shin towards the knee, +z out of the front of the shin,
  +x to the figure's left.

### Example

```json
{
  "formatVersion": 1,
  "exerciseId": "barbell-curl",
  "durationSec": 3,
  "props": [{ "type": "barbell", "attach": "hands" }],
  "keyframes": [
    {
      "t": 0,
      "pose": {
        "pelvis": { "position": [0, 0.965, 0], "rotation": [0, 0, 0] },
        "leftShoulder": [-13, 0, 0],
        "leftElbow": [-4, 90, 0],
        "rightShoulder": [-13, 0, 0],
        "rightElbow": [-4, -90, 0],
        "leftFoot": { "target": [0.14, 0, 0.145], "pole": [0.2, 0.5, 1] },
        "rightFoot": { "target": [-0.14, 0, 0.145], "pole": [-0.2, 0.5, 1] }
      }
    },
    { "t": 0.5, "pose": { "…": "the top of the curl" } },
    { "t": 1, "pose": { "…": "the same as t = 0" } }
  ]
}
```

## Schedule

`data/schedules/<id>.json` — schema `data/schema/schedule.v1.json`.

| Field           | Type                 | Description                                       |
| --------------- | -------------------- | ------------------------------------------------- |
| `formatVersion` | `1`                  |                                                   |
| `id`            | id                   | Equals the file name.                             |
| `name`          | text                 | Display name.                                     |
| `description`   | string               | What the schedule is for (may be empty).          |
| `level`         | level                | Optional: `beginner`, `intermediate` or `expert`. |
| `days`          | day[] (at least one) | Training days in order.                           |

A **day** is `{ "name": text, "exercises": entry[] }` with at least one entry.
An **entry**:

| Field         | Type            | Description                                                                                                                               |
| ------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `exerciseId`  | id              | An exercise of the catalog. Optional when `name` is set.                                                                                  |
| `name`        | text            | The exercise's name. Required without `exerciseId`: such name-only entries let a schedule use an exercise that is not in the catalog yet. |
| `sets`        | integer, 1–20   |                                                                                                                                           |
| `reps`        | string          | A number (`"8"`) or an ascending range (`"8-12"`).                                                                                        |
| `durationSec` | integer, 1–3600 | For timed exercises such as a plank.                                                                                                      |
| `restSec`     | integer, 0–3600 | Optional rest after each set.                                                                                                             |
| `notes`       | string          | Optional.                                                                                                                                 |

Every entry sets exactly one of `reps` and `durationSec`.

```json
{
  "formatVersion": 1,
  "id": "example-schedule",
  "name": "Example",
  "description": "Two days, full body.",
  "level": "beginner",
  "days": [
    {
      "name": "Day A",
      "exercises": [
        { "exerciseId": "goblet-squat", "sets": 3, "reps": "10-12", "restSec": 90 },
        { "exerciseId": "plank", "sets": 3, "durationSec": 30 },
        { "name": "Sled push", "sets": 4, "reps": "20", "notes": "20 m each" }
      ]
    }
  ]
}
```

## Catalog

`catalog.json` — schema `data/schema/catalog.v1.json`. All data in one file,
built by `npm run build:catalog -- --out <dir>` (add `--json-only` to skip
copying the images). The app ships one inside it and downloads updates from:

```text
https://raw.githubusercontent.com/s1n7ax/openrep/catalog/catalog.json
```

A GitHub Action rebuilds that file on every push to `main` and publishes it as
the only file of the `catalog` branch.

| Field           | Type        | Description                                                                                                                                                     |
| --------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formatVersion` | `1`         |                                                                                                                                                                 |
| `revision`      | string      | Lowercase hex SHA-256 of the canonical JSON (keys sorted) of `formatVersion`, `exercises`, `animations` and `schedules`. Changes exactly when the content does. |
| `generatedAt`   | timestamp   | ISO 8601 UTC time the data last changed: the commit time of the last commit that changed `data/` (`SOURCE_DATE_EPOCH` when set). Not part of the revision.      |
| `exercises`     | exercise[]  | Sorted by `id`.                                                                                                                                                 |
| `animations`    | animation[] | Sorted by `exerciseId`.                                                                                                                                         |
| `schedules`     | schedule[]  | Sorted by `id`.                                                                                                                                                 |

Image paths stay relative to `data/exercises/`, so `images/pushups/0.webp` is at
`https://raw.githubusercontent.com/s1n7ax/openrep/main/data/exercises/images/pushups/0.webp`.
The catalog file on the `catalog` branch does not contain images.

The app accepts a downloaded catalog only when it parses, validates, has a
`formatVersion` the app supports, a `revision` different from the one it has
and is newer: a later `generatedAt`, or the same `generatedAt` and a greater
`revision`. Otherwise it keeps its current catalog. At launch it uses the newer,
by the same rule, of the catalog it downloaded and the one bundled with it, so
it never goes back to older data.

## Validation

`npm run validate:data` (also run on every pull request) reports every problem
with its file and exits 1 when there is any. Beyond the schemas it checks that:

- each file name equals its `id` (animations: its `exerciseId`), and only
  `.json` files are in the data folders;
- ids are unique;
- every image path of an exercise exists;
- every animation's `exerciseId` and every schedule `exerciseId` is an existing
  exercise.

## Versioning

- Every file carries its `formatVersion`. The current version of every format
  is 1.
- A change that existing readers would reject or misread is a breaking change:
  renaming or removing a field, changing a meaning or unit, and — because v1
  objects allow no unknown fields — adding a field. A breaking change gets a new
  version: `formatVersion: 2` in the files and new schema files
  (`data/schema/*.v2.json`) next to the v1 ones.
- Apps ignore data with a `formatVersion` they do not know. OpenRep keeps its
  current catalog when a downloaded one has an unsupported `formatVersion` and
  tells the user an app update is needed.

## Reusing the data

- Everything under `data/` is CC0 1.0: no attribution required (crediting
  OpenRep and free-exercise-db is appreciated).
- To read it all at once, download the catalog from the URL above; to follow
  changes, watch the `catalog` branch or read the files from `main`.
- Validate your copy, or data you produce for OpenRep, with the JSON Schema
  files in `data/schema/`, or run `npm run validate:data -- --data <dir>` on a
  directory with the same layout as `data/`.
- To render animations yourself, `src/lib/three/` is a reference
  implementation (GPL-3.0): `animation.ts` samples keyframes, `ik.ts` solves
  the two-bone IK, `pose.ts` applies a pose and `props.ts` places the props.
