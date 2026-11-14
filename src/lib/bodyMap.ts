/**
 * The body figure of the schedule creator, front and back, drawn on a
 * 120 × 270 grid. Every shape is given for the half of the figure left of
 * the centre line (x < 60) as points of a smooth closed outline; the other
 * half is its mirror image. Muscle areas follow the catalog's 17 groups.
 */
import type { Muscle } from './schema/common.ts';
import type { InjuryArea } from './scheduleChoices.ts';

export type BodySide = 'front' | 'back';
type Point = readonly [number, number];

export const BODY_WIDTH = 120;
export const BODY_HEIGHT = 270;
const CENTRE = BODY_WIDTH / 2;

/** The outline's left half, from the top of the head round to the crotch. */
const OUTLINE: readonly Point[] = [
  [60, 4],
  [52.5, 6.5],
  [48.5, 14],
  [49, 24],
  [52, 31],
  [54, 35],
  [54, 39],
  [46, 43.5],
  [36, 46],
  [30, 51],
  [27, 60],
  [25.5, 72],
  [23.5, 86],
  [22, 98],
  [19.5, 112],
  [17.5, 126],
  [16.5, 139],
  [13.5, 147],
  [14, 157],
  [18.5, 163],
  [23, 160],
  [25.5, 150],
  [26.5, 141],
  [28.5, 128],
  [31.5, 113],
  [33.5, 102],
  [35.5, 88],
  [38, 74],
  [40, 66],
  [41.5, 78],
  [43.5, 92],
  [44, 104],
  [42.5, 116],
  [39.5, 128],
  [38.5, 142],
  [38.5, 160],
  [41, 180],
  [43, 190],
  [42, 201],
  [40.5, 214],
  [42.5, 232],
  [46, 248],
  [45, 256],
  [42.5, 262],
  [47, 265.5],
  [54, 264.5],
  [55.5, 256],
  [55, 248],
  [56, 232],
  [57.5, 214],
  [56.5, 201],
  [56.5, 190],
  [57.5, 174],
  [58.5, 154],
  [59.5, 139],
  [60, 135],
];

export interface MuscleArea {
  muscle: Muscle;
  /** Outlines of the left half; each is drawn on both halves. */
  shapes: readonly (readonly Point[])[];
}

const FOREARM: readonly Point[] = [
  [23.5, 102],
  [31, 103],
  [30.5, 113],
  [27, 128],
  [22, 136],
  [18.5, 131],
  [19.5, 116],
];

const SHOULDER: readonly Point[] = [
  [36.5, 47.5],
  [42, 49],
  [42, 57],
  [38, 64],
  [32, 66],
  [28.5, 60],
  [30.5, 51.5],
];

export const MUSCLE_AREAS: Record<BodySide, readonly MuscleArea[]> = {
  front: [
    {
      muscle: 'neck',
      shapes: [
        [
          [54, 35.5],
          [58.5, 37],
          [59.2, 44.5],
          [55, 44],
          [53, 40],
        ],
      ],
    },
    {
      muscle: 'traps',
      shapes: [
        [
          [53.2, 41],
          [53.5, 44.5],
          [45, 47.5],
          [39, 46.8],
          [46, 43.8],
        ],
      ],
    },
    { muscle: 'shoulders', shapes: [SHOULDER] },
    {
      muscle: 'chest',
      shapes: [
        [
          [43.5, 50],
          [59.2, 50.5],
          [59.2, 70],
          [54, 76],
          [45, 75.5],
          [40, 68],
          [41.5, 58],
        ],
      ],
    },
    {
      muscle: 'biceps',
      shapes: [
        [
          [30.5, 68],
          [36.5, 67.5],
          [36.8, 77],
          [34, 92],
          [29.5, 96],
          [26.5, 88],
          [27.5, 76],
        ],
      ],
    },
    { muscle: 'forearms', shapes: [FOREARM] },
    {
      muscle: 'abdominals',
      shapes: [
        [
          [48, 79.5],
          [59.2, 80],
          [59.2, 98],
          [59.2, 118],
          [55.5, 124],
          [50, 118],
          [48, 100],
        ],
        [
          [42.5, 76],
          [46, 79],
          [46.2, 100],
          [47.5, 114],
          [44, 110],
          [43.2, 94],
        ],
      ],
    },
    {
      muscle: 'abductors',
      shapes: [
        [
          [42.5, 117],
          [45.5, 121],
          [44, 133],
          [40.5, 141],
          [39, 132],
        ],
      ],
    },
    {
      muscle: 'quadriceps',
      shapes: [
        [
          [45, 127],
          [49.5, 130],
          [52, 140],
          [53, 158],
          [54, 175],
          [51, 186],
          [45.5, 186.5],
          [41, 176],
          [40, 157],
          [41, 142],
        ],
      ],
    },
    {
      muscle: 'adductors',
      shapes: [
        [
          [53, 137],
          [58.5, 140],
          [58.2, 154],
          [56, 166],
          [53.5, 154],
        ],
      ],
    },
    {
      muscle: 'calves',
      shapes: [
        [
          [41.5, 201],
          [44.5, 205],
          [44.5, 221],
          [43.5, 233],
          [41.5, 226],
          [40.8, 212],
        ],
        [
          [54, 201],
          [56, 205],
          [56.6, 216],
          [55, 232],
          [53.2, 222],
          [53, 208],
        ],
      ],
    },
  ],
  back: [
    {
      muscle: 'neck',
      shapes: [
        [
          [53.5, 30],
          [59.2, 31],
          [59.2, 39],
          [55, 39.5],
        ],
      ],
    },
    {
      muscle: 'traps',
      shapes: [
        [
          [59.2, 41],
          [59.2, 80],
          [55.5, 70],
          [50, 58],
          [41.5, 50.5],
          [38, 47.2],
          [46, 44.2],
          [54.5, 40.5],
        ],
      ],
    },
    { muscle: 'shoulders', shapes: [SHOULDER] },
    {
      muscle: 'triceps',
      shapes: [
        [
          [30.5, 68],
          [36.5, 67.5],
          [37.8, 77],
          [35, 92],
          [30, 96],
          [26.5, 88],
          [27.5, 76],
        ],
      ],
    },
    { muscle: 'forearms', shapes: [FOREARM] },
    {
      muscle: 'middle back',
      shapes: [
        [
          [49, 61],
          [55.5, 73],
          [59.2, 85],
          [59.2, 93],
          [53, 92],
          [46.5, 82],
          [44.5, 68],
        ],
      ],
    },
    {
      muscle: 'lats',
      shapes: [
        [
          [41.5, 64],
          [45, 76],
          [51.5, 94],
          [56, 101],
          [49, 110],
          [44.5, 104],
          [43.5, 92],
          [41.5, 78],
        ],
      ],
    },
    {
      muscle: 'lower back',
      shapes: [
        [
          [54.5, 96],
          [59.2, 96],
          [59.2, 120],
          [54, 121],
          [50, 112],
        ],
      ],
    },
    {
      muscle: 'glutes',
      shapes: [
        [
          [44, 117],
          [51, 119],
          [59.2, 125],
          [59.2, 140],
          [54, 148],
          [45, 146.5],
          [40, 137],
          [40.5, 126],
        ],
      ],
    },
    {
      muscle: 'hamstrings',
      shapes: [
        [
          [41.5, 151],
          [48.5, 150],
          [56.5, 152],
          [57.5, 167],
          [55.5, 183],
          [50.5, 188],
          [45, 186],
          [41.5, 176],
          [40, 162],
        ],
      ],
    },
    {
      muscle: 'calves',
      shapes: [
        [
          [42, 198],
          [48.5, 195],
          [55.5, 198],
          [57, 210],
          [55, 226],
          [50, 233],
          [45, 230],
          [41.5, 222],
          [40.8, 208],
        ],
      ],
    },
  ],
};

/**
 * The injury spots on each view, at the joint or area they stand for. On the
 * front view the person's right side is on the left of the picture.
 */
export const INJURY_SPOTS: Record<BodySide, readonly { area: InjuryArea; at: Point }[]> = {
  front: [
    { area: 'right-shoulder', at: [35, 55] },
    { area: 'left-shoulder', at: [85, 55] },
    { area: 'right-elbow', at: [28, 100] },
    { area: 'left-elbow', at: [92, 100] },
    { area: 'right-wrist', at: [21.5, 139] },
    { area: 'left-wrist', at: [98.5, 139] },
    { area: 'right-hip', at: [43, 124] },
    { area: 'left-hip', at: [77, 124] },
    { area: 'right-knee', at: [48.5, 190] },
    { area: 'left-knee', at: [71.5, 190] },
    { area: 'right-ankle', at: [50.5, 250] },
    { area: 'left-ankle', at: [69.5, 250] },
  ],
  back: [
    { area: 'neck', at: [60, 36] },
    { area: 'upper-back', at: [60, 66] },
    { area: 'lower-back', at: [60, 108] },
  ],
};

function mirror([x, y]: Point): Point {
  return [2 * CENTRE - x, y];
}

const round = (n: number) => Math.round(n * 100) / 100;

/** A smooth closed path through the points (Catmull–Rom as cubic Béziers). */
function smoothPath(points: readonly Point[]): string {
  const n = points.length;
  const at = (i: number) => points[(i + n) % n]!;
  let d = `M${round(at(0)[0])} ${round(at(0)[1])}`;
  for (let i = 0; i < n; i += 1) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${round(c1[0]!)} ${round(c1[1]!)} ${round(c2[0]!)} ${round(c2[1]!)} ${round(p2[0])} ${round(p2[1])}`;
  }
  return `${d}Z`;
}

/** The whole figure's outline. */
export const OUTLINE_PATH = smoothPath([...OUTLINE, ...OUTLINE.slice(1, -1).map(mirror).reverse()]);

/** A muscle area's paths: each of its shapes on the left half, then on the right. */
export function musclePaths(area: MuscleArea): string[] {
  return [
    ...area.shapes.map(smoothPath),
    ...area.shapes.map((shape) => smoothPath(shape.map(mirror).reverse())),
  ];
}
