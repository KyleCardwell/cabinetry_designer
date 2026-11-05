import { describe, expect, it } from 'vitest';
import { auto, fixed, pin, room, run, wall } from '../../../test/builders.js';
import { cellWidths, isWidthFromCells } from '../cellWidths.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun } from '../faceLayouts.js';
import { legPreset } from '../legs.js';
import { contentsWidth, lineEndMinimum, runFlexNeeds, runWidthRange, splitRun } from '../splitRun.js';
import { legShape } from './fixtures/legs.js';

const LEG = legShape();
const settings = { ...DEFAULT_SETTINGS, shapes: [LEG] };
const L = { id: 'lg-1', shapeId: LEG.id, from: 'left', x: 0, yFrom: 'front', y: 0, height: 'full' };
const R = run({
  x: 10, width: 36, autoCount: false,
  ends: { left: { type: 'none' }, right: { type: 'none' } },
  items: [auto('a')],
});
const W = wall({ runs: [R] });
const ROOM = room({ walls: [W] });

describe('SH7.1 step b layout inside legs', () => {
  it('anchor 1: preserves the current no-leg layout', () => {
    expect(layoutRun(ROOM, W, R, settings)).toMatchInlineSnapshot(`
      {
        "errors": [],
        "pieces": [
          {
            "auto": true,
            "cabinetTypeId": 1,
            "depth": 24,
            "height": 30.5,
            "id": "a",
            "kind": "cabinet",
            "role": "item",
            "width": 36,
            "x": 10,
            "z": 4,
          },
        ],
        "warnings": [],
      }
    `);
  });

  it('anchor 2: starts cabinets inside the left leg and keeps the right edge', () => {
    const result = layoutRun(ROOM, W, { ...R, legs: [L] }, settings);
    expect(result.pieces[0].x).toBe(13.5);
    const last = result.pieces.at(-1);
    expect(last.x + last.width).toBe(46);
    expect(result.errors).toEqual([]);
  });

  it('anchor 3: reserves one leg width at each end for four proud corners', () => {
    let id = 0;
    const legs = legPreset('four', { shapeId: LEG.id, proud: 0.5 }, () => `lg-${++id}`);
    const result = layoutRun(ROOM, W, { ...R, legs }, settings);
    expect(result.pieces[0].x).toBe(13.5);
    const last = result.pieces.at(-1);
    expect(last.x + last.width).toBe(42.5);
    expect(result.errors).toEqual([]);
  });

  it('anchor 4: preserves the layout for opted-out and non-overlapping legs', () => {
    const baseline = layoutRun(ROOM, W, R, settings);
    for (const changes of [{ takesRoom: false }, { y: 4 }]) {
      expect(layoutRun(ROOM, W, { ...R, legs: [{ ...L, ...changes }] }, settings)).toEqual(baseline);
    }
  });

  it('anchor 5: places the end panel inside the leg, before the cabinet', () => {
    const result = layoutRun(ROOM, W, {
      ...R, legs: [L], ends: { ...R.ends, left: { type: 'end_panel', width: 13 / 16 } },
    }, settings);
    expect(result.pieces[0]).toMatchObject({ kind: 'end_panel', x: 13.5, width: 13 / 16 });
    expect(result.pieces[1]).toMatchObject({ kind: 'cabinet', x: 14.3125 });
    expect(result.errors).toEqual([]);
  });

  it('anchor 6: keeps the full free-end frame gap inside the leg', () => {
    const framed = { ...R, _frame: { thickness: 13 / 16, drop: 0, bead: 0.125 } };
    const baseline = layoutRun(ROOM, W, framed, settings);
    const gap = baseline.pieces[0].x - R.x;
    expect(gap).toBe(DEFAULT_SETTINGS.insetFrame.stile + 0.125);
    const result = layoutRun(ROOM, W, { ...framed, legs: [L] }, settings);
    expect(result.pieces[0].x).toBe(13.5 + gap);
    const last = result.pieces.at(-1);
    expect(last.x + last.width).toBe(R.x + R.width - gap);
  });

  it('anchor 7: reports the same constraint as a 32 1/2-inch run for a fixed 36-inch cabinet', () => {
    const fixedRun = run({ ...R, items: [fixed('a', 36)] });
    const baseline = layoutRun(ROOM, W, { ...fixedRun, width: 32.5 }, settings);
    expect(baseline.errors).toEqual([{ code: 'over-constrained' }]);
    const result = layoutRun(ROOM, W, { ...fixedRun, legs: [L] }, settings);
    expect(result.errors).toEqual(baseline.errors);
    expect(result.warnings).toEqual(baseline.warnings);
    expect(result.pieces[0]).toMatchObject({ x: 13.5, width: 36 });
  });

  it('anchor 8: includes leg room in contents width, width range and run flex', () => {
    const current = run({ ...R, widthFrom: 'cells', legs: [L], items: [fixed('a', 30)] });
    const currentWall = wall({ runs: [current] });
    const currentRoom = room({ walls: [currentWall] });
    expect(isWidthFromCells(current, currentWall)).toBe(true);
    expect(contentsWidth(current, settings)).toBe(33.5);
    expect(runWidthRange(current, settings)).toEqual({ min: 33.5, max: 33.5 });
    expect(cellWidths(currentRoom, settings).walls[0].runs[0]).toMatchObject({ x: 10, width: 33.5 });
    expect(runFlexNeeds(current, settings)).toEqual([
      { key: 'run', edges: ['left', 'right'], candidates: [-2.5], box: null },
    ]);
  });

  it('includes leg room outside the frame gap in both line end minimums', () => {
    const current = run({
      ...R, items: [auto('a'), fixed('b', 12), auto('c')],
      _frame: { thickness: 13 / 16, drop: 0, bead: 0.125 },
      legs: [L, { ...L, id: 'lg-2', from: 'right' }],
    });
    for (const side of ['left', 'right']) {
      const minimum = DEFAULT_SETTINGS.minCabinetWidth + DEFAULT_SETTINGS.insetFrame.stile + 0.125;
      expect(lineEndMinimum({ ...current, legs: [] }, settings, 'b', side)).toBe(minimum);
      expect(lineEndMinimum(current, settings, 'b', side)).toBe(minimum + 3.5);
    }
  });

  it('clamps pins inside both legs and reserves room only at real segment ends', () => {
    const current = run({
      ...R, width: 120,
      items: [auto('a'), { ...fixed('b', 12), pin: pin(0, { anchor: 'left' }) }, auto('c')],
      legs: [L, { ...L, id: 'lg-2', from: 'right' }],
    });
    for (const [target, expected] of [[10, 22.5], [130, 105.5]]) {
      const result = splitRun(current, settings, { pinTargets: { b: target } });
      expect(result.pieces.find(({ id }) => id === 'b').x).toBe(expected);
      expect(result.pieces[0].x).toBe(13.5);
      const last = result.pieces.at(-1);
      expect(last.x + last.width).toBe(126.5);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'pin-unreachable', pieceId: 'b' }));
    }
  });
});
