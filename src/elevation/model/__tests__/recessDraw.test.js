import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { gridFromItems } from '../grid.js';
import { moveRun, resolveWall, stretchRun, syncRoom, tryPlaceRun } from '../room.js';
import { createRun } from '../runDefaults.js';

const S = DEFAULT_SETTINGS;
/** 60 to 108, 24" deep, floor to ceiling. */
const R = {
  id: 'R', kind: 'recess', label: 'R1', wallSide: 'front', offsetFrom: 'left', offsetAnchor: 'edge',
  offset: 60, width: 48, bottom: 0, height: null, depth: 24, molding: 'crown',
};
const at = (recessId, edge, offset = 0) => ({ to: 'recess', recessId, edge, offset });

function makeRun(id, extra = {}) {
  return {
    id, cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width: 40, z: 4, height: 30.5, depth: 24,
    ends: { left: { type: 'filler', width: null }, right: { type: 'filler', width: null } },
    autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
    anchors: { left: false, right: false },
    grid: gridFromItems(id, [{ id: `${id}-c`, kind: 'cabinet', width: null }]),
    ...extra,
  };
}

const room = (runs = []) => syncRoom({
  id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: ['A'],
  walls: [{
    id: 'A', name: '', numberOverride: null, elevationForced: false, x1: 0, y1: 0, x2: 240, y2: 0,
    height: 108, thickness: 4.5, flipped: false, connections: { start: null, end: null }, profile: {},
    openings: [], joints: [], runs, endPanels: { start: null, end: null },
    landings: { start: null, end: null }, soffits: [], recesses: [R],
  }],
}, S);

describe('SPEC-38 drawing at recesses', () => {
  it('puts a run drawn inside a recess on it, anchored to its sides with fillers', () => {
    const synced = room();
    const ctx = { settings: S, room: synced, wall: resolveWall(synced, synced.walls[0]) };
    const run = createRun({ x: 61, width: 46, bottomZ: 0, topZ: 34.5 }, ctx);
    expect(run).toMatchObject({
      recessId: 'R',
      anchors: { left: at('R', 'left'), right: at('R', 'right') },
      ends: { left: { type: 'filler', width: null }, right: { type: 'filler', width: null } },
    });
    const placed = tryPlaceRun(synced, 'A', run, S);
    expect(placed.ok).toBe(true);
    expect(placed.room.walls[0].runs[0]).toMatchObject({ x: 60, width: 48 });
  });

  it('ends a run drawn beside a recess at its edge with an end panel', () => {
    const synced = room();
    const ctx = { settings: S, room: synced, wall: resolveWall(synced, synced.walls[0]) };
    const run = createRun({ x: 0, width: 61, bottomZ: 0, topZ: 34.5 }, ctx);
    expect(run.recessId).toBeUndefined();
    expect(run.anchors.right).toEqual(at('R', 'left'));
    expect(run.ends.right).toEqual({ type: 'end_panel', width: null });
  });

  it('snaps stretched and moved run edges to recess edges', () => {
    const stretched = stretchRun(room([makeRun('F')]), 'A', 'F', 'right', 59, S);
    expect(stretched.ok).toBe(true);
    expect(stretched.room.walls[0].runs[0]).toMatchObject({
      x: 0, width: 60, anchors: { right: at('R', 'left') }, ends: { right: { type: 'end_panel', width: null } },
    });
    const moved = moveRun(room([makeRun('F', { width: 30 })]), 'A', 'F', 31, S);
    expect(moved).toMatchObject({ ok: true, x: 30, snap: { value: 60, edge: 'right' } });
  });
});
