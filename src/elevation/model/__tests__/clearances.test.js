import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import {
  clearanceParts, exposedEdges, islandGroups, partClearances, planClearances,
} from '../clearances.js';
import { gridFromItems } from '../grid.js';
import { syncRoom } from '../room.js';

const S = DEFAULT_SETTINGS;
const INSET = { cabinetStyleId: 14 };
const PANEL = { type: 'end_panel', width: null };
const NONE = { type: 'none', width: null };
const ENDS = { left: NONE, right: NONE };

const run = (id, wallSide, overrides = {}) => ({
  id, cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width: 96, z: 4, height: 30.5, depth: 24,
  ends: { left: PANEL, right: PANEL }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'manual', overrides: {}, anchors: { left: true, right: true }, wallSide,
  grid: gridFromItems(id, [{ id: `${id}a`, kind: 'cabinet', width: null }, { id: `${id}b`, kind: 'cabinet', width: null }]),
  ...overrides,
});

const wall = (id, x1, y1, x2, y2, extra = {}) => ({
  id, name: '', numberOverride: null, elevationForced: false, x1, y1, x2, y2, height: 96, thickness: 0,
  flipped: false, connections: { start: null, end: null }, profile: {}, openings: [], joints: [], runs: [],
  endPanels: { start: null, end: null }, landings: { start: null, end: null }, soffits: [], ...extra,
});

const link = (wallId, endpoint) => ({ wallId, endpoint });

const build = (walls) => syncRoom({
  id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: walls.map(({ id }) => id),
  style: INSET, walls,
}, S);

/** A closed 240 × 180 room of 4 1/2" walls, counterclockwise from the origin. */
const box = () => [
  wall('W1', 0, 0, 240, 0, { thickness: 4.5, connections: { start: link('W4', 'end'), end: link('W2', 'start') } }),
  wall('W2', 240, 0, 240, 180, { thickness: 4.5, connections: { start: link('W1', 'end'), end: link('W3', 'start') } }),
  wall('W3', 240, 180, 0, 180, { thickness: 4.5, connections: { start: link('W2', 'end'), end: link('W4', 'start') } }),
  wall('W4', 0, 180, 0, 0, { thickness: 4.5, connections: { start: link('W3', 'end'), end: link('W1', 'start') } }),
];

/** A 96" island (a 0" wall) at y 96 with a base run each side and wall end panels at both ends. */
const island = (runs = [run('F', 'front'), run('K', 'back')]) => wall('I', 72, 96, 168, 96, {
  runs, endPanels: { start: { width: null }, end: { width: null } },
});

/** A 96" run on the north wall, facing south, anchored to nothing. */
const northRun = () => run('N', 'front', { x: 72, width: 96, anchors: { left: false, right: false }, ends: ENDS });

const rows = (dimensions) => dimensions.map(({
  kind, from, to, length,
}) => [kind, from.x, from.y, to.x, to.y, length]);

const rect = (id, wallId, x0, y0, x1, y1) => ({
  id, wallId, kind: 'panel', points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }],
});

describe('SPEC-36.3 plan clearances', () => {
  it('finds the outside edges of an L, one straight edge each', () => {
    const edges = exposedEdges([rect('a', 'I', 0, 0, 96, 24), rect('b', 'I', 0, 24, 24, 72)]);
    expect(edges.map(({
      n, c, start, end,
    }) => [n.x, n.y, c, start, end])).toEqual([
      [0, -1, 0, 0, 96],
      [1, 0, 96, 0, 24],
      [0, 1, 24, -96, -24],
      [-1, 0, 0, -72, 0],
      [1, 0, 24, 24, 72],
      [0, 1, 72, -24, 0],
    ]);
  });

  it('measures a C island to the room and once across its pocket', () => {
    const roomWalls = [
      rect('n', 'R', -10, 300, 400, 310), rect('s', 'R', -10, -310, 400, -300),
      rect('w', 'R', -310, -310, -300, 310), rect('e', 'R', 400, -310, 410, 310),
    ];
    const c = [rect('spine', 'I', 0, 0, 24, 96), rect('top', 'I', 24, 72, 72, 96), rect('bot', 'I', 24, 0, 72, 24)];
    expect(rows(partClearances([...c, ...roomWalls], [['I']]))).toEqual([
      ['island', 36, 0, 36, -300, 300],
      ['island', 24, 48, 400, 48, 376],
      ['island', 36, 96, 36, 300, 204],
      ['island', 0, 48, -300, 48, 300],
      ['island', 48, 72, 48, 24, 48],
      ['island', 72, 12, 400, 12, 328],
      ['island', 72, 84, 400, 84, 328],
    ]);
  });

  it('dimensions an island from its cabinets and end panels, and its aisle once', () => {
    const withRun = box();
    withRun[2].runs = [northRun()];
    expect(rows(planClearances(build([...withRun, island()]), S))).toEqual([
      ['island', 120, 120.8125, 120, 155.1875, 34.375],
      ['island', 120, 71.1875, 120, 0, 71.1875],
      ['island', 72, 96, 0, 96, 72],
      ['island', 168, 96, 240, 96, 72],
    ]);
    // With no run across, the front measures to the wall face. An upper on the island doesn't count.
    const upper = run('U', 'front', { cabinetTypeId: CABINET_TYPE_IDS.UPPER, depth: 12 });
    expect(rows(planClearances(build([...box(), island([run('F', 'front'), run('K', 'back'), upper])]), S))).toEqual([
      ['island', 120, 120.8125, 120, 180, 59.1875],
      ['island', 120, 71.1875, 120, 0, 71.1875],
      ['island', 72, 96, 0, 96, 72],
      ['island', 168, 96, 240, 96, 72],
    ]);
  });

  it('dimensions the aisle between two facing runs, and nothing for a lone wall', () => {
    const galley = [
      wall('W1', 0, 0, 240, 0, { thickness: 4.5, runs: [run('A', 'front', { x: 0, width: 120, anchors: { left: false, right: false }, ends: ENDS })] }),
      wall('W3', 240, 120, 0, 120, { thickness: 4.5, runs: [run('B', 'front', { x: 60, width: 120, anchors: { left: false, right: false }, ends: ENDS })] }),
    ];
    expect(rows(planClearances(build(galley), S))).toEqual([['aisle', 90, 24.8125, 90, 95.1875, 70.375]]);
    expect(planClearances(build([island()]), S)).toEqual([]);
  });

  it('finds islands inside a closed room or an open U, and not a peninsula', () => {
    const closed = build([...box(), island()]);
    expect(islandGroups(closed, clearanceParts(closed, S))).toEqual([['I']]);

    const open = build([
      wall('U1', 0, 0, 240, 0, { thickness: 4.5, connections: { start: null, end: link('U2', 'start') } }),
      wall('U2', 240, 0, 240, 180, { thickness: 4.5, connections: { start: link('U1', 'end'), end: link('U3', 'start') } }),
      wall('U3', 240, 180, 0, 180, { thickness: 4.5, connections: { start: link('U2', 'end'), end: null } }),
      island(),
    ]);
    expect(islandGroups(open, clearanceParts(open, S))).toEqual([['I']]);
    expect(rows(planClearances(open, S))).toEqual([
      ['island', 120, 120.8125, 120, 180, 59.1875],
      ['island', 120, 71.1875, 120, 0, 71.1875],
      ['island', 168, 96, 240, 96, 72],
    ]);

    const peninsula = build([
      ...box(),
      wall('P', 120, 180, 120, 120, {
        landings: { start: { wallId: 'W3', side: 'front', to: 'near', ref: 'left', offset: 0 }, end: null },
      }),
    ]);
    expect(islandGroups(peninsula, clearanceParts(peninsula, S))).toEqual([]);
  });
});
