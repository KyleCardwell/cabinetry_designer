import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../../model/doorStyles.js';
import { isElevationDocument, normalizeElevationDocument } from '../persistence.js';
import { copySettings } from '../slices/helpers.js';

const golden = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/golden.json', import.meta.url), 'utf8'));
const ARCHED = {
  id: 'd-114',
  code: '114',
  vendor: 'Stillwater',
  description: 'Arched top rail',
  construction: 'five_piece',
  topRail: { shape: 'arch' },
  bottomRail: { shape: 'flat' },
  slots: ['outside', 'inside', 'panel', 'applied'],
};

/** The golden document as saved before 46.3: `doorThickness` in settings (or none), no library. */
function older(doorThickness) {
  const document = structuredClone(golden);
  delete document.settings.teamDoorStyle;
  delete document.settings.doorDesigns;
  if (doorThickness === undefined) delete document.settings.doorThickness;
  else document.settings.doorThickness = doorThickness;
  return document;
}

describe('SPEC-46.3 saving the team library in settings', () => {
  it('moves an older document\'s door thickness into the team default style and seeds the designs', () => {
    const loaded = normalizeElevationDocument(older(1));
    expect(loaded.settings.teamDoorStyle).toEqual({ ...DEFAULT_DOOR_STYLE, thickness: 1 });
    expect(loaded.settings.doorDesigns).toEqual(DOOR_DESIGNS);
    expect(loaded.settings.doorDesigns).not.toBe(DOOR_DESIGNS);
    expect('doorThickness' in loaded.settings).toBe(false);
    expect(isElevationDocument(loaded)).toBe(true);
    expect([
      normalizeElevationDocument(older(undefined)).settings.teamDoorStyle,
      normalizeElevationDocument(older('thick')).settings.teamDoorStyle,
    ]).toEqual([DEFAULT_DOOR_STYLE, DEFAULT_DOOR_STYLE]);
  });

  it('keeps a saved library and drops a stray doorThickness', () => {
    const saved = older(1);
    saved.settings.teamDoorStyle = { ...DEFAULT_DOOR_STYLE, thickness: 0.75, designId: 'd-114' };
    saved.settings.doorDesigns = [...DOOR_DESIGNS, ARCHED];
    const loaded = normalizeElevationDocument(saved);
    expect([loaded.settings.teamDoorStyle.thickness, loaded.settings.doorDesigns.length, 'doorThickness' in loaded.settings])
      .toEqual([0.75, 4, false]);
    expect(isElevationDocument(loaded)).toBe(true);
  });

  it('rejects a broken team style or design list', () => {
    const valid = (patch) => {
      const loaded = normalizeElevationDocument(older(undefined));
      Object.assign(loaded.settings, patch);
      return isElevationDocument(loaded);
    };
    expect([
      valid({}),
      valid({ teamDoorStyle: { ...DEFAULT_DOOR_STYLE, id: 'ds-a' } }),
      valid({ teamDoorStyle: { ...DEFAULT_DOOR_STYLE, thickness: 0 } }),
      valid({ teamDoorStyle: { ...DEFAULT_DOOR_STYLE, designId: 'gone' } }),
      valid({ doorDesigns: DOOR_DESIGNS.slice(1) }),
      valid({ doorDesigns: [...DOOR_DESIGNS, { ...ARCHED, code: '5pc' }] }),
    ]).toEqual([true, false, false, false, false, false]);
  });

  it('copies the library into the state so it never shares objects with the defaults', () => {
    const copy = copySettings(DEFAULT_SETTINGS);
    expect([copy.teamDoorStyle, copy.doorDesigns]).toEqual([DEFAULT_DOOR_STYLE, DOOR_DESIGNS]);
    expect([
      copy.teamDoorStyle === DEFAULT_DOOR_STYLE,
      copy.teamDoorStyle.stiles === DEFAULT_DOOR_STYLE.stiles,
      copy.doorDesigns === DOOR_DESIGNS,
      copy.doorDesigns[0].topRail === DOOR_DESIGNS[0].topRail,
    ]).toEqual([false, false, false, false]);
  });
});
