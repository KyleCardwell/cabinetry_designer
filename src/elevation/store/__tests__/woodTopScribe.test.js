import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { isElevationDocument, normalizeElevationDocument, toElevationDocument } from '../persistence.js';

const golden = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/golden.json', import.meta.url), 'utf8'));

it('defaults wood top scribe on older saves and preserves explicit values', () => {
  const older = structuredClone(golden);
  const saved = normalizeElevationDocument(older);
  expect(older.settings.woodTopScribe).toBeUndefined();
  expect(saved.settings.woodTopScribe).toBe(0.5);
  expect(isElevationDocument(saved)).toBe(true);
  for (const scribe of [0, 1]) {
    saved.settings.woodTopScribe = scribe;
    const reloaded = normalizeElevationDocument(toElevationDocument(saved));
    expect(isElevationDocument(reloaded)).toBe(true);
    expect(reloaded.settings.woodTopScribe).toBe(scribe);
  }
  for (const invalid of [null, '0.5', NaN, Infinity]) {
    saved.settings.woodTopScribe = invalid;
    expect(isElevationDocument(saved)).toBe(false);
  }
});
