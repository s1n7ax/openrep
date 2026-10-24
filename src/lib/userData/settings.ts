/**
 * Pure updates of settings and catalog bookkeeping (see `plans.ts` for the conventions).
 */
import type { CatalogMeta, Unit, UserData } from '../schema/userData.ts';

export function setUnit(data: UserData, unit: Unit): UserData {
  return data.settings.unit === unit ? data : { ...data, settings: { ...data.settings, unit } };
}

/** Sets the rest a countdown runs for when the plan gives none, in whole seconds. */
export function setDefaultRest(data: UserData, defaultRestSec: number): UserData {
  return data.settings.defaultRestSec === defaultRestSec
    ? data
    : { ...data, settings: { ...data.settings, defaultRestSec } };
}

export function setCatalogMeta(data: UserData, patch: Partial<CatalogMeta>): UserData {
  const catalogMeta = { ...data.catalogMeta, ...patch };
  return catalogMeta.lastCheckedAt === data.catalogMeta.lastCheckedAt &&
    catalogMeta.revision === data.catalogMeta.revision
    ? data
    : { ...data, catalogMeta };
}
