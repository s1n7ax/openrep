/**
 * The schedule creator's output: a prompt for an AI assistant, built from the
 * user's answers, that gets a plan file back. It is self-contained, so it works
 * with an assistant that has no web access: it carries the plan file format
 * (`llms.txt` describes the same format with online links) and the catalog
 * exercises the user has the equipment for.
 */
import { equipmentLabel, muscleList } from './labels.ts';
import { EQUIPMENT, MUSCLES, type Equipment } from './schema/common.ts';
import type { Exercise } from './schema/exercise.ts';
import type { ScheduleAnswers, Session, Unit } from './schema/userData.ts';
import { formatWeightWithUnit } from './units.ts';
import { recentBestSets } from './userData/selectors.ts';
import { formatLoggedSet } from './userData/workoutText.ts';

/** The answers of the creator's menus: what is picked is what the prompt says. */
export const GOALS = [
  'Build muscle',
  'Get stronger',
  'Lose fat',
  'General fitness',
  'Sport performance',
] as const;
export const DAYS_PER_WEEK = ['1', '2', '3', '4', '5', '6', '7'] as const;
export const SESSION_MINUTES = ['30', '45', '60', '75', '90', '120'] as const;
export const SPLITS = ['Full body', 'Upper/lower', 'Push/pull/legs', 'Body-part split'] as const;
export const SUPERSETS = ['Yes', 'No'] as const;
export const EXPERIENCE = ['New to lifting', 'Under 1 year', '1–3 years', '3+ years'] as const;
export const STRENGTH_LEVELS = ['Novice', 'Intermediate', 'Advanced'] as const;
export const SEXES = ['Female', 'Male'] as const;

/** The answers a plan cannot be designed without. */
export const REQUIRED_ANSWERS = ['goal', 'daysPerWeek', 'sessionMinutes', 'experience'] as const;

/** How far back the logged lifts in the prompt go, in days. */
export const LOGGED_LIFTS_DAYS = 90;
/** Most exercises the logged lifts in the prompt cover. */
export const LOGGED_LIFTS_LIMIT = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Always available; exercises the catalog gives no equipment count as bodyweight. */
const BODYWEIGHT: Equipment = 'body only';

/** The exercises of each piece of equipment the user has, in catalog order; bodyweight last. */
function exercisesByEquipment(
  exercises: readonly Exercise[],
  equipment: readonly Equipment[],
): [Equipment, Exercise[]][] {
  const available = EQUIPMENT.filter((item) => item !== BODYWEIGHT && equipment.includes(item));
  return [...available, BODYWEIGHT].map((item) => [
    item,
    exercises.filter((exercise) => (exercise.equipment ?? BODYWEIGHT) === item),
  ]);
}

/** Free text on one line. */
function oneLine(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/** What the prompt says about supersets, or nothing when the user left it open. */
function supersetsAnswer(answer: string): string {
  if (answer === 'Yes') return 'use them where they fit';
  return answer === 'No' ? 'do not use them' : '';
}

/** The answered questions, as "- Label: value" lines. */
function aboutMe(answers: ScheduleAnswers, groups: readonly Equipment[], unit: Unit): string[] {
  const weight = (kg: number | null) => (kg === null ? '' : formatWeightWithUnit(kg, unit));
  const facts: [string, string][] = [
    ['Equipment', groups.map(equipmentLabel).join(', ')],
    ['Main goal', answers.goal],
    ['Training days per week', answers.daysPerWeek],
    ['Time per session', answers.sessionMinutes && `${answers.sessionMinutes} minutes`],
    ['Week layout', answers.weekLayout],
    ['Split', answers.split],
    ['Supersets', supersetsAnswer(answers.supersets)],
    ['Training experience', answers.experience],
    ['Strength level', answers.strengthLevel],
    ['Body weight', weight(answers.bodyWeightKg)],
    ['Target weight', weight(answers.targetWeightKg)],
    ['Age', answers.age],
    ['Sex', answers.sex],
    ['Height', answers.height],
    ['Injuries', answers.injuries],
    ['Exercises to avoid', answers.avoidExercises],
    ['Exercises to include', answers.includeExercises],
    ['Muscles to prioritise', muscleList(answers.priorityMuscles)],
    ['Other sports', answers.otherSports],
    ['Anything else', answers.notes],
  ];
  return facts.flatMap(([label, value]) =>
    oneLine(value) === '' ? [] : [`- ${label}: ${oneLine(value)}`],
  );
}

/**
 * The plan file format. Its example is complete, but its placeholder ids are
 * not valid ids: pasted back by mistake, the prompt must not import as a plan.
 */
const FORMAT = `## Plan file format

Reply with the plan file only: one JSON document in one code block.

\`\`\`json
{
  "app": "openrep",
  "kind": "plan",
  "formatVersion": 1,
  "plan": {
    "name": "<plan name>",
    "days": [
      {
        "name": "<day name>",
        "exercises": [
          {
            "exercise": { "kind": "catalog", "exerciseId": "<id from the list>", "name": "<exercise name>" },
            "sets": 3,
            "reps": "8-12",
            "weightKg": 40,
            "restSec": 120,
            "notes": "Two warm-up sets first."
          },
          {
            "exercise": { "kind": "catalog", "exerciseId": "<id from the list>", "name": "<exercise name>" },
            "sets": 3,
            "reps": "12",
            "supersetId": "pair"
          },
          {
            "exercise": { "kind": "catalog", "exerciseId": "<id from the list>", "name": "<exercise name>" },
            "sets": 3,
            "durationSec": 40,
            "supersetId": "pair"
          }
        ],
        "supersets": [{ "id": "pair", "restSec": 90 }]
      }
    ]
  }
}
\`\`\`

- \`plan.days\` has at least one day, in training order, and \`exercises\` are in the order they are done.
- \`sets\` is an integer from 1 to 20. Set exactly one of \`reps\` (a string: a number or an ascending range such as "8-12") and \`durationSec\` (an integer from 1 to 3600, for timed holds).
- \`weightKg\` (optional) is a number in kilograms, never pounds (1 lb = 0.45359237 kg). Leave it out for bodyweight.
- \`restSec\` (optional) is the rest after each set: an integer from 0 to 3600.
- \`notes\` (optional) are form cues.
- A superset is two or more exercises done alternately, with the rest after each round. Its exercises are next to each other, each with the superset's \`id\` as \`supersetId\`; put \`restSec\` on the superset, not on its exercises.
- For an exercise that is not listed, add \`"customExercises": [{ "id": "sled-push", "name": "Sled Push", "primaryMuscles": ["quadriceps"], "instructions": ["Push it 20 m."] }]\` next to \`plan\`, and refer to it with \`{ "kind": "custom", "customExerciseId": "sled-push", "name": "Sled Push" }\`. Muscles are ${MUSCLES.join(', ')}.
- Text must not be empty. Use only the fields shown here, with no comments and no trailing commas: anything else gets the file rejected.`;

export interface SchedulePromptInput {
  answers: ScheduleAnswers;
  unit: Unit;
  /** The catalog's exercises. */
  exercises: readonly Exercise[];
  /** The user's logged workouts. */
  sessions: readonly Session[];
  now: Date;
}

/** The prompt to give an AI assistant. */
export function buildSchedulePrompt(input: SchedulePromptInput): string {
  const { answers, unit, exercises, sessions, now } = input;
  const groups = exercisesByEquipment(exercises, answers.equipment);
  const equipment = groups.map(([item]) => item);
  const since = new Date(now.getTime() - LOGGED_LIFTS_DAYS * DAY_MS).toISOString();
  const lifts = recentBestSets(sessions, since, LOGGED_LIFTS_LIMIT);

  const sections = [
    'You are an experienced strength coach. Write a workout plan for me as a plan file for OpenRep, my gym app.',
    ['## About me', '', ...aboutMe(answers, equipment, unit)].join('\n'),
    ...(lifts.length === 0
      ? []
      : [
          [
            '## My logged lifts',
            '',
            'My best recent set of each exercise, from my workout log:',
            '',
            ...lifts.map(({ name, set }) => `- ${oneLine(name)}: ${formatLoggedSet(set, unit)}`),
          ].join('\n'),
        ]),
    [
      '## Exercises',
      '',
      'Use these exercises, by id: they are the ones I have the equipment for. Each line is an `exerciseId`, then the main muscles it works.',
      ...groups.flatMap(([item, list]) => [
        '',
        `### ${equipmentLabel(item)}`,
        '',
        ...list.map((exercise) => `${exercise.id}: ${exercise.primaryMuscles.join(', ')}`),
      ]),
    ].join('\n'),
    [
      '## How to build the plan',
      '',
      '- Follow everything under "About me": it comes first when it conflicts with anything else here.',
      '- Give the plan as many days as I train in a week, each short enough to fit my session, warm-up included.',
      '- Put compound lifts first, and balance the work across the week.',
      '- Choose a sensible number of sets, reps and rest for my goal and experience.',
      lifts.length === 0
        ? '- Leave `weightKg` out: I will choose the weights in the app.'
        : '- Set `weightKg` only where my logged lifts give a sound starting weight. Otherwise leave it out, and I will choose the weight in the app.',
      '- Never invent an `exerciseId`: use only the ids listed above.',
    ].join('\n'),
    FORMAT,
  ];
  return `${sections.join('\n\n')}\n`;
}
