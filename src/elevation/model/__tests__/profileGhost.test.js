import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { profileDoorGhost } from '../profileGhost.js';
import { PROFILE_KINDS, isProfileGeometry } from '../sectionProfiles.js';

const line = (from, to) => ({ type: 'line', from, to });

describe('SPEC-48.2 the door ghost and what 0, 0 means', () => {
  it('draws the stile and 3" of panel with the panel opening at 0, 0 for inside, panel and applied kinds', () => {
    const ghost = profileDoorGhost('door_inside', DEFAULT_DOOR_STYLE);
    expect(ghost).toEqual({
      units: 'in',
      points: {
        s1: [-3, 0], s2: [0, 0], s3: [0, -0.3125], s4: [-0.5, -0.3125],
        s5: [-0.5, -0.5625], s6: [0, -0.5625], s7: [0, -0.8125], s8: [-3, -0.8125],
        p1: [-0.5, -0.3125], p2: [3, -0.3125], p3: [3, -0.8125], p4: [0.625, -0.8125],
        p5: [0.25, -0.5625], p6: [-0.5, -0.5625],
      },
      loops: [
        {
          id: 'stile',
          closed: true,
          segs: [
            line('s1', 's2'), line('s2', 's3'), line('s3', 's4'), line('s4', 's5'),
            line('s5', 's6'), line('s6', 's7'), line('s7', 's8'), line('s8', 's1'),
          ],
        },
        {
          id: 'panel',
          closed: true,
          segs: [
            line('p1', 'p2'), line('p2', 'p3'), line('p3', 'p4'),
            { type: 'arc', from: 'p4', to: 'p5', center: [0.25, -0.96875], ccw: true },
            line('p5', 'p6'), line('p6', 'p1'),
          ],
        },
      ],
    });
    expect(isProfileGeometry(ghost)).toBe(true);
    expect([profileDoorGhost('door_panel', DEFAULT_DOOR_STYLE), profileDoorGhost('applied_molding', DEFAULT_DOOR_STYLE)])
      .toEqual([ghost, ghost]);
  });

  it('puts the door\'s outside edge at 0, 0 for an outside edge, follows thickness and stile, and has no ghost otherwise', () => {
    const outside = profileDoorGhost('door_outside', DEFAULT_DOOR_STYLE);
    expect([outside.points.s1, outside.points.s2, outside.points.p2, outside.points.p4, outside.loops[1].segs[3].center])
      .toEqual([[0, 0], [3, 0], [6, -0.3125], [3.625, -0.8125], [3.25, -0.96875]]);
    expect(isProfileGeometry(outside)).toBe(true);
    const thick = profileDoorGhost('door_inside', { ...DEFAULT_DOOR_STYLE, thickness: 1, stiles: { left: 2.5, right: 2.5 } });
    expect([
      thick.points.s1, thick.points.s3, thick.points.s5, thick.points.s8, thick.points.p3, thick.points.p5,
      thick.loops[1].segs[3].center,
    ]).toEqual([[-2.5, 0], [0, -0.5], [-0.5, -0.75], [-2.5, -1], [3, -1], [0.25, -0.75], [0.25, -1.15625]]);
    expect(isProfileGeometry(thick)).toBe(true);
    expect([
      profileDoorGhost('crown', DEFAULT_DOOR_STYLE),
      profileDoorGhost('other', DEFAULT_DOOR_STYLE),
      profileDoorGhost('toString', DEFAULT_DOOR_STYLE),
      profileDoorGhost('door_inside', { ...DEFAULT_DOOR_STYLE, thickness: 0.5 }),
      profileDoorGhost('door_inside', { ...DEFAULT_DOOR_STYLE, stiles: { left: 0.5, right: 3 } }),
      profileDoorGhost('door_inside', null),
    ]).toEqual([null, null, null, null, null, null]);
  });

  it('says what 0, 0 means for each kind', () => {
    expect(Object.fromEntries(Object.entries(PROFILE_KINDS).map(([kind, { origin }]) => [kind, origin]))).toEqual({
      door_outside: "the door's outside edge, at the front face",
      door_inside: 'the edge of the panel opening, at the front face',
      door_panel: 'the edge of the panel opening, at the front face',
      applied_molding: 'the line the molding is applied along, at the front face',
      crown: 'the front face of the box, at the top of the box',
      top_mold: 'the front face of the box, at the top of the box',
      furniture_base: 'the front face of the box, at the floor',
      toe_kick: "the toe kick's face, at the floor",
      nosing: 'the front edge of the part, at its top',
      other: null,
    });
  });
});
