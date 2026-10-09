import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newSectionProfile } from '../sectionProfiles.js';
import { mirrorProfile, rotateProfile } from '../profileEditing.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [COVE, BEAD, CROWN] = sample.profiles;
const SQUARE = newSectionProfile([], 'sp-sq');
const withPoints = (profile, points) => ({ ...profile, geometry: { ...profile.geometry, points } });

describe('SPEC-48.1.1 rotating and flipping a profile', () => {
  it('turns a profile a quarter turn at a time about 0, 0; arcs keep their direction', () => {
    expect(rotateProfile(SQUARE, 1))
      .toEqual(withPoints(SQUARE, { p1: [0, 0], p2: [0, 0.75], p3: [0.75, 0.75], p4: [0.75, 0] }));
    expect(rotateProfile(SQUARE, -1))
      .toEqual(withPoints(SQUARE, { p1: [0, 0], p2: [0, -0.75], p3: [-0.75, -0.75], p4: [-0.75, 0] }));
    expect(rotateProfile(SQUARE, 3)).toEqual(rotateProfile(SQUARE, -1));
    expect([rotateProfile(SQUARE, 0), rotateProfile(SQUARE, 4)]).toEqual([SQUARE, SQUARE]);
    const cove = rotateProfile(COVE, 1);
    expect(cove.geometry.points).toEqual({ a: [0, 0], b: [0, 0.5], c: [0.25, 0.75], d: [0.8125, 0.75], e: [0.8125, 0] });
    expect(cove.geometry.loops[0].segs[1]).toEqual({ type: 'arc', from: 'b', to: 'c', center: [0.25, 0.5], ccw: false });
    expect({ ...cove, geometry: COVE.geometry }).toEqual(COVE);
    expect(rotateProfile(COVE, 2).geometry.loops[0].segs[1].center).toEqual([-0.5, 0.25]);
  });

  it('flips a profile left-right or up-down about 0, 0; arcs change direction', () => {
    const cove = mirrorProfile(COVE, 'x');
    expect(cove.geometry.points).toEqual({ a: [0, 0], b: [-0.5, 0], c: [-0.75, -0.25], d: [-0.75, -0.8125], e: [0, -0.8125] });
    expect(cove.geometry.loops[0].segs[1]).toEqual({ type: 'arc', from: 'b', to: 'c', center: [-0.5, -0.25], ccw: true });
    expect({ ...cove, geometry: COVE.geometry }).toEqual(COVE);
    expect(mirrorProfile(CROWN, 'y').geometry.points)
      .toEqual({ c1: [0, 0], c2: [0, -4.5], c3: [3, -4.5], c4: [3, -3.75], c5: [0.5, 0] });
    expect(mirrorProfile(BEAD, 'y').geometry.loops[0].segs[0])
      .toEqual({ type: 'arc', from: 's', to: 't', center: [0.25, 0], ccw: true });
    expect(mirrorProfile(mirrorProfile(COVE, 'x'), 'x')).toEqual(COVE);
  });

  it('refuses a turn that is not a whole number and an unknown flip', () => {
    expect([
      rotateProfile(COVE, 1.5), rotateProfile(COVE, '1'), rotateProfile(COVE, Number.NaN),
      mirrorProfile(COVE, 'z'), mirrorProfile(COVE),
    ]).toEqual([null, null, null, null, null]);
    expect(COVE.geometry.points.b).toEqual([0.5, 0]);
  });
});
