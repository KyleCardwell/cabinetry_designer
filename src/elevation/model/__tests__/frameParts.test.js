import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { verticalChains } from '../dimensions.js';
import { layoutRun } from '../faceLayouts.js';
import { boxInsets, frameBadgeAnchor, frameMembers, frameRegions, frameVerticalChains, groupMembers } from '../frames.js';
import { gridFromItems } from '../grid.js';
import { partNumbers, wallBadgeGroups } from '../partNumbers.js';
import { resolveWall } from '../room.js';

const S = DEFAULT_SETTINGS;
const INSET = { cabinetStyleId: 14 };
const NONE = { type: 'none', width: null };
const cell = (col, row, node) => ({ col, row, colSpan: 1, rowSpan: 1, node });

function roomWith(run, style) {
  const wall = {
    id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
  };
  return {
    id: 'room-1', name: 'Room 1', profile: { ...S.defaultProfile }, walls: [wall], wallOrder: ['wall-1'],
    ...(style ? { style } : {}),
  };
}

/** SPEC-36.2 BW: an inset base in a 48" space, no end pieces, two auto cabinets. */
const baseRun = (overrides = {}) => ({
  id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 24, width: 48, z: 4, height: 30.5, depth: 24,
  ends: { left: NONE, right: NONE }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
  grid: gridFromItems('r', [{ id: 'a', kind: 'cabinet', width: null }, { id: 'b', kind: 'cabinet', width: null }]),
  ...overrides,
});

function framed(run, style = INSET) {
  const room = roomWith(run, style);
  const wall = resolveWall(room, room.walls[0]);
  const cells = cellPieces(run, layoutRun(room, wall, run, S));
  return { room, wall, cells, frames: frameRegions(room, run, cells, S) };
}

describe('SPEC-36.2 box widths', () => {
  it('keeps framed boxes at full slot width on run-end sides', () => {
    const { cells, frames } = framed(baseRun());
    expect(cells.pieces.map(({ id, width }) => [id, width])).toEqual([['a', 24], ['b', 24]]);
    const insets = boxInsets(frames, cells, S);
    expect(insets.get('a')).toEqual({ left: 0, right: 0 });
    expect(insets.get('b')).toEqual({ left: 0, right: 0 });
    expect(boxInsets(framed(baseRun(), null).frames, cells, S).size).toBe(0);

    const split = framed(baseRun({
      grid: {
        id: 'r:grid',
        cols: [{ id: 's:col', size: null, sizeMode: 'auto' }, { id: 'b:col', size: null, sizeMode: 'auto' }],
        rows: [{ id: 'r:row', size: null, sizeMode: 'auto' }],
        cells: [
          cell(0, 0, {
            id: 's',
            cols: [{ id: 's:c', size: null, sizeMode: 'auto' }],
            rows: [{ id: 's:t', size: null, sizeMode: 'auto' }, { id: 's:u', size: null, sizeMode: 'auto' }],
            cells: [cell(0, 0, { id: 't', kind: 'cabinet' }), cell(0, 1, { id: 'u', kind: 'cabinet' })],
          }),
          cell(1, 0, { id: 'b', kind: 'cabinet' }),
        ],
      },
    }));
    const stacked = boxInsets(split.frames, split.cells, S);
    expect(['t', 'u', 's', 'b'].map((id) => stacked.get(id))).toEqual([
      { left: 0, right: 0 }, { left: 0, right: 0 }, undefined, { left: 0, right: 0 },
    ]);

    // End-gap reach must not join boxes across an interior void: those free sides still inset.
    const interior = framed(baseRun({
      _frame: { thickness: 0.8125, drop: 0, bead: 0 },
      grid: gridFromItems('r', [
        { id: 'a', kind: 'cabinet', width: null },
        { id: 'v', kind: 'void', width: 1 },
        { id: 'b', kind: 'cabinet', width: null },
      ]),
    }));
    const interiorInsets = boxInsets(interior.frames, interior.cells, S);
    expect(interiorInsets.get('a')).toEqual({ left: 0, right: 0.75 });
    expect(interiorInsets.get('b')).toEqual({ left: 0.75, right: 0 });
  });
});

const OPENINGS_A = [
  { path: 'r', x: 25.5, z: 5.5, width: 15.75, height: 27.5 },
  { path: 'r', x: 42.75, z: 5.5, width: 15.75, height: 27.5 },
];
const REGION_A = { id: 'frame:a', x: 24, z: 4, width: 36, height: 30.5 };
const REGION_D = { id: 'frame:d', x: 0, z: 0, width: 30, height: 30 };
const OPENINGS_D = [
  { path: 'r.0', x: 1.5, z: 22.5, width: 27, height: 6 },
  { path: 'r.1.0', x: 1.5, z: 1.5, width: 12.75, height: 19.5 },
  { path: 'r.1.1', x: 15.75, z: 1.5, width: 12.75, height: 19.5 },
];

describe('SPEC-36.2 the frame as a part', () => {
  it('cuts stiles full height, rails between them, and mullions between the rails', () => {
    expect(groupMembers(frameMembers(REGION_A, OPENINGS_A))).toEqual([
      { kind: 'stile', width: 1.5, length: 30.5, count: 3 },
      { kind: 'rail', width: 1.5, length: 15.75, count: 4 },
    ]);
    const members = frameMembers(REGION_D, OPENINGS_D);
    expect(members).toEqual([
      { kind: 'stile', x: 0, z: 0, width: 1.5, height: 30 },
      { kind: 'stile', x: 28.5, z: 0, width: 1.5, height: 30 },
      { kind: 'rail', x: 1.5, z: 0, width: 27, height: 1.5 },
      { kind: 'rail', x: 1.5, z: 21, width: 27, height: 1.5 },
      { kind: 'rail', x: 1.5, z: 28.5, width: 27, height: 1.5 },
      { kind: 'mullion', x: 14.25, z: 1.5, width: 1.5, height: 19.5 },
    ]);
    expect(groupMembers(members)).toEqual([
      { kind: 'stile', width: 1.5, length: 30, count: 2 },
      { kind: 'rail', width: 1.5, length: 27, count: 3 },
      { kind: 'mullion', width: 1.5, length: 19.5, count: 1 },
    ]);
    expect(frameMembers({ x: 0, z: 0, width: 3, height: 3 }, [
      { x: 0, z: 0, width: 2, height: 1 }, { x: 2, z: 0, width: 1, height: 2 },
      { x: 1, z: 2, width: 2, height: 1 }, { x: 0, z: 1, width: 1, height: 2 },
    ])).toBeNull();
  });

  it('chains each different stack of openings bottom to top', () => {
    expect(frameVerticalChains(REGION_A, OPENINGS_A)).toEqual([{
      id: 'frame:a:v0', axis: 'row', x: 25.5, z: 4, width: 15.75, height: 30.5,
      tracks: [
        { id: 'frame:a:v0:0', kind: 'frame', start: 4, end: 5.5, manual: false },
        { id: 'frame:a:v0:1', kind: 'frame-opening', start: 5.5, end: 33, manual: false },
        { id: 'frame:a:v0:2', kind: 'frame', start: 33, end: 34.5, manual: false },
      ],
    }]);
    expect(frameVerticalChains(REGION_D, OPENINGS_D)[0].tracks.map(({ kind, start, end }) => [kind, start, end]))
      .toEqual([
        ['frame', 0, 1.5], ['frame-opening', 1.5, 21], ['frame', 21, 22.5],
        ['frame-opening', 22.5, 28.5], ['frame', 28.5, 30],
      ]);
  });

  it('numbers each frame once after its run\'s pieces, and badges it', () => {
    const room = roomWith(baseRun(), INSET);
    const parts = partNumbers(room, S).parts.filter((part) => part.runId === 'r');
    expect(parts.map(({ key, kind }) => [key, kind])).toEqual([['a', 'cabinet'], ['b', 'cabinet'], ['frame:a', 'frame']]);
    expect(parts[2]).toMatchObject({ width: 48, pieceId: null });
    expect(wallBadgeGroups(room, resolveWall(room, room.walls[0]), S)
      .map(({ key, lift, pieces }) => [key, lift, pieces.map(({ id }) => id)])).toEqual([
      ['run:r', 0, ['a', 'b']],
      ['frame:a', 2, ['frame:a']],
    ]);
    expect(partNumbers(roomWith(baseRun()), S).parts.some(({ kind }) => kind === 'frame')).toBe(false);
  });
});

describe('SPEC-36.2.1 the frame on the wall chain and its badge', () => {
  it('dimensions the frame up the wall in place of the box', () => {
    const room = roomWith(baseRun(), INSET);
    const wall = resolveWall(room, room.walls[0]);
    expect(verticalChains(room, wall, { lowerRun: room.walls[0].runs[0], upperRun: null }, S, 'left').inner)
      .toEqual([
        { start: 0, end: 4, kind: 'toe-kick' },
        { start: 4, end: 5.5, kind: 'frame' },
        { start: 5.5, end: 33, kind: 'frame-opening' },
        { start: 33, end: 34.5, kind: 'frame' },
        { start: 34.5, end: 36, kind: 'countertop' },
        { start: 36, end: 96, kind: 'open' },
      ]);
    const euro = roomWith(baseRun());
    expect(verticalChains(euro, resolveWall(euro, euro.walls[0]), { lowerRun: euro.walls[0].runs[0], upperRun: null }, S, 'right')
      .inner[1]).toEqual({ start: 4, end: 34.5, kind: 'box' });
  });

  it('points the frame badge at the stile nearest the frame\'s centre', () => {
    expect(frameBadgeAnchor(REGION_A, frameMembers(REGION_A, OPENINGS_A))).toEqual({ x: 42, z: 19.25 });
    expect(frameBadgeAnchor({ x: 24, z: 4, width: 18, height: 30.5 }, [
      { kind: 'stile', x: 24, z: 4, width: 1.5, height: 30.5 },
      { kind: 'stile', x: 40.5, z: 4, width: 1.5, height: 30.5 },
    ])).toEqual({ x: 24.75, z: 19.25 });
    expect(frameBadgeAnchor(REGION_A, null)).toEqual({ x: 42, z: 19.25 });

    const room = roomWith(baseRun(), INSET);
    const frame = wallBadgeGroups(room, resolveWall(room, room.walls[0]), S)
      .find(({ key }) => key === 'frame:a');
    expect(frame.lift).toBe(2);
    expect(frame.pieces[0].anchor).toEqual({ x: 48, z: 19.25 });
  });
});
