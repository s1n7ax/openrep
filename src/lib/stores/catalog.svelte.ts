/**
 * The exercise catalog as reactive state: loaded from the copy saved by the
 * last update or the one bundled with the app, searchable, and updated from
 * GitHub at launch (at most every 6 hours) or on request.
 */
import {
  BUNDLED_CATALOG_PATH,
  CATALOG_URL,
  downloadCatalog,
  exerciseImageUrl,
  loadSavedCatalog,
  saveCatalog,
} from '../catalog/source.ts';
import {
  chooseCatalog,
  evaluateDownloadedCatalog,
  isUpdateCheckDue,
  parseCatalog,
  type CatalogUpdateResult,
} from '../catalog/update.ts';
import { capacitorFiles } from '../persistence/capacitorFiles.ts';
import type { TextFiles } from '../persistence/files.ts';
import type { Animation } from '../schema/animation.ts';
import type { Catalog } from '../schema/catalog.ts';
import type { Exercise } from '../schema/exercise.ts';
import type { Schedule } from '../schema/schedule.ts';
import { createSearchIndex, type SearchIndex } from '../search.ts';
import { setCatalogMeta } from '../userData/settings.ts';
import { userData } from './userData.svelte.ts';

/** How long a catalog download may take before it counts as offline. */
const DOWNLOAD_TIMEOUT_MS = 30_000;

/** The bundled catalog could not be fetched. */
export class BundledCatalogUnavailableError extends Error {
  override name = 'BundledCatalogUnavailableError';
}

/** Lookups derived from one catalog, replaced together when the catalog changes. */
interface CatalogView {
  catalog: Catalog;
  exercises: Map<string, Exercise>;
  animations: Map<string, Animation>;
  schedules: Map<string, Schedule>;
  index: SearchIndex<Exercise>;
}

function viewOf(catalog: Catalog): CatalogView {
  const animations = new Map(
    catalog.animations.map((animation) => [animation.exerciseId, animation]),
  );
  return {
    catalog,
    exercises: new Map(catalog.exercises.map((exercise) => [exercise.id, exercise])),
    animations,
    schedules: new Map(catalog.schedules.map((schedule) => [schedule.id, schedule])),
    index: createSearchIndex(catalog.exercises, (exercise) => ({
      name: exercise.name,
      aliases: exercise.aliases,
      animated: animations.has(exercise.id),
    })),
  };
}

/**
 * Fetches the catalog bundled with the app.
 *
 * @throws {BundledCatalogUnavailableError} when it cannot be fetched or parsed.
 */
async function fetchBundledCatalog(): Promise<Catalog> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${BUNDLED_CATALOG_PATH}`);
    if (!response.ok) throw new BundledCatalogUnavailableError(`HTTP ${response.status}`);
    return parseCatalog(await response.text());
  } catch (error) {
    console.error('The bundled catalog could not be loaded:', error);
    if (error instanceof BundledCatalogUnavailableError) throw error;
    throw new BundledCatalogUnavailableError('The bundled catalog could not be loaded', {
      cause: error,
    });
  }
}

class CatalogStore {
  #view = $state.raw<CatalogView | null>(null);
  #status = $state<'loading' | 'ready' | 'error'>('loading');
  #source = $state<'bundled' | 'saved'>('bundled');
  #checking = $state(false);
  #lastResult = $state.raw<CatalogUpdateResult | null>(null);
  /** Image paths shipped inside the app; other images load from GitHub. */
  #bundledImages = $state.raw<ReadonlySet<string>>(new Set());
  #files: TextFiles = capacitorFiles;
  #loading: Promise<void> | null = null;
  #check: Promise<CatalogUpdateResult> | null = null;

  get status(): 'loading' | 'ready' | 'error' {
    return this.#status;
  }

  /** The catalog in use; null until loaded. */
  get catalog(): Catalog | null {
    return this.#view?.catalog ?? null;
  }

  /** Whether the catalog in use is the bundled one or one saved by an update. */
  get source(): 'bundled' | 'saved' {
    return this.#source;
  }

  /** Whether an update check is running. */
  get checking(): boolean {
    return this.#checking;
  }

  /** Result of the last update check this session, or null. */
  get lastResult(): CatalogUpdateResult | null {
    return this.#lastResult;
  }

  get exercises(): readonly Exercise[] {
    return this.#view?.catalog.exercises ?? [];
  }

  get schedules(): readonly Schedule[] {
    return this.#view?.catalog.schedules ?? [];
  }

  exercise(id: string): Exercise | undefined {
    return this.#view?.exercises.get(id);
  }

  /** The exercise's animation, or null when it has none (still figure). */
  animation(exerciseId: string): Animation | null {
    return this.#view?.animations.get(exerciseId) ?? null;
  }

  isAnimated(exerciseId: string): boolean {
    return this.#view?.animations.has(exerciseId) ?? false;
  }

  schedule(id: string): Schedule | undefined {
    return this.#view?.schedules.get(id);
  }

  /** Exercises matching `query` (names and aliases) that pass `filter`, best first. */
  search(query: string, filter?: (exercise: Exercise) => boolean): Exercise[] {
    return this.#view?.index.search(query, filter) ?? [];
  }

  /** URL of an exercise image path such as `images/pushups/0.webp`. */
  imageUrl(imagePath: string): string {
    return exerciseImageUrl(imagePath, this.#bundledImages, import.meta.env.BASE_URL);
  }

  /** Loads the saved or bundled catalog once; later calls return the same promise. */
  load(files: TextFiles = capacitorFiles): Promise<void> {
    this.#files = files;
    this.#loading ??= this.#load();
    return this.#loading;
  }

  async #load(): Promise<void> {
    const [saved, bundled] = await Promise.all([
      loadSavedCatalog(this.#files),
      fetchBundledCatalog().catch(() => null),
    ]);
    if (bundled) {
      this.#bundledImages = new Set(bundled.exercises.flatMap((exercise) => exercise.images));
    }
    const chosen = chooseCatalog(saved, bundled);
    if (!chosen) {
      this.#status = 'error';
      return;
    }
    this.#view = viewOf(chosen.catalog);
    this.#source = chosen.source;
    this.#status = 'ready';
  }

  /**
   * The launch check: runs `checkForUpdate` when the last check is 6 hours old
   * or more. Call after user data and the catalog are loaded.
   */
  async checkOnLaunch(): Promise<CatalogUpdateResult | null> {
    this.recordRevision();
    if (!isUpdateCheckDue(userData.data.catalogMeta.lastCheckedAt, new Date())) return null;
    return this.checkForUpdate();
  }

  /**
   * Downloads the remote catalog and switches to it when it is accepted (see
   * `evaluateDownloadedCatalog`). A check already running is joined. The
   * result is also kept in `lastResult`. Never rejects.
   */
  checkForUpdate(): Promise<CatalogUpdateResult> {
    this.#check ??= this.#runCheck().finally(() => {
      this.#check = null;
    });
    return this.#check;
  }

  async #runCheck(): Promise<CatalogUpdateResult> {
    this.#checking = true;
    try {
      const result = await this.#download();
      this.#lastResult = result;
      return result;
    } finally {
      this.#checking = false;
    }
  }

  async #download(): Promise<CatalogUpdateResult> {
    let download;
    try {
      download = await downloadCatalog(CATALOG_URL, DOWNLOAD_TIMEOUT_MS);
    } catch (error) {
      // fetch rejects without a connection (and on timeout): not an app error.
      console.info('Catalog update skipped, offline:', error);
      return { kind: 'offline' };
    }
    this.#recordCheck();
    if (!download.ok) {
      console.error(`Catalog update failed: HTTP ${download.status} from ${CATALOG_URL}`);
      return { kind: 'failed' };
    }
    const text = download.text;
    const decision = evaluateDownloadedCatalog(text, this.catalog);
    if (decision.kind !== 'accept') return decision;
    try {
      await saveCatalog(this.#files, text);
    } catch (error) {
      console.error('The downloaded catalog could not be saved:', error);
      return { kind: 'failed' };
    }
    this.#view = viewOf(decision.catalog);
    this.#source = 'saved';
    this.recordRevision();
    return { kind: 'updated', newExercises: decision.newExercises };
  }

  #recordCheck(): void {
    if (userData.status !== 'ready') return;
    userData.update((data) => setCatalogMeta(data, { lastCheckedAt: new Date().toISOString() }));
  }

  /**
   * Keeps `catalogMeta.revision` in user data in sync: the saved catalog's
   * revision, or null for the bundled one. Called at launch, after an update
   * and after a backup (possibly from another device) replaced user data.
   */
  recordRevision(): void {
    if (userData.status !== 'ready' || !this.catalog) return;
    const revision = this.#source === 'saved' ? this.catalog.revision : null;
    userData.update((data) => setCatalogMeta(data, { revision }));
  }
}

export const catalog = new CatalogStore();
