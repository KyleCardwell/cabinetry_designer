import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { PLAN_TOP_DIM_MIN, planTopOverhangs } from '../planTops.js';
import { syncRoom } from '../room.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const wood = { top: 'wood', autoCount: false,
  ends: { left: { type: 'none' }, right: { type: 'none' } } };
const island = room({ walls: [wall({ id: 'island', x2: 96, thickness: 4.5, runs: [
  run({ ...wood, id: 'front', width: 96, items: [auto('cabinet')] }),
  run({ ...wood, id: 'back', width: 96, depth: 0.75, wallSide: 'back',
    items: [{ ...auto('back-panel'), kind: 'panel', depth: 0.75, align: 'back' }] }),
] })] });
const stored9b = JSON.parse(readFileSync(new URL('./fixtures/room9b.json', import.meta.url), 'utf8'));
const settings9b = { ...DEFAULT_SETTINGS, ...stored9b.settingsOverrides };
const room9b = syncRoom(structuredClone(stored9b), settings9b);

describe('PT1 step d plan top overhangs', () => {
  const base = room({ walls: [wall({ runs: [run({ ...wood, x: 24, width: 60,
    topOverhang: { front: 12 }, items: [auto('cabinet')],
  })] })] });

  it('anchor 1: measures a 12 inch front overhang at the top rectangle midpoint', () => {
    expect(planTopOverhangs(base, settings)).toEqual([{
      wallId: 'wall-1', runId: 'run-1', side: 'front', edge: 'front', value: 12,
      from: [54, 24.875], to: [54, 36.875],
    }]);
  });

  it('anchor 2: omits 3 inch overhangs, including the 1e-6 threshold tolerance', () => {
    expect(PLAN_TOP_DIM_MIN).toBe(3);
    const input = structuredClone(base);
    for (const value of [3, 3.0000005, 3.000002]) {
      input.walls[0].runs[0].topOverhang.front = value;
      expect(planTopOverhangs(input, settings)).toHaveLength(value > 3.000001 ? 1 : 0);
    }
  });

  it('anchor 3: shifts the front midpoint for a 6 inch right overhang and dimensions that edge', () => {
    const input = structuredClone(base);
    input.walls[0].runs[0].topOverhang.right = 6;
    expect(planTopOverhangs(input, settings)).toEqual([
      { wallId: 'wall-1', runId: 'run-1', side: 'front', edge: 'front', value: 12,
        from: [56.625, 24.875], to: [56.625, 36.875] },
      { wallId: 'wall-1', runId: 'run-1', side: 'front', edge: 'right', value: 6,
        from: [84, 18.4375], to: [90, 18.4375] },
    ]);
  });

  it('anchor 4: Room 9b has no overhang dimensions', () => {
    expect(planTopOverhangs(room9b, settings9b)).toEqual([]);
  });

  it('anchor 5: mirrors the island back overhang into the front frame', () => {
    const input = structuredClone(island);
    input.walls[0].runs[1].topOverhang = { front: 12 };
    expect(planTopOverhangs(input, settings)).toEqual([{
      wallId: 'island', runId: 'back', side: 'back', edge: 'front', value: 12,
      from: [48, -5.25], to: [48, -17.25],
    }]);
  });

  it('measures all four stone edges square to the rectangle and omits runs without tops', () => {
    const input = structuredClone(base);
    Object.assign(input.walls[0].runs[0], { top: 'stone',
      topOverhang: { front: 12, back: 4, left: 5, right: 6 } });
    expect(planTopOverhangs(input, settings).map(({ edge, value, from, to }) => ({ edge, value, from, to })))
      .toEqual([
        { edge: 'front', value: 12, from: [54.5, 24.875], to: [54.5, 36.875] },
        { edge: 'back', value: 4, from: [54.5, 0], to: [54.5, -4] },
        { edge: 'left', value: 5, from: [24, 16.4375], to: [19, 16.4375] },
        { edge: 'right', value: 6, from: [84, 16.4375], to: [90, 16.4375] },
      ]);
    input.walls[0].runs[0].top = 'none';
    expect(planTopOverhangs(input, settings)).toEqual([]);
  });

  it('omits insert segments and edges whose top rectangle does not reach past the run', () => {
    const input = structuredClone(base);
    const target = input.walls[0].runs[0];
    target.topOverhang = { front: 12, left: 5, right: 0 };
    // An insert covering the last column leaves a main top which never reaches the run's right edge.
    Object.assign(target, run({ ...target, items: [fixed('A', 30), fixed('B', 30)],
      topSegments: [{ id: 'insert', from: 'B', to: 'B', kind: 'stone', drop: 2, mode: 'box' }],
    }));
    expect(planTopOverhangs(input, settings).map(({ edge }) => edge)).toEqual(['front', 'left']);
    target.topSegments[0].from = 'A';
    target.topOverhang.left = 0;
    expect(planTopOverhangs(input, settings)).toEqual([]);
    target.topSegments = [];
    target.outset = 2;
    target.topOverhang.back = 4;
    // The top starts at -2, so it cannot dimension a full 4 inches behind the wall face.
    expect(planTopOverhangs(input, settings).map(({ edge }) => edge)).toEqual(['front']);
  });
});
