import { describe, expect, it } from 'vitest';
import { cornerReserve, frontDepth } from '../corners.js';
import { CABINET_TYPE_IDS, DEFAULT_PROFILE, DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { gridFromItems } from '../grid.js';
import { planRunPieces } from '../planPieces.js';
import { resolveVertical } from '../profile.js';
import { endMinWidthsForRun, resolveWall } from '../room.js';
import { runFrame } from '../styles.js';

const S = DEFAULT_SETTINGS;
const { BASE, UPPER } = CABINET_TYPE_IDS;
const NONE = { type: 'none', width: null };
const INSET = { cabinetStyleId: 14 };
const FRAME = { thickness: 0.8125, drop: 0 };

const makeRun = (overrides = {}) => ({
  id: 'r', cabinetTypeId: BASE, x: 24, width: 40, z: 4, height: 30.5, depth: 24,
  ends: { left: NONE, right: NONE }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
  grid: gridFromItems('r', [{ id: 'a', kind: 'cabinet', width: null }]),
  ...overrides,
});

function roomWith(runs, style) {
  return {
    id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: ['w'],
    ...(style ? { style } : {}),
    walls: [{
      id: 'w', name: '', numberOverride: null, elevationForced: false,
      x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5, flipped: false,
      connections: { start: null, end: null }, profile: {}, openings: [], joints: [], runs,
      endPanels: { start: null, end: null }, landings: { start: null, end: null }, soffits: [],
    }],
  };
}

function cornerRoom(runsA, runsB, style) {
  const wall = (id, x1, y1, x2, y2, connections, runs) => ({
    id, name: `Wall ${id}`, x1, y1, x2, y2, height: 96, thickness: 4.5, flipped: false,
    connections, profile: {}, runs,
  });
  return {
    id: 'R', name: 'Room R', profile: { ...S.defaultProfile }, ...(style ? { style } : {}),
    walls: [
      wall('A', 0, 0, 120, 0, { start: null, end: { wallId: 'B', endpoint: 'start' } }, runsA),
      wall('B', 120, 0, 120, 96, { start: { wallId: 'A', endpoint: 'end' }, end: null }, runsB),
    ],
  };
}

describe('face frame run shape', () => {
  it('derives thickness and the upper door overhang drop for face frame runs', () => {
    const room = roomWith([], { cabinetStyleId: 14 });

    expect(runFrame(room, { cabinetTypeId: 2 }, DEFAULT_SETTINGS)).toEqual({
      thickness: 0.8125,
      drop: 0.75,
      bead: 0,
    });
    expect(runFrame(room, { cabinetTypeId: 1 }, DEFAULT_SETTINGS)).toEqual({
      thickness: 0.8125,
      drop: 0,
      bead: 0,
    });
  });

  it('has no frame for European runs', () => {
    expect(runFrame({}, { cabinetTypeId: 2 }, DEFAULT_SETTINGS)).toBeNull();
  });
});

describe('SPEC-36.1 depth, clearance and corners', () => {
  it('puts a face frame run\'s front at box + 13/16, and reserves that at a corner', () => {
    expect(frontDepth({ depth: 24 }, S)).toBe(24.875);
    expect(frontDepth({ depth: 24, _frame: FRAME }, S)).toBe(24.8125);
    expect(frontDepth({ depth: 24, outset: 2, _frame: FRAME }, S)).toBe(26.8125);

    const tall = makeRun({ id: 'B-tall', cabinetTypeId: CABINET_TYPE_IDS.TALL, anchors: { left: true, right: false } });
    const base = makeRun({ id: 'A-base' });
    expect(cornerReserve(cornerRoom([base], [tall]), cornerRoom([base], [tall]).walls[0], 'right', base, S))
      .toBe(24.875);
    const framed = cornerRoom([base], [{ ...tall, _frame: FRAME }]);
    expect(cornerReserve(framed, framed.walls[0], 'right', base, S)).toBe(24.8125);
  });

  it('measures upper clearance to the frame, and shortens the corner filler by the side reveal', () => {
    const upper = { cabinetTypeId: UPPER, heightMode: 'auto', overrides: {}, x: 0, width: 30 };
    expect(resolveVertical(upper, DEFAULT_PROFILE)).toMatchObject({ z: 54, height: 36 });
    expect(resolveVertical({ ...upper, _frame: { thickness: 0.8125, drop: 0.75 } }, DEFAULT_PROFILE))
      .toMatchObject({ z: 54.75, height: 35.25 });

    const anchored = makeRun({ anchors: { left: false, right: true } });
    const minimum = (style) => {
      const room = cornerRoom([anchored], [], style);
      return endMinWidthsForRun(room, room.walls[0], { ...anchored, _frame: runFrame(room, anchored, S) }, S);
    };
    expect(minimum()).toEqual({ left: 1.5, right: 1.5 });
    expect(minimum(INSET)).toEqual({ left: 1.5, right: 0.75 });
    expect(minimum({ cabinetStyleId: 15 })).toEqual({ left: 1.5, right: 0.5 });
  });
});

describe('SPEC-36.1 plan pieces', () => {
  // SPEC-38.3 step 285
  it.skip('draws a frame strip mitered into its end panel, with no filler', () => {
    const run = makeRun({
      _frame: FRAME,
      ends: { left: { type: 'end_panel', width: null }, right: { type: 'filler', width: 2 } },
      grid: gridFromItems('r', [{ id: 'a', kind: 'cabinet', width: 18 }, { id: 'b', kind: 'cabinet', width: null }]),
    });
    const room = roomWith([run], INSET);
    const wall = resolveWall(room, room.walls[0]);
    const layout = layoutRun(room, wall, run, S);
    const plan = planRunPieces(room, wall, run, S, layout, runFaceLayouts(room, wall, run, S, layout));
    expect(plan.boxes.map(({ key, start, end, back, front }) => [key, start, end, back, front]))
      .toEqual([['a', 24.75, 42.75, 0, 24], ['b', 42.75, 62, 0, 24]]);
    expect(plan.faces).toEqual([
      {
        key: 'r:left', kind: 'end_panel', start: 24, end: 24.75, back: 0, front: 24.8125,
        polygon: [[24, 0], [24.75, 0], [24.75, 24], [24, 24.8125]],
      },
      {
        key: 'frame:a', kind: 'frame', start: 24, end: 64, back: 24, front: 24.8125,
        polygon: [[24, 24.8125], [64, 24.8125], [64, 24], [24.75, 24]],
      },
    ]);
    expect(plan.returns).toEqual([]);
    expect(plan.span).toEqual({ start: 24, end: 64 });
  });
});
