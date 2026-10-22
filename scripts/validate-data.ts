/**
 * Checks every exercise, animation and schedule file of the data directory.
 * Prints one line per problem (file and reason) and exits 1 if there is any.
 *
 * Usage: `npm run validate:data [-- --data <dir>]` (default: `data/`).
 */
import path from 'node:path';
import { parseArgs } from 'node:util';
import { validateData } from '../src/lib/data/validate';
import { readDataDir } from './lib/data-dir';
import { DATA_DIR } from './lib/paths';

const { values } = parseArgs({ options: { data: { type: 'string' } } });
const dataDir = path.resolve(values.data ?? DATA_DIR);

const { issues, data } = validateData(await readDataDir(dataDir));

if (issues.length > 0) {
  for (const issue of issues) {
    console.error(
      `${path.relative(process.cwd(), path.join(dataDir, issue.file))}: ${issue.message}`,
    );
  }
  console.error(`\n${issues.length} problem(s) found.`);
  process.exit(1);
}

console.log(
  `Data is valid: ${data.exercises.length} exercises, ${data.animations.length} animations, ` +
    `${data.schedules.length} schedules.`,
);
