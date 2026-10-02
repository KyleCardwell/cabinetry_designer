import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { frontDepth, runBackOffset } from '../corners.js';
import { gridFromItems } from '../grid.js';
import {
  createRecess,
  openingPlanDepths,
  recessAnchorDatum,
  recessCorner,
  recessEdges,
  recessEndType,
  recessForSpan,
  recessGeometry,
  recessPlanShape,
  recessWarnings,
  recessesOn,
  resizeRecess,
  uncoveredSpans,
  validateRecessPlacement,
  withRunPlane,
} from '../recesses.js';

const S = DEFAULT_SETTINGS;
/** 48" wide, 24" deep, floor to ceiling, 60" from the left: 60 to 108. */
const R = {
  id: 'R', kind: 'recess', label: 'R1', wallSide: 'front', offsetFrom: 'left', offsetAnchor: 'edge',
  offset: 60, width: 48, bottom: 0, height: null, depth: 24, molding: 'crown',
};
/** A medicine cabinet's: 150 to 166, 48" up, 26" tall, 3 1/2" deep. */
const M = { ...R, id: 'M', label: 'R2', offset: 150, width: 16, bottom: 48, height: 26, depth: 3.5 };
/** A projection 60" wide, 12" from the right of a 240" wall: 168 to 228, 18" out. */
const P = { ...R, id: 'P', kind: 'projection', label: 'P1', offsetFrom: 'right', offset: 12, width: 60, depth: 18 };

const wall = (recesses = [R, M, P], extra = {}) => ({
  id: 'H', x1: 0, y1: 0, x2: 240, y2: 0, height: 108, thickness: 4.5, flipped: false,
  runs: [], openings: [], recesses, ...extra,
});
const base = (extra = {}) => ({
  id: 'b', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 60, width: 48, z: 4, height: 30.5, depth: 24,
  anchors: { left: false, right: false }, ...extra,
});
const upper = (extra = {}) => base({ cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 30, depth: 12, ...extra });
const at = (recessId, edge, offset = 0) => ({ to: 'recess', recessId, edge, offset });
const cell = (col, node) => ({ col, row: 0, colSpan: 1, rowSpan: 1, node });
const track = (id) => ({ id, size: null, sizeMode: 'auto' });

describe('SPEC-38 recesses', () => {
  it('resolves a recess like a window, and lists them by face', () => {
    expect(recessGeometry(R, 240, 108)).toEqual({
      x: 60, width: 48, bottom: 0, top: 108, depth: 24, plane: -24,
      offsets: { left: { edge: 60, center: 84 }, right: { edge: 132, center: 156 } },
    });
    expect(recessGeometry(M, 240, 108)).toMatchObject({ x: 150, top: 74, plane: -3.5 });
    expect(recessGeometry(P, 240, 108)).toMatchObject({ x: 168, top: 108, plane: 18 });
    expect(recessesOn(wall()).map(({ id }) => id)).toEqual(['R', 'M', 'P']);
    expect(recessesOn(wall(), 'back')).toEqual([]);
  });

  it('creates a 36" × 12" floor-to-ceiling recess centered on the click', () => {
    const empty = wall([]);
    expect(createRecess({ x: 100 }, { room: { walls: [empty] }, wall: empty })).toMatchObject({
      kind: 'recess', label: 'R1', wallSide: 'front', offsetFrom: 'left', offsetAnchor: 'edge',
      offset: 82, width: 36, bottom: 0, height: null, depth: 12, molding: 'crown',
    });
    expect(createRecess({ x: 230 }, { room: { walls: [empty] }, wall: empty }).offset).toBe(204);
    expect(createRecess({ x: 100 }, { room: { walls: [wall()] }, wall: empty }).label).toBe('R3');
    expect(createRecess({ kind: 'projection', x: 100 }, { room: { walls: [wall()] }, wall: empty }).label)
      .toBe('P2');
    expect(createRecess({ x: 100 }, { room: { walls: [empty] }, wall: { ...empty, side: 'back' } }).wallSide)
      .toBe('back');
  });

  it('validates size, bounds and overlap; stacked recesses are fine', () => {
    expect(validateRecessPlacement(wall(), R)).toEqual({ ok: true, reason: null });
    expect(validateRecessPlacement(wall(), { ...R, id: 'X', offset: 80, width: 20 }).reason).toBe('recess-overlap');
    expect(validateRecessPlacement(wall(), { ...M, id: 'M2', bottom: 80, height: 10 }).ok).toBe(true);
    expect(validateRecessPlacement(wall(), { ...R, offset: 220 }).reason).toBe('recess-out-of-bounds');
    expect(validateRecessPlacement(wall(), { ...M, height: 70 }).reason).toBe('recess-out-of-bounds');
    expect(validateRecessPlacement(wall(), { ...R, depth: 0 }).reason).toBe('recess-too-small');
    expect(validateRecessPlacement(wall(), { ...R, width: 0.5 }).reason).toBe('recess-too-small');
  });

  it('resizes toward a side or about its center, keeping its offset terms', () => {
    expect(resizeRecess(R, 60, 'both', 240)).toMatchObject({ width: 60, offset: 54 });
    expect(resizeRecess(R, 60, 'left', 240)).toMatchObject({ width: 60, offset: 48 });
    expect(resizeRecess(R, 60, 'right', 240)).toMatchObject({ width: 60, offset: 60 });
    expect(resizeRecess(P, 70, 'right', 240)).toMatchObject({ width: 70, offset: 2 });
  });

  it('puts a run on its recess plane, and measures from there', () => {
    const planed = withRunPlane(wall(), base({ recessId: 'R' }));
    expect(planed._plane).toEqual({
      recessId: 'R', kind: 'recess', label: 'R1', x: 60, width: 48, bottom: 0, top: 108, depth: 24,
      offset: -24, molding: 'crown',
    });
    const plain = base();
    expect(withRunPlane(wall(), plain)).toBe(plain);
    expect(withRunPlane(wall(), { ...planed, recessId: undefined })).not.toHaveProperty('_plane');
    expect(runBackOffset({ ...planed, outset: 2 })).toBe(-22);
    expect(withRunPlane(wall(), base({ recessId: 'P' }))._plane.offset).toBe(18);
  });

  it('starts recess ends as fillers inside, end panels outside or when the box stands out', () => {
    const inside = base({ recessId: 'R', anchors: { left: at('R', 'left'), right: at('R', 'right') } });
    expect(recessCorner(wall(), inside, 'left')).toMatchObject({ type: 'inside', angle: 90 });
    expect(recessEndType(wall(), inside, 'left')).toBe('filler');
    expect(recessEndType(wall(), { ...inside, depth: 30 }, 'right')).toBe('end_panel');

    const beside = base({ x: 0, width: 60, anchors: { left: false, right: at('R', 'left') } });
    expect(recessCorner(wall(), beside, 'right')).toMatchObject({ type: 'outside', angle: 90 });
    expect(recessEndType(wall(), beside, 'right')).toBe('end_panel');

    const byProjection = upper({ x: 108, width: 60, anchors: { left: false, right: at('P', 'left') } });
    expect(recessCorner(wall(), byProjection, 'right')).toMatchObject({ type: 'inside' });
    expect(recessEndType(wall(), byProjection, 'right')).toBe('filler');
    expect(recessEndType(wall(), { ...byProjection, depth: 24 }, 'right')).toBe('end_panel');

    const missing = base({ anchors: { left: at('Q', 'left'), right: false } });
    expect(recessCorner(wall(), missing, 'left')).toBeNull();
    expect(recessEndType(wall(), missing, 'left')).toBe('end_panel');
  });

  it('resolves recess anchors, lists edges, and finds the recess around a span', () => {
    expect(recessAnchorDatum(wall(), at('R', 'left'), 'left')).toBe(60);
    expect(recessAnchorDatum(wall(), at('R', 'right', 1.5), 'right')).toBe(106.5);
    expect(recessAnchorDatum(wall(), at('R', 'left', 1.5), 'right')).toBe(58.5);
    expect(recessAnchorDatum(wall(), at('Q', 'left'), 'left')).toBeNull();
    expect(recessEdges(wall())).toEqual([
      { value: 60, recessId: 'R', edge: 'left' },
      { value: 108, recessId: 'R', edge: 'right' },
      { value: 150, recessId: 'M', edge: 'left' },
      { value: 166, recessId: 'M', edge: 'right' },
      { value: 168, recessId: 'P', edge: 'left' },
      { value: 228, recessId: 'P', edge: 'right' },
    ]);
    expect(recessForSpan(wall(), { left: 61, right: 107, bottom: 0, top: 34.5 }, 3)?.id).toBe('R');
    expect(recessForSpan(wall(), { left: 40, right: 107, bottom: 0, top: 34.5 }, 3)).toBeNull();
    expect(recessForSpan(wall(), { left: 151, right: 165, bottom: 50, top: 70 })?.id).toBe('M');
    expect(recessForSpan(wall(), { left: 151, right: 165, bottom: 50, top: 70 }, 0, ['projection'])).toBeNull();
  });

  it('warns about runs past their recess and runs into a projection', () => {
    const over = withRunPlane(wall(), base({ recessId: 'R', x: 50, width: 60 }));
    expect(recessWarnings(wall(), over)).toEqual([{ code: 'recess-overflow', recessId: 'R', label: 'R1' }]);
    expect(recessWarnings(wall(), withRunPlane(wall(), base({ recessId: 'R' })))).toEqual([]);
    expect(recessWarnings(wall(), withRunPlane(wall(), base({ recessId: 'M', x: 150, width: 16 }))))
      .toEqual([{ code: 'recess-overflow', recessId: 'M', label: 'R2' }]);
    expect(recessWarnings(wall(), upper({ x: 170, width: 30 })))
      .toEqual([{ code: 'projection-conflict', recessId: 'P', label: 'P1' }]);
    expect(recessWarnings(wall(), upper({ x: 170, width: 30, outset: 18 }))).toEqual([]);
  });

  it('draws the notch, the bump-out, the dashed raised recess and the projection in plan', () => {
    expect(recessPlanShape(R, 240, 108, 4.5)).toEqual({
      dashed: false,
      knockout: [[60, 0], [108, 0], [108, -24], [60, -24]],
      fill: [[55.5, -4.5], [112.5, -4.5], [112.5, -28.5], [55.5, -28.5]],
      lines: [
        [[60, 0], [60, -24]], [[60, -24], [108, -24]], [[108, -24], [108, 0]],
        [[55.5, -4.5], [55.5, -28.5]], [[55.5, -28.5], [112.5, -28.5]], [[112.5, -28.5], [112.5, -4.5]],
      ],
      label: [84, -12],
    });
    expect(recessPlanShape({ ...R, depth: 2 }, 240, 108, 4.5)).toEqual({
      dashed: false,
      knockout: [[60, 0], [108, 0], [108, -2], [60, -2]],
      fill: null,
      lines: [[[60, 0], [60, -2]], [[60, -2], [108, -2]], [[108, -2], [108, 0]]],
      label: [84, -1],
    });
    expect(recessPlanShape(M, 240, 108, 4.5)).toEqual({
      dashed: true,
      knockout: null,
      fill: null,
      lines: [[[150, 0], [150, -3.5]], [[150, -3.5], [166, -3.5]], [[166, -3.5], [166, 0]]],
      label: [158, -1.75],
    });
    expect(recessPlanShape(P, 240, 108, 4.5)).toEqual({
      dashed: false,
      knockout: null,
      fill: [[168, 0], [228, 0], [228, 18], [168, 18]],
      lines: [[[168, 0], [168, 18]], [[168, 18], [228, 18]], [[228, 18], [228, 0]]],
      label: [198, 9],
    });
  });

  it('cuts a door through what is left behind a recess back, and splits spans around ranges', () => {
    expect(openingPlanDepths(wall(), { recessId: 'R' })).toEqual({ face: -24, back: -28.5 });
    expect(openingPlanDepths(wall([{ ...R, depth: 2 }]), { recessId: 'R' })).toEqual({ face: -2, back: -4.5 });
    expect(openingPlanDepths(wall(), {})).toEqual({ face: 0, back: -4.5 });
    expect(openingPlanDepths(wall(), { recessId: 'P' })).toEqual({ face: 0, back: -4.5 });
    expect(uncoveredSpans(0, 100, [{ start: 50, end: 60 }, { start: 10, end: 20 }])).toEqual([
      { start: 0, end: 10 }, { start: 20, end: 50 }, { start: 60, end: 100 },
    ]);
    expect(uncoveredSpans(60, 108, [{ start: 60, end: 108 }])).toEqual([]);
  });

  it('measures front depth from the plane; a panel-only run reserves just the panel', () => {
    expect(frontDepth({ depth: 24, _plane: { offset: -24 } }, S)).toBe(0.875);
    expect(runBackOffset({})).toBe(0);
    const panels = {
      id: 'g', cols: [track('c0')], rows: [track('r0')], cells: [cell(0, { id: 'p', kind: 'panel' })],
    };
    expect(frontDepth({ depth: 0.8125, grid: panels }, S)).toBe(0.8125);
    const mixed = {
      ...panels,
      cols: [track('c0'), track('c1')],
      cells: [cell(0, { id: 'p', kind: 'panel' }), cell(1, { id: 'c', kind: 'cabinet' })],
    };
    expect(frontDepth({ depth: 0.8125, grid: mixed }, S)).toBe(1.6875);
    expect(frontDepth({ depth: 24, grid: gridFromItems('e', []) }, S)).toBe(24.875);
  });
});
