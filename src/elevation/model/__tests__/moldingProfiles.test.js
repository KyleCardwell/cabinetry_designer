import { readFileSync } from 'node:fs';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from '../constants.js';
import { bandDepths } from '../bandDepths.js';
import { moldingProfiles } from '../moldingProfiles.js';
import { crownOverlap, resolveProfile } from '../profile.js';
import { setProfileStretch } from '../profileEditing.js';
import {
  canStretch, defaultStretchY, isSectionProfileList, isStretchLine, PROFILE_KINDS,
  sectionProfileBounds, stretchLineProblem, stretchProfileGeometry,
} from '../sectionProfiles.js';

const { profiles } = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const tm3 = profiles.find(({ id }) => id === 'tm3');
const cr45 = profiles.find(({ id }) => id === 'cr45');
const settings = { ...DEFAULT_SETTINGS, sectionProfiles: profiles };
const picked = { ...DEFAULT_PROFILE, topMoldProfileId: 'tm3', crownProfileId: 'cr45' };
const codes = (result) => result.warnings.map(({ code }) => code);

describe('SPEC-50.2 molding profile model', () => {
  it('grows and shrinks top mold only above the line, refusing a too-short target (anchor 1)', () => {
    const before = structuredClone(tm3);
    for (const target of [8, 2]) {
      expect(stretchProfileGeometry(tm3, target)).toEqual({
        ...tm3.geometry,
        points: { ...tm3.geometry.points, f: [-0.125, target], c: [-1.5, target] },
      });
    }
    expect(stretchProfileGeometry(tm3, 1.5)).toBeNull();
    expect(stretchProfileGeometry(tm3, NaN)).toBeNull();
    const onLine = structuredClone(tm3);
    onLine.geometry.points.on = [0, 1.5];
    expect(stretchProfileGeometry(onLine, 8).points.on).toEqual([0, 1.5]);
    expect(tm3).toEqual(before);
  });

  it('stretches profiles read from an Immer draft, as reducers do on resize', () => {
    const expected = stretchProfileGeometry(tm3, 8);
    let stretched;
    produce({ settings }, (draft) => {
      const draftTm3 = draft.settings.sectionProfiles.find(({ id }) => id === 'tm3');
      stretched = stretchProfileGeometry(draftTm3, 8);
      expect(resolveProfile(draft.settings, null, null)).toBeTruthy();
    });
    expect(stretched).toEqual(expected);
  });

  it('defaults to half top-mold height, checks range at save, and limits stretch kinds (anchor 2)', () => {
    expect(defaultStretchY(tm3)).toBe(1.5);
    const draft = setProfileStretch(tm3, 3);
    expect(draft.stretch).toEqual({ y: 3 });
    expect(stretchLineProblem(draft)).toBe('range');
    expect(setProfileStretch(cr45, -1)).toBeNull();
    expect(Object.keys(PROFILE_KINDS).filter(canStretch))
      .toEqual(['door_outside', 'door_inside', 'door_panel', 'applied_molding', 'top_mold']);
    expect(isSectionProfileList(profiles)).toBe(true);
    expect(PROFILE_KINDS.top_mold.origin)
      .toBe('its front face, at its bottom (placed at the box top, past the faces by the top mold overhang)');
    expect(PROFILE_KINDS.crown.origin)
      .toBe("its back, at its top (placed on the top mold's face, at the top of crown line)");
  });

  it('mirrors arc crossing checks and moves upper arc centers with their endpoints', () => {
    const arc = {
      ...tm3,
      geometry: {
        units: 'in', points: { a: [0.25, 0], b: [0, 0.25], c: [0, 3] },
        loops: [{ id: 'L1', closed: false, segs: [
          { type: 'arc', from: 'a', to: 'b', center: [0.25, 0.25], ccw: false },
          { type: 'line', from: 'b', to: 'c' },
        ] }],
      },
      drawnPoints: { elevation: [] },
    };
    expect(isStretchLine(arc, 0.125)).toBe(false);
    expect(isStretchLine(arc, 0.25)).toBe(false);
    expect(stretchLineProblem(setProfileStretch(arc, 0.125))).toBe('arc');
    arc.geometry.loops[0].segs[0].ccw = true;
    expect(isStretchLine(arc, 0.375)).toBe(false);
    expect(isStretchLine(arc, 0.5)).toBe(false);
    expect(isStretchLine(arc, 0.625)).toBe(true);
    Object.assign(arc.geometry.points, { d: [0.25, 2.5], e: [0, 2.75], on: [0, 1.5] });
    arc.geometry.loops.push({ id: 'L2', closed: false, segs: [
      { type: 'arc', from: 'd', to: 'e', center: [0.25, 2.75], ccw: false },
    ] });
    const stretched = stretchProfileGeometry(arc, 4);
    expect(stretched.loops[0]).toEqual(arc.geometry.loops[0]);
    expect(stretched.loops[1].segs[0].center).toEqual([0.25, 3.75]);
    expect(stretched.points.on).toEqual([0, 1.5]);
    expect(sectionProfileBounds({ geometry: stretched }).maxY).toBe(4);
    const tied = structuredClone(tm3);
    tied.geometry.points.f[1] = 3.0625;
    tied.geometry.points.c[1] = 3.0625;
    expect(defaultStretchY(tied)).toBe(1.5625);
  });

  it('resolves the default picked molding heights and overlap without warnings (anchor 3)', () => {
    const result = moldingProfiles(picked, settings);
    expect(result).toEqual({
      overhang: 0.25,
      topMold: { profile: tm3, geometry: tm3.geometry, height: 3 },
      crown: { profile: cr45, geometry: cr45.geometry, height: 4.5 },
      warnings: [],
    });
    const resolved = resolveProfile(settings, { profile: { ...picked, crownHeight: 9 } }, {});
    expect(resolved.crownHeight).toBe(4.5);
    expect(crownOverlap(resolved)).toBe(1.5);
  });

  it('draws too-short top mold unstretched and reports a gap from typed heights (anchor 4)', () => {
    const result = moldingProfiles({ ...picked, topMoldHeight: 1 }, settings);
    expect(codes(result)).toEqual(['top-mold-too-short', 'crown-gap']);
    expect(result.topMold.geometry).toBe(tm3.geometry);
    expect(result.topMold.height).toBe(1);
    const resolved = resolveProfile(settings, { profile: { ...picked, topMoldHeight: 1 } }, {});
    expect(crownOverlap(resolved)).toBe(-0.5);
    expect(resolved.topMoldHeight).toBe(1);
  });

  it('warns when top mold is above crown total without changing the typed height (anchor 5)', () => {
    const result = moldingProfiles({ ...picked, topMoldHeight: 7 }, settings);
    expect(codes(result)).toEqual(['top-mold-above-crown']);
    expect(result.topMold.height).toBe(7);
    expect(result.topMold.geometry.points.f).toEqual([-0.125, 7]);
  });

  it('ignores missing and wrong-kind picks, keeping typed heights and warning order (anchor 6)', () => {
    for (const crownProfileId of ['nope', 'tm3']) {
      const profile = { ...picked, crownProfileId };
      const result = moldingProfiles(profile, settings);
      expect(codes(result)).toEqual(['molding-profile-missing']);
      expect(result.crown).toBeNull();
      expect(resolveProfile(settings, { profile }, {}).crownHeight).toBe(4.5);
    }
    expect(codes(moldingProfiles({ ...picked, crownProfileId: 'nope', topMoldHeight: 1 }, settings)))
      .toEqual(['molding-profile-missing', 'top-mold-too-short', 'crown-gap']);
    expect(codes(moldingProfiles({ ...picked, topMoldProfileId: 'cr45', crownProfileId: 'tm3' }, settings)))
      .toEqual(['molding-profile-missing', 'molding-profile-missing']);
    expect(moldingProfiles(DEFAULT_PROFILE, settings)).toEqual({
      overhang: 0.25, topMold: null, crown: null, warnings: [],
    });
  });

  it('merges saved defaults, inherits picks and overhang, resolves archived and fixed-height profiles', () => {
    expect(DEFAULT_SETTINGS.bandDepths).not.toHaveProperty('topMoldProjection');
    expect(bandDepths({ bandDepths: { topMoldProjection: 2 } }).topMoldProjection).toBe(0.25);
    const plain = setProfileStretch(tm3, null);
    const using = {
      ...settings, defaultProfile: { topMoldProfileId: 'tm3', crownProfileId: 'cr45', topMoldOverhang: 0.5 },
      sectionProfiles: [plain, { ...cr45, archived: true }],
    };
    expect(resolveProfile({ defaultProfile: {} }, {}, {})).toEqual(DEFAULT_PROFILE);
    const resolved = resolveProfile(using, { profile: { topMoldHeight: 8, crownHeight: 9, topMoldOverhang: 0 } }, {});
    expect(resolved).toMatchObject({ topMoldHeight: 3, crownHeight: 4.5, topMoldOverhang: 0 });
    expect(moldingProfiles(resolved, using)).toMatchObject({
      topMold: { geometry: plain.geometry, height: 3 }, crown: { height: 4.5 }, warnings: [],
    });
    const cleared = resolveProfile(using, { profile: { topMoldOverhang: 0 } }, {
      profile: { crownProfileId: null, topMoldProfileId: null, topMoldHeight: 8, topMoldOverhang: 0.125 },
    });
    expect(cleared).toMatchObject({
      crownProfileId: null, topMoldProfileId: null, crownHeight: 4.5, topMoldHeight: 8, topMoldOverhang: 0.125,
    });
    expect(moldingProfiles(cleared, using).topMold).toBeNull();
  });
});
