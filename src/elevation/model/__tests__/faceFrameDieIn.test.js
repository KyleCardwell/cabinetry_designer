import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { frameRegions, regionOpenings } from '../frames.js';
import { gridFromItems } from '../grid.js';
import { resolveWall, syncRoom } from '../room.js';

const S = DEFAULT_SETTINGS;
const AUTO_NONE = { type: 'none', width: null, auto: true };
const PANEL = { type: 'end_panel', width: null };
const joint = { to: 'joint', jointId: 'J', offset: 0 };

function makeRun(id, type, x, width, ends, count, extra = {}) {
  const items = Array.from({ length: count }, (_, index) => ({ id: `${id}${index + 1}`, kind: 'cabinet', width: null }));
  const upper = type === CABINET_TYPE_IDS.UPPER;
  return {
    id, cabinetTypeId: type, x, width, z: upper ? 54.75 : 4,
    height: type === CABINET_TYPE_IDS.TALL ? 86 : upper ? 35.25 : 30.5,
    depth: type === CABINET_TYPE_IDS.TALL ? 25 : upper ? 12 : 24,
    ends: { left: ends[0], right: ends[1] }, autoCount: false, maxCabinetWidth: null,
    heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
    grid: gridFromItems(id, items), wallSide: 'front', ...extra,
  };
}

/** Kyle's G2 wall 1 (SPEC-38.4): a 25" tall, a 24" base and a 12" upper joined to its right side at 76 1/2. */
function g2({ tallDepth = 25, endPanels = { start: null, end: null }, upperRight = { type: 'filler', width: null } } = {}) {
  return syncRoom({
    id: 'room', name: 'Room', profile: { ...S.defaultProfile }, style: { cabinetStyleId: 15 }, wallOrder: ['A'],
    walls: [{
      id: 'A', name: '', numberOverride: null, elevationForced: false, x1: 0, y1: 0, x2: 172, y2: 0,
      height: 96, thickness: 4.5, flipped: false, connections: { start: null, end: null }, profile: {},
      openings: [], soffits: [], endPanels, landings: { start: null, end: null },
      joints: [{ id: 'J', x: 76.5, wallSide: 'front' }],
      runs: [
        makeRun('T', CABINET_TYPE_IDS.TALL, 50, 26.5, [PANEL, AUTO_NONE], 1,
          { depth: tallDepth, anchors: { left: false, right: joint } }),
        makeRun('B', CABINET_TYPE_IDS.BASE, 76.5, 70.5, [AUTO_NONE, PANEL], 2,
          { anchors: { left: joint, right: false } }),
        makeRun('U', CABINET_TYPE_IDS.UPPER, 76.5, 95.5, [AUTO_NONE, upperRight], 3,
          { anchors: { left: joint, right: true } }),
      ],
    }],
  }, S);
}

function frameOf(room, runId) {
  const wall = resolveWall(room, room.walls[0]);
  const run = wall.runs.find(({ id }) => id === runId);
  const layout = layoutRun(room, wall, run, S);
  const cells = cellPieces(run, layout);
  const [region] = frameRegions(room, run, cells, S).regions;
  const openings = regionOpenings(region, runFaceLayouts(room, wall, run, S, layout));
  return {
    leftEnd: run.ends.left.type,
    dieIn: run._frame.dieIn,
    boxes: cells.pieces.filter(({ kind }) => kind === 'cabinet').map(({ x, width }) => [x, width]),
    leftStile: openings[0].x - region.x,
    rightStile: region.x + region.width - openings.at(-1).x - openings.at(-1).width,
    openings: openings.map(({ width }) => width),
  };
}

describe('SPEC-38.4 a joined end that dies into a deeper run', () => {
  it('gives the base and the upper a 1 3/4 stile beside the deeper tall, with no end panel', () => {
    const room = g2();
    expect(frameOf(room, 'B')).toEqual({
      leftEnd: 'none', dieIn: { left: true, right: false },
      boxes: [[77.5, 34], [112, 34]], leftStile: 1.75, rightStile: 1.75, openings: [32.5, 32.5],
    });
    expect(frameOf(room, 'U')).toMatchObject({
      leftEnd: 'none', dieIn: { left: true, right: false }, leftStile: 1.75, openings: [29, 29, 29],
    });
  });

  it('keeps the bead-only gap where the neighbour is only as deep (a 1" stile; the boxes take the rest)', () => {
    const room = g2({ tallDepth: 24 });
    expect(frameOf(room, 'B')).toEqual({
      leftEnd: 'none', dieIn: undefined,
      boxes: [[76.75, 34.375], [111.625, 34.375]], leftStile: 1, rightStile: 1.75, openings: [32.875, 32.875],
    });
  });
});

describe('SPEC-38.4 a mitered wall end panel in a beaded run', () => {
  it('gives the end a bead gap only: 1 3/4 over the panel; the boxes take the rest', () => {
    const room = g2({ endPanels: { start: null, end: { width: null } }, upperRight: AUTO_NONE });
    const upper = room.walls[0].runs.find(({ id }) => id === 'U');
    expect(upper._frame.wallPanels.right).toEqual({ width: 0.75, top: 90, join: 'miter' });
    // 94 3/4 (to the panel) − 1 die-in gap − 1/4 bead − 1 seams = 92 1/2 → 30 13/16, 30 13/16 and the
    // last 30 7/8 (SPEC-42.1: the stiles stay 1 3/4, the last box takes the odd sixteenth).
    expect(frameOf(room, 'U')).toMatchObject({
      boxes: [[77.5, 30.8125], [108.8125, 30.8125], [140.125, 30.875]],
      leftStile: 1.75,
      rightStile: 1.75,
      openings: [29.3125, 29.3125, 29.375],
    });
  });
});
