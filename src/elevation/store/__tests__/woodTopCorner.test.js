import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { isElevationDocument, normalizeElevationDocument, toElevationDocument } from '../persistence.js';

const golden = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/golden.json', import.meta.url), 'utf8'));

it('PT2 a anchor 8: accepts missing, miter and butt settings and defaults older saves to miter', () => {
  const saved = normalizeElevationDocument(golden);
  delete saved.settings.woodTopCorner;
  expect(isElevationDocument(saved)).toBe(true);
  expect(normalizeElevationDocument(saved).settings.woodTopCorner).toBe('miter');
  for (const pick of ['miter', 'butt']) {
    saved.settings.woodTopCorner = pick;
    expect(isElevationDocument(saved)).toBe(true);
    const reloaded = normalizeElevationDocument(toElevationDocument(saved));
    expect(reloaded.settings.woodTopCorner).toBe(pick);
    saved.rooms[0].settingsOverrides = { woodTopCorner: pick };
    expect(isElevationDocument(saved)).toBe(true);
    expect(normalizeElevationDocument(toElevationDocument(saved)).rooms[0].settingsOverrides)
      .toEqual({ woodTopCorner: pick });
  }
  for (const invalid of ['cope', '', null, false, 90]) {
    saved.rooms[0].settingsOverrides = {};
    saved.settings.woodTopCorner = invalid;
    expect(isElevationDocument(saved)).toBe(false);
    saved.settings.woodTopCorner = 'miter';
    saved.rooms[0].settingsOverrides = { woodTopCorner: invalid };
    expect(isElevationDocument(saved)).toBe(false);
  }
});
