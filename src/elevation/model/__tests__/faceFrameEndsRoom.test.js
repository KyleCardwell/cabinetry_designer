import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { cellPieces } from '../cells.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { frameRegions, regionOpenings } from '../frames.js';
import { gridFromItems } from '../grid.js';
import { resolveWall, syncRoom } from '../room.js';

// Run flex off: these pin down the frame gaps with the boxes taking the rest (SPEC-RF1 is tested on its own).
const S = { ...DEFAULT_SETTINGS, runFlex: 0 };

function makeRun(id, type, x, width, ends, count, extra = {}) {
  const items = Array.from({ length: count }, (_, index) => ({ id: `${id}${index + 1}`, kind: 'cabinet', width: null }));
  return {
    id, cabinetTypeId: type, x, width, z: type === CABINET_TYPE_IDS.UPPER ? 54 : 4,
    height: type === CABINET_TYPE_IDS.UPPER ? 36 : 30.5, depth: type === CABINET_TYPE_IDS.UPPER ? 12 : 24,
    ends: { left: { type: ends[0], width: null }, right: { type: ends[1], width: null } },
    autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
    anchors: { left: false, right: false }, grid: gridFromItems(id, items), ...extra,
  };
}

const room = syncRoom({
  id: 'room', name: 'Room', profile: { ...S.defaultProfile }, style: { cabinetStyleId: 15 }, wallOrder: ['A'],
  walls: [{
    id: 'A', name: '', numberOverride: null, elevationForced: false, x1: 0, y1: 0, x2: 200, y2: 0,
    height: 96, thickness: 4.5, flipped: false, connections: { start: null, end: null }, profile: {},
    openings: [], joints: [], endPanels: { start: null, end: null }, landings: { start: null, end: null },
    soffits: [],
    runs: [
      makeRun('U', CABINET_TYPE_IDS.UPPER, 0, 90, ['none', 'end_panel'], 3),
      makeRun('B', CABINET_TYPE_IDS.BASE, 100, 60, ['end_panel', 'end_panel'], 2),
    ],
  }],
}, S);

function frameOf(runId) {
  const wall = resolveWall(room, room.walls[0]);
  const run = wall.runs.find(({ id }) => id === runId);
  const layout = layoutRun(room, wall, run, S);
  const [region] = frameRegions(room, run, cellPieces(run, layout), S).regions;
  return {
    region: [region.x, region.width],
    openings: regionOpenings(region, runFaceLayouts(room, wall, run, S, layout)).map(({ width }) => width),
  };
}

describe('SPEC-38.3 the frame covers the end gaps', () => {
  it('runs out to a free end (overhang in the gap, box not narrowed) and over an end panel past its bead gap', () => {
    // Free left gap 1/4 + 3/4; the 13/16-inch panel leaves a 3/16 gap on the right.
    expect(frameOf('U')).toEqual({ region: [0, 90], openings: [27.5, 27.5, 27.5] });
  });

  it('covers end panels at both ends with equal openings', () => {
    // 60 − 1 5/8 panels − 1/2 seam − 3/8 end gaps = 57 1/2 → two 28 3/4 boxes.
    expect(frameOf('B')).toEqual({ region: [100, 60], openings: [27.25, 27.25] });
  });
});
