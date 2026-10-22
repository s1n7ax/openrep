/**
 * Builds the catalog: `<out>/catalog.json` (every exercise, animation and
 * schedule) plus the exercise images under `<out>/images/`. With `--json-only`
 * only `catalog.json` is written (what the publish workflow serves).
 *
 * Usage: `npm run build:catalog -- --out <dir> [--data <dir>] [--json-only]`
 */
import path from 'node:path';
import { parseArgs } from 'node:util';
import { InvalidDataError, loadCatalog, writeCatalog } from './lib/catalog.ts';
import { DATA_DIR } from './lib/paths.ts';

const { values } = parseArgs({
  options: {
    out: { type: 'string' },
    data: { type: 'string' },
    'json-only': { type: 'boolean', default: false },
  },
});
if (values.out === undefined) {
  console.error('Usage: npm run build:catalog -- --out <dir> [--data <dir>] [--json-only]');
  process.exit(2);
}
const outDir = path.resolve(values.out);
const dataDir = path.resolve(values.data ?? DATA_DIR);

try {
  const catalog = await loadCatalog(dataDir);
  await writeCatalog(catalog, dataDir, outDir, { images: !values['json-only'] });
  console.log(
    `Wrote ${path.relative(process.cwd(), path.join(outDir, 'catalog.json'))} ` +
      `(revision ${catalog.revision.slice(0, 12)}): ${catalog.exercises.length} exercises, ` +
      `${catalog.animations.length} animations, ${catalog.schedules.length} schedules.`,
  );
} catch (error) {
  if (!(error instanceof InvalidDataError)) throw error;
  console.error(error.message);
  process.exit(1);
}
