import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { readDataDir } from '../../../scripts/lib/data-dir.ts';
import { catalogSchema } from '../schema/catalog.ts';
import { buildCatalog, canonicalJson, sha256Hex } from './buildCatalog.ts';
import { validateData, type ValidatedData } from './validate.ts';

const VALID = path.resolve(import.meta.dirname, '../../../tests/fixtures/data/valid');

let data: ValidatedData;

beforeAll(async () => {
  data = validateData(await readDataDir(VALID)).data;
});

describe('canonicalJson', () => {
  it('sorts object keys at every level and keeps array order', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}',
    );
  });
});

describe('sha256Hex', () => {
  it('matches the standard test vector', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('buildCatalog', () => {
  it('builds a valid v1 catalog sorted by id', async () => {
    const catalog = await buildCatalog(data, '2026-10-22T10:00:00.000Z');
    expect(catalogSchema.parse(catalog)).toEqual(catalog);
    expect(catalog.formatVersion).toBe(1);
    expect(catalog.generatedAt).toBe('2026-10-22T10:00:00.000Z');
    expect(catalog.exercises.map((e) => e.id)).toEqual(['sample-plank', 'sample-push-up']);
  });

  it('gives the same revision for the same content in any order, at any time', async () => {
    const a = await buildCatalog(data, '2026-10-22T10:00:00.000Z');
    const reordered: ValidatedData = {
      ...data,
      exercises: [...data.exercises].reverse().map((e) => {
        const { source, id, ...rest } = e;
        return { source, ...rest, id };
      }),
    };
    const b = await buildCatalog(reordered, '2027-01-01T00:00:00.000Z');
    expect(b.revision).toBe(a.revision);
  });

  it('changes the revision when the content changes', async () => {
    const a = await buildCatalog(data, '2026-10-22T10:00:00.000Z');
    const changed: ValidatedData = {
      ...data,
      exercises: data.exercises.map((e) => ({ ...e, aliases: [...e.aliases, 'new alias'] })),
    };
    const b = await buildCatalog(changed, '2026-10-22T10:00:00.000Z');
    expect(b.revision).not.toBe(a.revision);
  });
});
