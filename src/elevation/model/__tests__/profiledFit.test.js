import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { auto, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { faceEdgeProfiled } from '../doorStyleResolve.js';
import { runFaceLayouts } from '../faceLayouts.js';
import { findLeaf } from '../cellTree.js';
import { resolveWall, syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const PROFILED = {
  ...DEFAULT_DOOR_STYLE,
  profiles: { ...DEFAULT_DOOR_STYLE.profiles, outside: 'p-edge' },
};
const S = { ...DEFAULT_SETTINGS, teamDoorStyle: PROFILED };
const RUN = '860a1197-d14f-4fc2-9499-2d44cd1d8fa3';
const CAB = 'b736ca24-6df8-41d5-88bc-416dbd85eab3';
const square = [[78.25, 5.75, 16.25, 27], [94.5, 5.75, 16.25, 27]];
const profiled = [[78.3125, 5.84375, 16.125, 26.8125], [94.5625, 5.84375, 16.125, 26.8125]];
const rects = (faces) => faces.map(({ x, z, width, height }) => [x, z, width, height]);

function golden(settings = document.settings, change = () => {}) {
  const r = structuredClone(document.rooms.find(({ name }) => name === 'G2 Face frame kitchen'));
  const w = r.walls[0];
  const target = w.runs.find(({ id }) => id === RUN);
  change(r, target);
  const synced = syncRoom(r, settings);
  const view = resolveWall(synced, synced.walls[0], 'front');
  return runFaceLayouts(synced, view, view.runs.find(({ id }) => id === RUN), settings);
}

function stacked(face, settings = S, cabinetStyleId = 14, extra = {}, roomOverrides = {}) {
  const target = run({
    x: 24, width: 24, autoCount: false,
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    items: [{ ...auto('a'), face }], ...extra,
  });
  const w = wall({ runs: [target] });
  const r = room({ walls: [w], style: { cabinetStyleId }, ...roomOverrides });
  return runFaceLayouts(r, resolveWall(r, w), target, settings).get('a');
}

describe('FX4 c2 per-face profiled fit', () => {
  it('anchor 1: golden square pair fills its opening', () => {
    expect(rects(golden().get(CAB).faces)).toEqual(square);
  });

  it('anchor 2: the team outside profile fits both pair halves', () => {
    expect(rects(golden({ ...document.settings, teamDoorStyle: PROFILED }).get(CAB).faces)).toEqual(profiled);
  });

  it('anchor 3: the opening stays at its square dimensions', () => {
    const layout = golden({ ...document.settings, teamDoorStyle: PROFILED }).get(CAB);
    expect(rects(layout.openings)).toEqual([[78.25, 5.75, 32.5, 27]]);
    expect(layout.openings).toEqual(golden().get(CAB).openings);
  });

  it('anchor 4: a cabinet doorStyleId profiles only that cabinet', () => {
    const before = golden();
    const after = golden(document.settings, (r, target) => {
      r.doorStyles = [{ ...PROFILED, id: 'profiled' }];
      findLeaf(target.grid, CAB).doorStyleId = 'profiled';
    });
    expect(rects(after.get(CAB).faces)).toEqual(profiled);
    for (const [id, layout] of after) {
      if (id !== CAB) expect(layout.faces).toEqual(before.get(id).faces);
    }
  });

  it('anchor 5: a square drawer fills its slot above a profiled door', () => {
    const face = { direction: 'vertical', children: [
      { type: 'drawer_front', size: 6 }, { type: 'door', size: null },
    ] };
    const entry = stacked(face, DEFAULT_SETTINGS);
    const actual = stacked(face, DEFAULT_SETTINGS, 14,
      { doorStyleId: 'profiled', drawerFrontStyleId: 'default' },
      { doorStyles: [{ ...PROFILED, id: 'profiled' }] });
    expect(rects(actual.faces)).toEqual([[24.75, 27, 22.5, 6], [24.84375, 5.59375, 22.3125, 19.8125]]);
    expect(actual.openings).toEqual(entry.openings);
  });

  it('anchor 6: the short-face rule uses the profiled size even when the square size reaches slabBelow', () => {
    const entry = stacked({ direction: 'vertical', children: [
      { type: 'drawer_front', size: 4.8125 }, { type: 'door', size: null },
    ] });
    expect(rects(entry.faces)).toEqual([
      [24.75, 28.1875, 22.5, 4.8125], [24.84375, 5.59375, 22.3125, 21],
    ]);
  });

  it('anchor 8: outside profiles leave every G1 Euro face unchanged', () => {
    const r = document.rooms.find(({ name }) => name === 'G1 Euro kitchen');
    for (const w of r.walls) {
      const view = resolveWall(r, w, 'front');
      for (const target of view.runs) {
        const before = runFaceLayouts(r, view, target, document.settings);
        const after = runFaceLayouts(r, view, target, { ...document.settings, teamDoorStyle: PROFILED });
        expect(after).toEqual(before);
      }
    }
  });

  it('profiles inset and beaded faces for five-piece, hardwood and MDF designs, even with missing profile ids', () => {
    for (const designId of [DEFAULT_DOOR_STYLE.designId, 'slab', 'slab-mdf']) {
      const settings = { ...S, teamDoorStyle: { ...PROFILED, designId } };
      for (const cabinetStyleId of [14, 15]) {
        const entry = stacked({ type: 'drawer_front', size: null }, settings, cabinetStyleId);
        const [opening] = entry.openings;
        expect(entry.faces[0]).toMatchObject({ x: opening.x + 3 / 32, width: opening.width - 3 / 16 });
      }
      expect(faceEdgeProfiled({}, {}, {}, {}, { type: 'drawer_front' },
        { x: 0, z: 0, width: 20, height: 3 }, settings)).toBe(designId !== DEFAULT_DOOR_STYLE.designId);
    }
    expect(faceEdgeProfiled({}, {}, {}, {}, { type: 'open' },
      { x: 0, z: 0, width: 20, height: 20 }, S)).toBe(false);
    expect(stacked({ type: 'open', size: null }).faces[0]).toMatchObject({ x: 24.75, width: 22.5 });
  });

  it('uses the outside molding core height for the short-face check, as partDetail does', () => {
    const settings = { ...S, sectionProfiles: [{
      id: 'p-edge', name: 'Edge molding', kind: 'door_outside',
      geometry: { units: 'in', points: { a: [-0.25, 0], b: [0, 0], c: [0, -0.75], d: [-0.25, -0.75] },
        loops: [{ id: 'loop', closed: true, segs: [
          { type: 'line', from: 'a', to: 'b' }, { type: 'line', from: 'b', to: 'c' },
          { type: 'line', from: 'c', to: 'd' }, { type: 'line', from: 'd', to: 'a' },
        ] }] },
    }] };
    const entry = stacked({ direction: 'vertical', children: [
      { type: 'drawer_front', size: 5.25 }, { type: 'door', size: null },
    ] }, settings);
    expect(entry.faces[0]).toMatchObject({ x: 24.75, height: 5.25 });
    expect(entry.faces[1]).toMatchObject({ x: 24.84375 });
  });

  it('keeps a shared seam gap when either neighbor is profiled and closes square seams', () => {
    const entry = stacked({ direction: 'vertical', noRail: [0, 1], children: [
      { type: 'drawer_front', size: 4 }, { type: 'drawer_front', size: 4 }, { type: 'door', size: null },
    ] });
    const [top, middle, bottom] = entry.faces;
    expect(top.x).toBe(24.75);
    expect(middle.x).toBe(24.75);
    expect(top.z - middle.z - middle.height).toBe(0);
    expect(middle.z - bottom.z - bottom.height).toBe(1 / 16);
    expect(bottom.x).toBe(24.84375);
    expect(rects(entry.openings)).toEqual([[24.75, 5.5, 22.5, 27.5]]);
  });
});
