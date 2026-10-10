import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../doorStyles.js';
import { doorSection } from '../doorSection.js';
import { profileDoorGhost } from '../profileGhost.js';
import { isProfileGeometry } from '../sectionProfiles.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [, BEAD, CROWN] = sample.profiles;
const [FIVE, SLAB, SLAB_AM] = DOOR_DESIGNS;
const line = (from, to) => ({ type: 'line', from, to });
const ROUND = {
  id: 'sp-round', name: 'Round 1/4', kind: 'door_outside', version: 1, archived: false, drawnPoints: { elevation: [] },
  geometry: {
    units: 'in',
    points: { a: [0.25, 0], b: [0, -0.25], c: [0, -0.8125] },
    loops: [{ id: 'L1', closed: false, segs: [{ type: 'arc', from: 'a', to: 'b', center: [0.25, -0.25], ccw: true }, line('b', 'c')] }],
  },
};
const STEP = {
  id: 'sp-step', name: 'Step', kind: 'door_inside', version: 1, archived: true, drawnPoints: { elevation: [] },
  geometry: {
    units: 'in',
    points: { p: [-0.25, 0], q: [-0.25, -0.125], r: [0, -0.125] },
    loops: [{ id: 'L1', closed: false, segs: [line('p', 'q'), line('q', 'r')] }],
  },
};
const BEAD5 = {
  id: 'sp-bead5', name: 'Flush bead 5/16', kind: 'door_outside', stretch: { y: -0.25 },
  geometry: {
    units: 'in',
    points: { a: [-0.3125, 0], q: [-0.0625, 0], b: [0, 0], c: [0, -0.8125], d: [-0.3125, -0.8125] },
    loops: [{ id: 'L1', closed: true, segs: [line('a', 'q'), line('q', 'b'), line('b', 'c'), line('c', 'd'), line('d', 'a')] }],
  },
};
const STICK2 = {
  id: 'sp-stick2', name: 'Stick 1/4', kind: 'door_inside', stretch: { y: -0.28125 },
  geometry: {
    units: 'in', points: { s1: [-0.25, 0], s2: [0, -0.25], s3: [0, -0.3125] },
    loops: [{ id: 'L1', closed: false, segs: [line('s1', 's2'), line('s2', 's3')] }],
  },
};
const LIBRARY = [ROUND, STEP, BEAD, CROWN];
const picks = (profiles) => ({ ...DEFAULT_DOOR_STYLE, profiles: { outside: null, inside: null, panel: null, applied: null, ...profiles } });

describe('SPEC-48.4 the door style half section', () => {
  it('is the outside-edge door ghost for a 5-piece style with nothing picked', () => {
    expect(doorSection(DEFAULT_DOOR_STYLE, FIVE, LIBRARY)).toEqual({
      units: 'in', body: profileDoorGhost('door_outside', DEFAULT_DOOR_STYLE), placed: [], cuts: [], skipped: [],
    });
  });

  it('stretches outside to the back and inside to the panel face, then cuts the stretched geometry', () => {
    const style = { ...picks({ outside: BEAD5.id, inside: STICK2.id }), thickness: 1, panel: { thickness: 0.25 } };
    const section = doorSection(style, FIVE, [BEAD5, STICK2]);
    expect(section.placed[0].geometry.points).toEqual({
      a: [-0.3125, 0], q: [-0.0625, 0], b: [0, 0], c: [0, -1], d: [-0.3125, -1],
    });
    expect(section.placed[1].geometry.points).toEqual({ s1: [2.75, 0], s2: [3, -0.25], s3: [3, -0.75] });
    expect(section.cuts).toEqual([{ slot: 'inside', geometry: {
      units: 'in', points: { s1: [2.75, 0], s2: [3, -0.25], s3: [3, -0.75], _e: [3, 0] },
      loops: [{ id: 'L1', closed: true, segs: [line('s1', 's2'), line('s2', 's3'), line('s3', '_e'), line('_e', 's1')] }],
    } }]);
    const panel = { ...STICK2, id: 'panel', kind: 'door_panel' };
    const applied = { ...STICK2, id: 'applied', kind: 'applied_molding' };
    const all = doorSection({ ...style, profiles: { ...style.profiles, panel: panel.id, applied: applied.id } }, FIVE,
      [BEAD5, STICK2, panel, applied]);
    expect(all.placed.map(({ geometry }) => Object.values(geometry.points).at(-1)[1])).toEqual([-1, -0.75, -1, -1]);
    expect(doorSection({ ...style, thickness: 0.75 }, FIVE, [BEAD5, STICK2]).placed[0].geometry.points.c).toEqual([0, -0.75]);
    expect(BEAD5.geometry.points.c).toEqual([0, -0.8125]);
    expect(STICK2.geometry.points.s3).toEqual([0, -0.3125]);
  });

  it('keeps the default inside depth and places too-thin profiles and their cuts unstretched', () => {
    const style = picks({ inside: STICK2.id });
    expect(doorSection(style, FIVE, [STICK2]).placed[0].geometry.points.s3).toEqual([3, -0.3125]);
    const thin = doorSection({ ...style, thickness: 0.75 }, FIVE, [STICK2]);
    expect(thin.placed[0].geometry.points).toEqual({ s1: [2.75, 0], s2: [3, -0.25], s3: [3, -0.3125] });
    expect(thin.cuts[0].geometry.points.s3).toEqual([3, -0.3125]);
    const outside = doorSection({ ...picks({ outside: BEAD5.id }), thickness: 0.25 }, SLAB, [BEAD5]);
    expect(outside.placed[0].geometry).toEqual(BEAD5.geometry);
  });

  it('places each pick on its line, cuts open lines back to the face, and skips picks that don\'t fit', () => {
    const section = doorSection(picks({ outside: 'sp-round', inside: 'sp-step', panel: 'gone', applied: 'sp-bead' }), FIVE, LIBRARY);
    expect(section.placed).toEqual([
      { slot: 'outside', profileId: 'sp-round', name: 'Round 1/4', geometry: ROUND.geometry },
      {
        slot: 'inside', profileId: 'sp-step', name: 'Step',
        geometry: { ...STEP.geometry, points: { p: [2.75, 0], q: [2.75, -0.125], r: [3, -0.125] } },
      },
      {
        slot: 'applied', profileId: 'sp-bead', name: 'Half bead',
        geometry: {
          units: 'in',
          points: { s: [3, 0], t: [3.5, 0] },
          loops: [{ id: 'L1', closed: true, segs: [{ type: 'arc', from: 's', to: 't', center: [3.25, 0], ccw: false }, line('t', 's')] }],
        },
      },
    ]);
    expect(section.cuts).toEqual([
      {
        slot: 'outside',
        geometry: {
          units: 'in',
          points: { a: [0.25, 0], b: [0, -0.25], c: [0, -0.8125], _e: [0, 0] },
          loops: [{
            id: 'L1', closed: true,
            segs: [{ type: 'arc', from: 'a', to: 'b', center: [0.25, -0.25], ccw: true }, line('b', 'c'), line('c', '_e'), line('_e', 'a')],
          }],
        },
      },
      {
        slot: 'inside',
        geometry: {
          units: 'in',
          points: { p: [2.75, 0], q: [2.75, -0.125], r: [3, -0.125], _e: [3, 0] },
          loops: [{ id: 'L1', closed: true, segs: [line('p', 'q'), line('q', 'r'), line('r', '_e'), line('_e', 'p')] }],
        },
      },
    ]);
    expect(section.cuts.map(({ geometry }) => isProfileGeometry(geometry))).toEqual([true, true]);
    expect(section.skipped).toEqual(['panel']);
    expect(doorSection(picks({ inside: 'sp-crown', applied: 'sp-round' }), FIVE, LIBRARY).skipped).toEqual(['inside', 'applied']);
    expect(STEP.geometry.points.p).toEqual([-0.25, 0]);
  });

  it('draws a slab, puts slab-applied molding at the inset, and has no section when it can\'t draw one', () => {
    const slab = doorSection(picks({ outside: 'sp-round', inside: 'sp-step', applied: 'sp-bead' }), SLAB, LIBRARY);
    expect(slab.body).toEqual({
      units: 'in',
      points: { b1: [0, 0], b2: [3, 0], b3: [3, -0.8125], b4: [0, -0.8125] },
      loops: [{ id: 'slab', closed: true, segs: [line('b1', 'b2'), line('b2', 'b3'), line('b3', 'b4'), line('b4', 'b1')] }],
    });
    expect([slab.placed.map(({ slot }) => slot), slab.cuts.map(({ slot }) => slot), slab.skipped]).toEqual([['outside'], ['outside'], []]);
    const molded = doorSection({ ...picks({ applied: 'sp-bead' }), thickness: 0.75, stiles: { left: 2, right: 2 } }, SLAB_AM, LIBRARY);
    expect([molded.body.points.b2, molded.body.points.b3, molded.placed[0].geometry.points, molded.placed[0].geometry.loops[0].segs[0].center])
      .toEqual([[5, 0], [5, -0.75], { s: [2, 0], t: [2.5, 0] }, [2.25, 0]]);
    expect([
      doorSection({ ...DEFAULT_DOOR_STYLE, thickness: 0.5 }, FIVE, LIBRARY),
      doorSection({ ...DEFAULT_DOOR_STYLE, thickness: 0 }, SLAB, LIBRARY),
      doorSection(DEFAULT_DOOR_STYLE, null, LIBRARY),
      doorSection({ ...DEFAULT_DOOR_STYLE, stiles: { left: 0, right: 3 } }, SLAB_AM, LIBRARY),
    ]).toEqual([null, null, null, null]);
  });
});
