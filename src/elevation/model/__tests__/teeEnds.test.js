import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { horizontalChains } from '../dimensions.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { gridFromItems } from '../grid.js';
import { planRunPieces } from '../planPieces.js';
import { endMinWidthsForRun, resolveWall } from '../room.js';
import { endCoverOn } from '../styles.js';
import { teeFillers } from '../tees.js';

const S = DEFAULT_SETTINGS;
const { BASE, UPPER } = CABINET_TYPE_IDS;
const NONE = { type: 'none', width: null };
const FILLER = { type: 'filler', width: null };
const cab = (id, width = null, extra = {}) => ({ id, kind: 'cabinet', width, ...extra });

function cornerRoom(runsA, style) {
  const wall = (id, x1, y1, x2, y2, connections, runs) => ({
    id, name: `Wall ${id}`, x1, y1, x2, y2, height: 96, thickness: 4.5, flipped: false,
    connections, profile: {}, runs,
  });
  return {
    id: 'R', name: 'Room R', profile: { ...S.defaultProfile }, ...(style ? { style } : {}),
    walls: [
      wall('A', 0, 0, 120, 0, { start: null, end: { wallId: 'B', endpoint: 'start' } }, runsA),
      wall('B', 120, 0, 120, 96, { start: { wallId: 'A', endpoint: 'end' }, end: null }, []),
    ],
  };
}

const anchoredRun = (overrides = {}) => ({
  id: 'r', cabinetTypeId: BASE, x: 24, width: 40, z: 4, height: 30.5, depth: 24,
  ends: { left: NONE, right: FILLER }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'manual', overrides: {}, anchors: { left: false, right: true },
  tFiller: 'seams',
  grid: gridFromItems('r', [cab('a')]),
  ...overrides,
});

const minimum = (run, style) => {
  const room = cornerRoom([run], style);
  return endMinWidthsForRun(room, room.walls[0], run, S);
};

describe('SPEC-37.1 a T end at an inside corner', () => {
  it('takes the cover off the corner filler minimum, so the flat is 1 1/2" like a plain filler', () => {
    expect(minimum(anchoredRun())).toEqual({ left: 1.5, right: 0.75 });
    expect(minimum(anchoredRun({ tFiller: undefined }))).toEqual({ left: 1.5, right: 1.5 });
    expect(minimum(anchoredRun({ tFiller: undefined, endFiller: { left: null, right: { tFiller: true } } })))
      .toEqual({ left: 1.5, right: 0.75 });
  });

  it('leaves plain fillers, other end types, wall-scribe ends and face frames as they were', () => {
    expect(minimum(anchoredRun({ endFiller: { left: null, right: { tFiller: false } } })))
      .toEqual({ left: 1.5, right: 1.5 });
    expect(minimum(anchoredRun({ ends: { left: NONE, right: { type: 'end_panel', width: null } } })))
      .toEqual({ left: 1.5, right: 1.5 });
    expect(minimum(anchoredRun({ anchors: { left: false, right: false } }))).toEqual({ left: 1.5, right: 1.5 });
    expect(minimum(anchoredRun(), { cabinetStyleId: 14 })).toEqual({ left: 1.5, right: 0.75 });
    expect(endCoverOn({ tFiller: 'all' }, 'left')).toBe(true);
    expect(endCoverOn({ tFiller: 'all', endFiller: { left: { tFiller: false } } }, 'left')).toBe(false);
    expect(endCoverOn({ endFiller: { right: { tFiller: true } } }, 'right')).toBe(true);
    expect(endCoverOn({}, 'right')).toBe(false);
  });
});

const PANEL = { type: 'end_panel', width: null };

function roomWith(run, style) {
  const wall = {
    id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
    joints: [], endPanels: { start: null, end: null }, landings: { start: null, end: null }, soffits: [],
  };
  return {
    id: 'room-1', name: 'Room 1', profile: { ...S.defaultProfile }, walls: [wall], wallOrder: ['wall-1'],
    ...(style ? { style } : {}),
  };
}

const panelRun = (overrides = {}) => ({
  id: 'r', cabinetTypeId: BASE, x: 24, width: 36.75, z: 4, height: 30.5, depth: 24,
  ends: { left: PANEL, right: NONE }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
  tFiller: 'seams',
  grid: gridFromItems('r', [cab('a', 18), cab('b', 18)]),
  ...overrides,
});

const pairRun = (overrides = {}) => panelRun({
  width: 37.5, ends: { left: PANEL, right: PANEL }, grid: gridFromItems('r', [cab('a', 36)]), ...overrides,
});

function context(run, style) {
  const room = roomWith(run, style);
  const wall = resolveWall(room, room.walls[0]);
  const layout = layoutRun(room, wall, run, S);
  return { room, wall, layout, cells: cellPieces(run, layout) };
}

const ellsOf = (run, style) => {
  const { room, cells } = context(run, style);
  return teeFillers(room, run, cells, S);
};

describe('SPEC-37.1 L-shaped end panels', () => {
  it('makes an end panel L-shaped: its thickness plus 3/4" over the box, with no rabbet', () => {
    const { ells, tees, covers, rabbets, notes } = ellsOf(panelRun());
    expect(ells).toEqual([{
      id: 'r:left', side: 'left', pieceId: 'r:left', x: 24, z: 4, width: 1.5, height: 30.5, drop: 0,
      boxIds: ['a'], lip: { start: 24.75, end: 25.5 },
    }]);
    expect(tees.map((tee) => tee.id)).toEqual(['tee:a|b']);
    expect(covers.get('a')).toEqual({ left: 0.75, right: 0.75, top: 0, bottom: 0 });
    expect(rabbets.get('a')).toBe('FF to rabbet right side for T-filler');
    expect(notes.get('r:left')).toEqual(['L-shape']);
  });

  it('is 1 9/16" with a 13/16" panel, mirrors on the right, and drops with an upper', () => {
    const thick = ellsOf(panelRun({ width: 36.8125, ends: { left: { type: 'end_panel', width: 0.8125 }, right: NONE } }));
    expect(thick.ells[0]).toMatchObject({ x: 24, width: 1.5625, lip: { start: 24.8125, end: 25.5625 } });
    expect(ellsOf(panelRun({ ends: { left: NONE, right: PANEL } })).ells).toEqual([{
      id: 'r:right', side: 'right', pieceId: 'r:right', x: 59.25, z: 4, width: 1.5, height: 30.5, drop: 0,
      boxIds: ['b'], lip: { start: 59.25, end: 60 },
    }]);
    const upper = ellsOf(panelRun({ cabinetTypeId: UPPER, z: 54, height: 30, depth: 12 }));
    expect(upper.ells[0]).toMatchObject({ z: 53.875, height: 30.125, drop: 0.125 });
  });

  it('follows the run unless the end has its own choice, and only on Euro', () => {
    expect(ellsOf(panelRun({ tFiller: undefined })).ells).toEqual([]);
    const own = panelRun({ tFiller: undefined, endFiller: { left: { tFiller: true }, right: null } });
    expect(ellsOf(own).ells.map((ell) => ell.id)).toEqual(['r:left']);
    const off = ellsOf(panelRun({ endFiller: { left: { tFiller: false }, right: null } }));
    expect(off.ells).toEqual([]);
    expect(off.covers.get('a').left).toBe(0);
    expect(ellsOf(panelRun(), { cabinetStyleId: 14 }).ells).toEqual([]);
  });

  it('gives the doors beside an L the REV-005/006 reveals', () => {
    const faces = (run) => {
      const { room, wall, layout } = context(run);
      return runFaceLayouts(room, wall, run, S, layout);
    };
    const single = faces(panelRun()).get('a');
    expect(single.reveals.values).toMatchObject({ left: 0.84375, right: 0.84375 });
    expect(single.faces[0]).toMatchObject({ x: 25.59375, width: 16.3125 });
    const pair = faces(pairRun()).get('a');
    expect(pair.reveals.values).toMatchObject({ left: 0.8125, right: 0.8125 });
    expect(pair.faces.map((face) => [face.half, face.x, face.width])).toEqual([
      ['left', 25.5625, 17.125], ['right', 42.8125, 17.125],
    ]);
  });
});

describe('SPEC-37.1 L-shaped end panels in plan and on the chain', () => {
  const plan = (run) => {
    const { room, wall, layout } = context(run);
    return planRunPieces(room, wall, run, S, layout, runFaceLayouts(room, wall, run, S, layout));
  };
  const byKey = (pieces, key) => pieces.find((piece) => piece.key === key);

  it('miters the panel into its lip, flush with the T-fillers', () => {
    const { faces } = plan(pairRun());
    expect(byKey(faces, 'r:left')).toEqual({
      key: 'r:left', kind: 'end_panel', start: 24, end: 24.75, back: 0, front: 24.8125,
      polygon: [[24, 0], [24.75, 0], [24.75, 24], [24, 24.8125]],
    });
    expect(byKey(faces, 'r:left:lip')).toEqual({
      key: 'r:left:lip', kind: 'end_panel', start: 24, end: 25.5, back: 24, front: 24.8125,
      polygon: [[24, 24.8125], [25.5, 24.8125], [25.5, 24], [24.75, 24]],
    });
    expect(byKey(faces, 'r:right')).toEqual({
      key: 'r:right', kind: 'end_panel', start: 60.75, end: 61.5, back: 0, front: 24.8125,
      polygon: [[60.75, 0], [61.5, 0], [61.5, 24.8125], [60.75, 24]],
    });
    expect(byKey(faces, 'r:right:lip')).toEqual({
      key: 'r:right:lip', kind: 'end_panel', start: 60, end: 61.5, back: 24, front: 24.8125,
      polygon: [[60, 24.8125], [61.5, 24.8125], [60.75, 24], [60, 24]],
    });
    const plain = plan(panelRun({ tFiller: undefined })).faces;
    expect(plain.some((face) => face.key.endsWith(':lip'))).toBe(false);
    expect(byKey(plain, 'r:left')).toEqual({ key: 'r:left', kind: 'end_panel', start: 24, end: 24.75, back: 0, front: 24.875 });
    expect(byKey(plan(panelRun({ outset: 2 })).faces, 'r:left:lip')).toMatchObject({
      back: 26, front: 26.8125, polygon: [[24, 26.8125], [25.5, 26.8125], [25.5, 26], [24.75, 26]],
    });
  });

  it('dimensions the L like a T: its face, then what\'s left of the box', () => {
    const room = roomWith(panelRun());
    const inner = horizontalChains(room, resolveWall(room, room.walls[0]), 'lower', S).inner
      .filter(({ kind }) => kind !== 'open');
    expect(inner.map(({ start, end, kind, pieceId }) => [start, end, kind, pieceId])).toEqual([
      [24, 25.5, 'piece', 'r:left'],
      [25.5, 42, 'piece', 'a'],
      [42, 43.5, 't-filler', 'tee:a|b'],
      [43.5, 60.75, 'piece', 'b'],
    ]);
  });
});
