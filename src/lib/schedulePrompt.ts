/**
 * The schedule creator's output: a prompt for an AI assistant, built from the
 * user's answers, that gets a plan file back. It is self-contained, so it works
 * with an assistant that has no web access: it carries the plan file format
 * (`llms.txt` describes the same format with online links) and the catalog
 * exercises the user has the equipment for.
 */
import { DEFAULT_CATALOG_URL } from './catalog/urls.ts';
import { equipmentLabel, muscleList } from './labels.ts';
import { createPlanFile } from './planFile.ts';
import { injuryLabel } from './scheduleChoices.ts';
import { EQUIPMENT, MUSCLES, type Equipment } from './schema/common.ts';
import type { Exercise } from './schema/exercise.ts';
import type {
  CustomExercise,
  PickedExercise,
  Plan,
  ScheduleAnswers,
  Session,
  Unit,
} from './schema/userData.ts';
import { formatWeightWithUnit } from './units.ts';
import { planToBuildOn, recentBestSets } from './userData/selectors.ts';
import { formatLoggedSet } from './userData/workoutText.ts';

/** Always available; exercises the catalog gives no equipment count as bodyweight. */
const BODYWEIGHT: Equipment = 'body only';

/** The equipment to choose from: bodyweight is always allowed, so it is no choice. */
export const EQUIPMENT_CHOICES = EQUIPMENT.filter((item) => item !== BODYWEIGHT);

/** How far back the logged lifts in the prompt go, in days. */
const LOGGED_LIFTS_DAYS = 90;
/** Most exercises the logged lifts in the prompt cover. */
export const LOGGED_LIFTS_LIMIT = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Free text on one line. */
function oneLine(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/** What the prompt says about supersets, or nothing when the user left it open. */
function supersetsAnswer(answer: string): string {
  if (answer === 'Yes') return 'use them where they fit';
  return answer === 'No' ? 'do not use them' : '';
}

/** Picked items and typed text as one answer: "Left knee, Tennis elbow, sore after runs". */
function joined(...parts: readonly string[]): string {
  return parts
    .map(oneLine)
    .filter((part) => part !== '')
    .join(', ');
}

function exerciseNames(list: readonly PickedExercise[], typed: string): string {
  return joined(...list.map((item) => item.name), typed);
}

/** The answered questions, as "- Label: value" lines. */
function aboutMe(answers: ScheduleAnswers, equipment: readonly Equipment[], unit: Unit): string[] {
  const weight = (kg: number | null) => (kg === null ? '' : formatWeightWithUnit(kg, unit));
  const facts: [string, string][] = [
    ['Equipment', joined(...equipment.map(equipmentLabel), ...answers.extraEquipment)],
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
    ['Injuries', joined(...answers.injuryPicks.map(injuryLabel), answers.injuries)],
    ['Exercises to avoid', exerciseNames(answers.avoidList, answers.avoidExercises)],
    ['Exercises to include', exerciseNames(answers.includeList, answers.includeExercises)],
    ['Muscles to prioritise', muscleList(answers.priorityMuscles)],
    ['Other sports', joined(...answers.sports, answers.otherSports)],
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

/**
 * The plan to build on, as the plan file's \`plan\` (and the custom exercises
 * it uses) without the file's header, ids and timestamps: the assistant sees
 * the format it replies in, yet the prompt pasted back by mistake holds no
 * plan file to import.
 */
function currentPlanJson(plan: Plan, customExercises: readonly CustomExercise[]): string {
  const file = createPlanFile(plan, customExercises);
  const current = {
    plan: {
      name: file.plan.name,
      days: file.plan.days.map((day) => ({
        name: day.name,
        exercises: day.exercises.map(({ id: _id, ...entry }) => entry),
        ...(day.supersets === undefined ? {} : { supersets: day.supersets }),
      })),
    },
    ...(file.customExercises === undefined
      ? {}
      : {
          customExercises: file.customExercises.map(
            ({ createdAt: _created, updatedAt: _updated, ...custom }) => custom,
          ),
        }),
  };
  return JSON.stringify(current, null, 2);
}

/**
 * A short prompt to copy into an AI assistant before asking for a plan in its
 * own words: the plan file format, and where the catalog's exercise ids are.
 * An assistant that cannot open the link still writes a plan the app imports,
 * matching its exercises by name.
 */
export const QUICK_PLAN_PROMPT = `${[
  'Write the workout plan I ask for below as a plan file for OpenRep, my gym app.',
  [
    '## Exercises',
    '',
    `The list of exercises, with their ids, is the \`exercises\` array of ${DEFAULT_CATALOG_URL}. Use the exercise's \`id\` as \`exerciseId\` and its \`name\` as \`name\`. If you cannot open the list, give each exercise its usual English name: the app finds exercises by name.`,
  ].join('\n'),
  FORMAT,
  '## The plan I want',
].join('\n\n')}\n\n`;

export interface SchedulePromptInput {
  answers: ScheduleAnswers;
  unit: Unit;
  /** The user's plans: the one to build on is found among them. */
  plans?: readonly Plan[];
  customExercises?: readonly CustomExercise[];
  /** The catalog's exercises. */
  exercises: readonly Exercise[];
  /** The user's logged workouts. */
  sessions: readonly Session[];
  now: Date;
}

/** What to do with `weightKg`: keep a current plan's weights, start from logged lifts. */
function weightRule(buildsOnPlan: boolean, hasLifts: boolean): string {
  const fresh = hasLifts
    ? 'set `weightKg` only where my logged lifts give a sound starting weight. Otherwise leave it out, and I will choose the weight in the app.'
    : 'leave `weightKg` out: I will choose the weights in the app.';
  return buildsOnPlan
    ? `- Keep the \`weightKg\` my current plan gives an exercise, and change it only where my answers ask for it. For an exercise new to the plan, ${fresh}`
    : `- ${fresh.charAt(0).toUpperCase()}${fresh.slice(1)}`;
}

/** The prompt to give an AI assistant. */
export function buildSchedulePrompt(input: SchedulePromptInput): string {
  const { answers, unit, exercises, sessions, now, plans = [], customExercises = [] } = input;
  const basePlan = planToBuildOn(plans, answers.basePlanId);
  const changes = joined(...answers.planChanges);
  // In catalog order; bodyweight last.
  const equipment = [
    ...EQUIPMENT_CHOICES.filter((item) => answers.equipment.includes(item)),
    BODYWEIGHT,
  ];
  const since = new Date(now.getTime() - LOGGED_LIFTS_DAYS * DAY_MS).toISOString();
  const lifts = recentBestSets(sessions, since, LOGGED_LIFTS_LIMIT);

  const sections = [
    'You are an experienced strength coach. Write a workout plan for me as a plan file for OpenRep, my gym app.',
    ['## About me', '', ...aboutMe(answers, equipment, unit)].join('\n'),
    ...(basePlan === undefined
      ? []
      : [
          [
            '## My current plan',
            '',
            'This is the plan I train with now. Build the new plan on it: keep what works for me, and change what my answers ask for.',
            ...(changes === '' ? [] : ['', `What I want changed: ${changes}.`]),
            '',
            '```json',
            currentPlanJson(basePlan, customExercises),
            '```',
          ].join('\n'),
        ]),
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
      ...equipment.flatMap((item) => [
        '',
        `### ${equipmentLabel(item)}`,
        '',
        ...exercises
          .filter((exercise) => (exercise.equipment ?? BODYWEIGHT) === item)
          .map((exercise) => `${exercise.id}: ${exercise.primaryMuscles.join(', ')}`),
      ]),
    ].join('\n'),
    [
      '## How to build the plan',
      '',
      '- Follow everything under "About me": it comes first when it conflicts with anything else here.',
      ...(basePlan === undefined
        ? []
        : ['- Start from my current plan, and reply with the whole new plan, under a new name.']),
      '- Give the plan as many days as I train in a week, each short enough to fit my session, warm-up included.',
      '- Put compound lifts first, and balance the work across the week.',
      '- Choose a sensible number of sets, reps and rest for my goal and experience.',
      weightRule(basePlan !== undefined, lifts.length > 0),
      basePlan === undefined
        ? '- Never invent an `exerciseId`: use only the ids listed above.'
        : '- Never invent an `exerciseId`: use only the ids listed above, or ones my current plan already uses.',
    ].join('\n'),
    FORMAT,
  ];
  return `${sections.join('\n\n')}\n`;
}
