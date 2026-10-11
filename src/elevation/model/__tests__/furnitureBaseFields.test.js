import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveProfile } from '../profile.js';
import {
  canStretch, defaultStretchY, isSectionProfile, isSectionProfileDraft, isStretchLine,
  stretchLineProblem, stretchProfileGeometry,
} from '../sectionProfiles.js';
import { setProfileStretch } from '../profileEditing.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const fb4 = sample.profiles.find(({ id }) => id === 'fb4');

describe('SPEC-50.5 furniture base fields', () => {
  it('resolves defaults and inherited fields while explicit null clears the profile pick (anchors 1–2)', () => {
    expect(resolveProfile({}, {}, {})).toMatchObject({
      baseKind: 'toe_kick', furnitureBaseProud: 0.8125, furnitureBaseProfileId: null,
    });
    const settings = { defaultProfile: { furnitureBaseProud: 1, furnitureBaseProfileId: 'team' } };
    const room = { profile: { baseKind: 'furniture_base', furnitureBaseProfileId: 'fb4' } };
    expect(resolveProfile(settings, room, { profile: { furnitureBaseProfileId: null } })).toMatchObject({
      baseKind: 'furniture_base', furnitureBaseProud: 1, furnitureBaseProfileId: null,
    });
    expect(resolveProfile(settings, room, { profile: {
      baseKind: null, furnitureBaseProud: null, furnitureBaseProfileId: undefined,
    } })).toMatchObject({
      baseKind: 'furniture_base', furnitureBaseProud: 1, furnitureBaseProfileId: 'fb4',
    });
    expect(resolveProfile(settings, room, { profile: {
      baseKind: 'toe_kick', furnitureBaseProud: 0,
    } })).toMatchObject({ baseKind: 'toe_kick', furnitureBaseProud: 0 });
  });

  it('stretches furniture bases downward and validates draft lines like doors (anchors 3–4)', () => {
    const before = structuredClone(fb4);
    expect(canStretch('furniture_base')).toBe(true);
    expect(isSectionProfile(fb4)).toBe(true);
    expect(defaultStretchY(fb4)).toBe(-2);
    expect(stretchProfileGeometry(fb4, -6)).toEqual({
      ...fb4.geometry,
      points: { ...fb4.geometry.points, d: [0, -6], e: [-0.8125, -6] },
    });
    expect(stretchProfileGeometry(fb4, -1.5)).toBeNull();
    expect(stretchProfileGeometry(fb4, -2)).toBeNull();
    const plain = setProfileStretch(fb4, null);
    expect(stretchProfileGeometry(plain, -6)).toBe(plain.geometry);
    expect(setProfileStretch(plain, defaultStretchY(plain))).toEqual(fb4);
    expect(isStretchLine(fb4, -2)).toBe(true);
    for (const y of [0, -4]) {
      const draft = setProfileStretch(fb4, y);
      expect(isSectionProfileDraft(draft)).toBe(true);
      expect(isSectionProfile(draft)).toBe(false);
      expect(stretchLineProblem(draft)).toBe('range');
    }
    const arced = structuredClone(fb4);
    arced.geometry.loops[0].segs[1] = {
      type: 'arc', from: 'b', to: 'c', center: [-0.3125, -0.3125], ccw: false,
    };
    expect(isStretchLine(arced, -0.125)).toBe(false);
    expect(stretchLineProblem(setProfileStretch(arced, -0.125))).toBe('arc');
    expect(stretchLineProblem(fb4)).toBeNull();
    expect(fb4).toEqual(before);
  });
});
