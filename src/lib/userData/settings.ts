/**
 * Pure updates of settings and catalog bookkeeping (see `plans.ts` for the conventions).
 */
import type { CatalogMeta, Unit, UserData } from '../schema/userData.ts';

export function setUnit(data: UserData, unit: Unit): UserData {
  return data.settings.unit === unit ? data : { ...data, settings: { ...data.settings, unit } };
}

export function setCatalogMeta(data: UserData, patch: Partial<CatalogMeta>): UserData {
  const catalogMeta = { ...data.catalogMeta, ...patch };
  return catalogMeta.lastCheckedAt === data.catalogMeta.lastCheckedAt &&
    catalogMeta.revision === data.catalogMeta.revision
    ? data
    : { ...data, catalogMeta };
}
