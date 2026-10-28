import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { planTopPoints, planTops } from '../planTops.js';
import { syncRoom } from '../room.js';
import { isStoneTop } from '../tops.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const wood = { top: 'wood', autoCount: false,
  ends: { left: { type: 'none' }, right: { type: 'none' } } };
const island = room({ walls: [wall({ id: 'island', x2: 96, thickness: 4.5, runs: [
  run({ ...wood, id: 'front', width: 96, items: [auto('cabinet')] }),
  run({ ...wood, id: 'back', width: 96, depth: 0.75, wallSide: 'back',
    items: [{ ...auto('back-panel'), kind: 'panel', depth: 0.75, align: 'back' }] }),
] })] });
const touching = room({ walls: [wall({ id: 'w', runs: [
  run({ ...wood, id: 'left', x: 10, width: 30, items: [auto('L')] }),
  run({ ...wood, id: 'right', x: 40, width: 30, depth: 12, items: [auto('R')] }),
] })] });
const stored9b = JSON.parse(readFileSync(new URL('./fixtures/room9b.json', import.meta.url), 'utf8'));
const settings9b = { ...DEFAULT_SETTINGS, ...stored9b.settingsOverrides };
const room9b = syncRoom(structuredClone(stored9b), settings9b);
const wall4 = room9b.walls.find(({ name }) => name === 'Wall 4');
const outline9b = [[18.8125, -1.5625], [79.75, -1.5625], [79.75, 25.625], [18.8125, 25.625]];

// Compare cyclic boundaries from their lowest-u, lowest-v corner.
function canonical(loop) {
  const first = loop.reduce((best, point, i) => point[0] < loop[best][0]
    || (point[0] === loop[best][0] && point[1] < loop[best][1]) ? i : best, 0);
  return [...loop.slice(first), ...loop.slice(0, first)];
}

describe('PT1 step a plan top outlines', () => {
  it('anchor 1: bridges Room 9b front and back tops on Wall 4 only', () => {
    const result = planTops(room9b, settings9b);
    expect(result.map(({ wallId }) => wallId)).toEqual([wall4.id]);
    expect(result[0].loops.map(canonical)).toEqual([outline9b]);
    expect(Object.keys(result[0])).toEqual(['wallId', 'loops']);
  });

  it('anchor 2: maps the Room 9b outline to plan inches, y up', () => {
    const [outline] = planTops(room9b, settings9b)[0].loops;
    expect(planTopPoints(room9b, wall4, canonical(outline))).toEqual([
      [8.5625, 20.6875], [8.5625, -40.25], [-18.625, -40.25], [-18.625, 20.6875],
    ]);
  });

  it('anchor 3: removes the bridge when the Room 9b back run has no top', () => {
    const stored = structuredClone(stored9b);
    stored.walls.find(({ id }) => id === wall4.id).runs.find(({ wallSide }) => wallSide === 'back').top = 'none';
    const result = planTops(syncRoom(stored, settings9b), settings9b);
    expect(result).toHaveLength(1);
    expect(result[0].loops.map(canonical)).toEqual([
      [[18.8125, 0], [79.75, 0], [79.75, 25.625], [18.8125, 25.625]],
    ]);
  });

  it('anchor 4: bridges matching front and back tops across a 4 1/2 inch wall', () => {
    expect(planTops(island, settings)).toEqual([{ wallId: 'island', loops: [
      [[-0.75, -6], [96.75, -6], [96.75, 25.625], [-0.75, 25.625]],
    ] }]);
  });

  it('anchor 5: keeps opposite tops at different heights separate', () => {
    const stored = structuredClone(island);
    stored.walls[0].runs[1].z -= 0.5;
    expect(planTops(stored, settings)[0].loops.map(canonical)).toEqual([
      [[-0.75, 0], [96.75, 0], [96.75, 25.625], [-0.75, 25.625]],
      [[-0.75, -6], [96.75, -6], [96.75, -4.5], [-0.75, -4.5]],
    ]);
  });

  it('anchor 6: unions overlapping overhangs into a stepped boundary', () => {
    expect(planTops(touching, settings)).toEqual([{ wallId: 'w', loops: [
      [[9.25, 0], [70.75, 0], [70.75, 13.625], [40.75, 13.625], [40.75, 25.625], [9.25, 25.625]],
    ] }]);
  });

  it('anchor 7: omits walls without tops', () => {
    expect(planTops(room(), settings)).toEqual([]);
    expect(planTops(room({ walls: [wall({ runs: [run({ top: 'none', items: [auto('C')] })] })] }), settings)).toEqual([]);
  });

  it('anchor 8: includes stone tops on every golden G1 counter wall', () => {
    const document = normalizeElevationDocument(
      JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
    );
    const g1 = syncRoom(document.rooms.find(({ name }) => name === 'G1 Euro kitchen'), document.settings);
    const counterWalls = g1.walls.filter(({ runs }) => runs.some(isStoneTop));
    expect(counterWalls.length).toBeGreaterThan(0);
    const result = planTops(g1, document.settings);
    for (const wall of counterWalls) {
      expect(result.find(({ wallId }) => wallId === wall.id)?.loops.length).toBeGreaterThan(0);
    }
  });

  it('snaps near-touching spans to 1/1024 inch before unioning', () => {
    const stored = structuredClone(touching);
    const [left, right] = stored.walls[0].runs;
    left.topOverhang = { left: 0, right: 0 };
    right.topOverhang = { left: 0, right: 0 };
    right.x += 0.0004;
    expect(planTops(stored, settings)[0].loops.map(canonical)).toEqual([
      [[10, 0], [70, 0], [70, 13.625], [40, 13.625], [40, 25.625], [10, 25.625]],
    ]);
    right.x += 0.0002;
    expect(planTops(stored, settings)[0].loops).toHaveLength(2);
  });

  it('matches top surfaces within 1e-6 without snapping heights', () => {
    const stored = structuredClone(island);
    const back = stored.walls[0].runs[1];
    back.height -= 0.5;
    back.overrides.countertopThickness = 2;
    back.z += 0.0000005;
    expect(planTops(stored, settings)[0].loops).toHaveLength(1);
    back.z += 0.000002;
    expect(planTops(stored, settings)[0].loops).toHaveLength(2);
  });

  it('includes top segments and merges segments with the same surface', () => {
    const stored = room({ walls: [wall({ runs: [run({ ...wood, width: 90,
      items: [fixed('A', 30), fixed('B', 30), fixed('C', 30)],
      topSegments: [{ id: 'insert', from: 'B', to: 'B', kind: 'stone', drop: 2, mode: 'box' }],
    })] })] });
    expect(planTops(stored, settings)[0].loops.map(canonical)).toEqual([
      [[-0.75, 0], [90.75, 0], [90.75, 25.625], [-0.75, 25.625]],
    ]);
  });

  it('keeps walls separate in room.walls order, independent of wallOrder', () => {
    const stored = room({ wallOrder: ['second', 'empty', 'first'], walls: [
      wall({ id: 'first', runs: [run({ ...wood, items: [auto('A')] })] }),
      wall({ id: 'empty' }),
      wall({ id: 'second', y1: 60, y2: 60, runs: [run({ ...wood, items: [auto('B')] })] }),
    ] });
    expect(planTops(stored, settings).map(({ wallId }) => wallId)).toEqual(['first', 'second']);
  });

  it('mirrors asymmetric back spans and bridges only their overlap', () => {
    const stored = structuredClone(island);
    stored.walls[0].runs[0].width = 40;
    Object.assign(stored.walls[0].runs[1], { x: 50, width: 30 });
    expect(planTops(stored, settings)[0].loops.map(canonical)).toEqual([
      [[-0.75, 0], [15.25, 0], [15.25, -6], [46.75, -6], [46.75, -4.5],
        [40.75, -4.5], [40.75, 25.625], [-0.75, 25.625]],
    ]);
  });

  it('keeps a hole as a separate closed boundary and removes collinear vertices', () => {
    const stored = room({ walls: [wall({ runs: [
      [0, 30, 0, 10], [0, 10, 10, 20], [20, 30, 10, 20], [0, 30, 20, 30],
    ].map(([u0, u1, v0, v1], i) => run({ ...wood, id: `r${i}`, x: u0, width: u1 - u0,
      depth: v1 - v0, outset: v0, topOverhang: { left: 0, right: 0, front: 0, back: 0 },
      items: [{ ...auto(`panel${i}`), kind: 'panel', depth: v1 - v0, align: 'back' }],
    })) })] });
    expect(planTops(stored, settings)[0].loops.map(canonical)).toEqual([
      [[0, 0], [30, 0], [30, 30], [0, 30]],
      [[10, 10], [10, 20], [20, 20], [20, 10]],
    ]);
  });

  it('keeps point-touching rectangles in separate loops', () => {
    const stored = room({ walls: [wall({ runs: [0, 10].map((offset) => run({ ...wood,
      id: `r${offset}`, x: offset, width: 10, depth: 10, outset: offset,
      topOverhang: { left: 0, right: 0, front: 0, back: 0 },
      items: [{ ...auto(`panel${offset}`), kind: 'panel', depth: 10, align: 'back' }],
    })) })] });
    expect(planTops(stored, settings)[0].loops.map(canonical)).toEqual([
      [[0, 0], [10, 0], [10, 10], [0, 10]],
      [[10, 10], [20, 10], [20, 20], [10, 20]],
    ]);
  });

  it('requires more than 1e-6 of front/back overlap to bridge the wall', () => {
    const stored = structuredClone(island);
    const [front, back] = stored.walls[0].runs;
    front.width = 30;
    Object.assign(back, { x: 36, width: 30 });
    front.topOverhang = back.topOverhang = { left: 0, right: 0 };
    expect(planTops(stored, settings)[0].loops).toHaveLength(2);
    back.x += 0.0000005;
    expect(planTops(stored, settings)[0].loops).toHaveLength(2);
    back.x += 1;
    expect(planTops(stored, settings)[0].loops).toHaveLength(1);
  });
});
