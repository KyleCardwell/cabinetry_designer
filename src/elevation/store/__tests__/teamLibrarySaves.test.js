import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../../model/doorStyles.js';
import { isElevationDocument, normalizeElevationDocument, toElevationDocument } from '../persistence.js';
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
  it('479. migrates applied picks in the team style and every room and phase scope', () => {
    const saved = normalizeElevationDocument(structuredClone(golden));
    const legacyStyle = (id, applied) => {
      const style = { ...structuredClone(DEFAULT_DOOR_STYLE), id, label: id };
      delete style.appliedMoldings;
      if (applied !== undefined) style.profiles.applied = applied;
      return style;
    };
    saved.settings.teamDoorStyle = { ...legacyStyle('default', 'am1'), label: 'Std' };
    saved.rooms[0].doorStyles = [legacyStyle('room', null), legacyStyle('missing')];
    saved.rooms[0].phases = [{ doorStyles: [legacyStyle('room-phase', 'am1')] }];
    saved.phases = [{
      doorStyles: [legacyStyle('phase', null)],
      rooms: [{ doorStyles: [legacyStyle('phase-room', 'am1')], phases: [{ doorStyles: [legacyStyle('nested')] }] }],
    }];
    const retained = [{ profileId: null, offset: -0.5 }, { profileId: 'x', offset: 2 }];
    saved.rooms[0].doorStyles.push({ ...legacyStyle('current', 'old'), appliedMoldings: retained });
    const original = structuredClone(saved);
    const loaded = normalizeElevationDocument(saved);
    const styles = [
      loaded.settings.teamDoorStyle,
      ...loaded.rooms[0].doorStyles,
      loaded.rooms[0].phases[0].doorStyles[0],
      loaded.phases[0].doorStyles[0],
      loaded.phases[0].rooms[0].doorStyles[0],
      loaded.phases[0].rooms[0].phases[0].doorStyles[0],
    ];
    expect(styles.map(({ appliedMoldings }) => appliedMoldings)).toEqual([
      [{ profileId: 'am1', offset: 0 }], [], [], retained,
      [{ profileId: 'am1', offset: 0 }], [], [{ profileId: 'am1', offset: 0 }], [],
    ]);
    expect(styles.every(({ profiles }) => !Object.hasOwn(profiles, 'applied'))).toBe(true);
    expect(styles[0].profiles).toEqual({ outside: null, inside: null, panel: null });
    expect(isElevationDocument(loaded)).toBe(true);
    expect(saved).toEqual(original);
    expect(normalizeElevationDocument(loaded)).toEqual(loaded);
  });

  it('479. round-trips the golden document with only the migrated molding keys changed', () => {
    const expected = normalizeElevationDocument(structuredClone(golden));
    const legacy = structuredClone(expected);
    delete legacy.settings.teamDoorStyle.appliedMoldings;
    legacy.settings.teamDoorStyle.profiles.applied = null;
    const loaded = normalizeElevationDocument(legacy);
    expect(loaded).toEqual(expected);
    expect(isElevationDocument(loaded)).toBe(true);
    const roundTrip = normalizeElevationDocument(JSON.parse(JSON.stringify(toElevationDocument(loaded))));
    expect(roundTrip).toEqual(expected);
    expect(isElevationDocument(roundTrip)).toBe(true);
  });

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
      copy.teamDoorStyle.appliedMoldings === DEFAULT_DOOR_STYLE.appliedMoldings,
      copy.doorDesigns === DOOR_DESIGNS,
      copy.doorDesigns[0].topRail === DOOR_DESIGNS[0].topRail,
    ]).toEqual([false, false, false, false, false]);
  });
});
