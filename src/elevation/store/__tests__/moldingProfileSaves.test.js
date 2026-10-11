import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { resolveProfile } from '../../model/profile.js';
import { isElevationDocument, normalizeElevationDocument, toElevationDocument } from '../persistence.js';

const golden = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/golden.json', import.meta.url), 'utf8'));

describe('SPEC-50.2 saved molding picks', () => {
  it('accepts older height profiles and round-trips nullable picks and overhang at every level', () => {
    const saved = normalizeElevationDocument(structuredClone(golden));
    expect(isElevationDocument(saved)).toBe(true);
    const room = saved.rooms[0];
    const wall = room.walls[0];
    expect(resolveProfile(saved.settings, room, wall)).toMatchObject({
      topMoldProfileId: null, crownProfileId: null, topMoldOverhang: 0.25,
    });
    Object.assign(saved.settings.defaultProfile, { topMoldProfileId: 'tm3', crownProfileId: 'missing', topMoldOverhang: 0.5 });
    Object.assign(room.profile, { topMoldProfileId: null, crownProfileId: 'cr45', topMoldOverhang: 0 });
    Object.assign(wall.profile, { topMoldProfileId: 'tm3', crownProfileId: null, topMoldOverhang: 0.125 });
    expect(isElevationDocument(saved)).toBe(true);
    expect(normalizeElevationDocument(toElevationDocument(saved))).toEqual(saved);
    Object.assign(saved.settings, { defaultProfile: { ...DEFAULT_SETTINGS.defaultProfile } });
    expect(isElevationDocument(saved)).toBe(true);
  });

  it('rejects malformed picks and overhang while permitting null wall height inheritance', () => {
    for (const level of ['team', 'room', 'wall']) {
      for (const patch of [
        { topMoldProfileId: 1 }, { crownProfileId: false }, { crownProfileId: '' },
        { topMoldOverhang: '0.25' }, { topMoldOverhang: NaN },
      ]) {
        const saved = normalizeElevationDocument(structuredClone(golden));
        const profile = level === 'team' ? saved.settings.defaultProfile
          : level === 'room' ? saved.rooms[0].profile : saved.rooms[0].walls[0].profile;
        Object.assign(profile, patch);
        expect(isElevationDocument(saved)).toBe(false);
      }
    }
    const saved = normalizeElevationDocument(structuredClone(golden));
    saved.rooms[0].walls[0].profile = { topMoldOverhang: null, crownHeight: null };
    expect(isElevationDocument(saved)).toBe(true);
  });
});
