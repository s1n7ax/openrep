/**
 * Writes the JSON Schema files in `data/schema/` from the zod schemas in
 * `src/lib/schema/`, the single source of truth for the data formats.
 *
 * Usage: `npm run generate:schema` to write, `npm run generate:schema -- --check`
 * to exit 1 when a file is missing or stale.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as z from 'zod';
import { animationSchema } from '../src/lib/schema/animation.ts';
import { catalogV1Schema, catalogV2Schema } from '../src/lib/schema/catalog.ts';
import { exerciseSchema } from '../src/lib/schema/exercise.ts';
import { planFileSchema } from '../src/lib/schema/planFile.ts';
import { scheduleV1Schema, scheduleV2Schema } from '../src/lib/schema/schedule.ts';
import { DATA_DIR } from './lib/paths.ts';

const SCHEMA_DIR = path.join(DATA_DIR, 'schema');
const SCHEMA_BASE_URL = 'https://raw.githubusercontent.com/s1n7ax/openrep/main/data/schema/';

const SCHEMAS: Record<string, z.ZodType> = {
  'exercise.v1.json': exerciseSchema,
  'animation.v1.json': animationSchema,
  'schedule.v1.json': scheduleV1Schema,
  'schedule.v2.json': scheduleV2Schema,
  'catalog.v1.json': catalogV1Schema,
  'catalog.v2.json': catalogV2Schema,
  'plan.v1.json': planFileSchema,
};

/** Renders one zod schema as the text of its JSON Schema file. */
export function renderJsonSchema(fileName: string, schema: z.ZodType): string {
  const { $schema, ...rest } = z.toJSONSchema(schema, { io: 'input', target: 'draft-2020-12' });
  const document = { $schema, $id: SCHEMA_BASE_URL + fileName, ...rest };
  return `${JSON.stringify(document, null, 2)}\n`;
}

async function readIfExists(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check');
  const stale: string[] = [];
  await mkdir(SCHEMA_DIR, { recursive: true });
  for (const [fileName, schema] of Object.entries(SCHEMAS)) {
    const file = path.join(SCHEMA_DIR, fileName);
    const expected = renderJsonSchema(fileName, schema);
    const actual = await readIfExists(file);
    if (actual === expected) continue;
    if (check) {
      stale.push(path.relative(process.cwd(), file));
    } else {
      await writeFile(file, expected);
      console.log(`wrote ${path.relative(process.cwd(), file)}`);
    }
  }
  if (stale.length > 0) {
    console.error('JSON Schema files are missing or stale; run `npm run generate:schema`:');
    for (const file of stale) console.error(`  ${file}`);
    process.exit(1);
  }
  if (check) console.log('JSON Schema files are up to date.');
}

await main();
