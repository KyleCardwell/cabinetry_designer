import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { frontDepth } from '../corners.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { runFootprint } from '../footprints.js';
import { gridFromItems } from '../grid.js';
import { validateRunPlacement } from '../overlap.js';
import { planRunPieces } from '../planPieces.js';
import {
  describeAnchor,
  endCornerAnglesForRun,
  endMinWidthsForRun,
  flipRunsForWall,
  roomDiagnostics,
  syncRoom,
} from '../room.js';
import { wallSideFrame } from '../wallSides.js';

const S = DEFAULT_SETTINGS;
/** 60 to 108, 24" deep, its top at 84. */
const R = {
  id: 'R', kind: 'recess', label: 'R1', wallSide: 'front', offsetFrom: 'left', offsetAnchor: 'edge',
  offset: 60, width: 48, bottom: 0, height: 84, depth: 24, molding: 'crown',
};
const at = (recessId, edge, offset = 0) => ({ to: 'recess', recessId, edge, offset });

function makeRun(id, extra = {}) {
  return {
    id, cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 60, width: 48, z: 4, height: 30.5, depth: 24,
    ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
    autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
    anchors: { left: false, right: false },
    grid: gridFromItems(id, [{ id: `${id}-c`, kind: 'cabinet', width: null }]),
    ...extra,
  };
}

function rawWall(runs, recesses = [R]) {
  return {
    id: 'A', name: '', numberOverride: null, elevationForced: false, x1: 0, y1: 0, x2: 240, y2: 0,
    height: 108, thickness: 4.5, flipped: false, connections: { start: null, end: null }, profile: {},
    openings: [], joints: [], runs, endPanels: { start: null, end: null },
    landings: { start: null, end: null }, soffits: [], recesses,
  };
}

const rawRoom = (runs, recesses) => ({
  id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: ['A'], walls: [rawWall(runs, recesses)],
});
const room = (runs, recesses) => syncRoom(rawRoom(runs, recesses), S);
const runOf = (synced, id) => synced.walls[0].runs.find((run) => run.id === id);

describe('SPEC-38 runs on a recess', () => {
  it('sits on the recess back in plan', () => {
    const synced = room([makeRun('B', { recessId: 'R' })]);
    const run = runOf(synced, 'B');
    expect(run._plane).toEqual({
      recessId: 'R', kind: 'recess', label: 'R1', x: 60, width: 48, bottom: 0, top: 84, depth: 24,
      offset: -24, molding: 'crown',
    });
    expect(frontDepth(run, S)).toBe(0.875);
    const wall = synced.walls[0];
    expect(runFootprint(wallSideFrame(synced, wall, 'front'), run, S)).toEqual([
      { x: 60, y: -24 }, { x: 108, y: -24 }, { x: 108, y: 0.875 }, { x: 60, y: 0.875 },
    ]);
    const layout = layoutRun(synced, wall, run, S);
    const pieces = planRunPieces(synced, wall, run, S, layout, runFaceLayouts(synced, wall, run, S, layout));
    expect(pieces.boxes).toEqual([{ key: 'B-c', start: 60, end: 108, back: -24, front: 0 }]);
    expect(runOf(room([makeRun('B')]), 'B')).not.toHaveProperty('_plane');
  });

  it('stops an auto tall under a recess top below the ceiling', () => {
    const tall = (recesses) => runOf(room([makeRun('T', {
      cabinetTypeId: CABINET_TYPE_IDS.TALL, heightMode: 'auto', height: 80, recessId: 'R',
    })], recesses), 'T');
    expect(tall()).toMatchObject({ z: 4, height: 74 });
    expect(tall([{ ...R, height: null }])).toMatchObject({ z: 4, height: 86 });
  });

  it('anchors to recess sides: square inside corners in it, outside corners beside it', () => {
    const synced = room([
      makeRun('B', { recessId: 'R', anchors: { left: at('R', 'left'), right: at('R', 'right', 1.5) } }),
      makeRun('F', { x: 0, width: 60, z: 54, cabinetTypeId: CABINET_TYPE_IDS.UPPER, anchors: { left: false, right: at('R', 'left') } }),
    ]);
    const wall = synced.walls[0];
    const inside = runOf(synced, 'B');
    expect(inside).toMatchObject({ x: 60, width: 46.5 });
    expect(endCornerAnglesForRun(synced, wall, inside)).toEqual({ left: 90, right: 90 });
    expect(endMinWidthsForRun(synced, wall, inside, S)).toEqual({ left: 1.5, right: 1.5 });
    expect(describeAnchor(synced, wall, inside, 'left', S)).toBe('R1 left side · flush');
    expect(describeAnchor(synced, wall, inside, 'right', S)).toBe('R1 right side · 1 1/2" gap');
    expect(endCornerAnglesForRun(synced, wall, runOf(synced, 'F'))).toEqual({ left: undefined, right: undefined });

    const missing = roomDiagnostics(rawRoom([makeRun('B', { anchors: { left: at('Q', 'left'), right: false } })]), S);
    expect(missing.B.errors).toContainEqual({ code: 'anchor-recess-missing', side: 'left' });
  });

  it('lets a run on the face cross a recess where their plan depths miss', () => {
    const placed = (depth) => {
      const synced = room([makeRun('F', { x: 0, width: 240 }), makeRun('B', { recessId: 'R', depth })]);
      return validateRunPlacement({ ...synced.walls[0], length: 240 }, runOf(synced, 'B'), S);
    };
    expect(placed(23)).toEqual({ ok: true, reason: null });
    expect(placed(24)).toEqual({ ok: false, reason: 'conflict' });
    const both = room([makeRun('F', { x: 0, width: 240 }), makeRun('G', { x: 10, width: 20 })]);
    expect(validateRunPlacement({ ...both.walls[0], length: 240 }, runOf(both, 'G'), S).reason).toBe('conflict');
  });

  it('warns about a run past its recess', () => {
    const diagnostics = roomDiagnostics(rawRoom([makeRun('B', { recessId: 'R', x: 50, width: 60 })]), S);
    expect(diagnostics.B.warnings).toContainEqual({ code: 'recess-overflow', recessId: 'R', label: 'R1' });
  });

  it('mirrors recesses and recess anchors when the wall flips', () => {
    const flipped = flipRunsForWall(rawWall([
      makeRun('B', { recessId: 'R', anchors: { left: false, right: at('R', 'right') } }),
    ]));
    expect(flipped.recesses[0]).toMatchObject({ offsetFrom: 'right', offset: 60 });
    expect(flipped.runs[0].anchors).toEqual({ left: at('R', 'left'), right: false });
    expect(flipped.runs[0].x).toBe(132);
  });
});
