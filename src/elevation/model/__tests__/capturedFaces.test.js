import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { runFaceLayouts } from '../faceLayouts.js';
import { resolveWall } from '../room.js';
import { cabinetReveals, capturedFaces } from '../styles.js';

const { BASE, TALL } = CABINET_TYPE_IDS;
const S = DEFAULT_SETTINGS;
const EURO = { cabinetStyleId: 13, beadWidth: 0.25, profiledEdge: false };
const BOTH = { left: true, right: true };
const DOOR = { type: 'door', size: null };
const PAIR = { type: 'pair_door', size: null };
const DRAWER = { type: 'drawer_front', size: null };
const stack = (...children) => ({ direction: 'vertical', size: null, children });
const PD_3DF = stack(PAIR, { ...stack({ ...DRAWER, size: 5.875 }, DRAWER, DRAWER), size: 30.25 });
const SIDE_BY_SIDE = stack({ direction: 'horizontal', size: null, children: [DOOR, DOOR] }, DRAWER);

describe('SPEC-44 a captured cabinet with a pair door and single-wide faces', () => {
  it('gives the whole cabinet 3/32" sides and takes the difference out of the pair\'s gap', () => {
    expect([DOOR, PAIR, stack(DRAWER, DRAWER), PD_3DF, SIDE_BY_SIDE].map(capturedFaces))
      .toEqual(['single', null, 'single', 'mixed', null]);
    const mixed = cabinetReveals({ style: EURO, cabinetTypeId: TALL, face: PD_3DF, captured: BOTH, settings: S });
    expect([mixed.values.left, mixed.values.right, mixed.values.vertical, mixed.values.pair])
      .toEqual([0.09375, 0.09375, 0.125, 0.0625]);
    expect([mixed.sources.left, mixed.sources.right]).toEqual(['rule:captured-single', 'rule:captured-single']);
    // T-fillers both sides (REV-005/006): 27/32" sides, the pair still 1/16" apart.
    const tees = cabinetReveals({
      style: EURO, cabinetTypeId: TALL, face: PD_3DF, captured: BOTH,
      tCovers: { left: 0.75, right: 0.75, top: 0, bottom: 0 }, settings: S,
    });
    expect([tees.values.left, tees.values.right, tees.values.pair]).toEqual([0.84375, 0.84375, 0.0625]);
    // Captured one side only, a pair alone, or doors side by side: nothing changes.
    const oneSide = cabinetReveals({ style: EURO, cabinetTypeId: TALL, face: PD_3DF, captured: { left: true, right: false }, settings: S });
    expect([oneSide.values.left, oneSide.values.pair]).toEqual([0.0625, 0.125]);
    const pair = cabinetReveals({ style: EURO, cabinetTypeId: BASE, face: PAIR, captured: BOTH, settings: S });
    expect([pair.values.left, pair.values.pair]).toEqual([0.0625, 0.125]);
    const side = cabinetReveals({ style: EURO, cabinetTypeId: BASE, face: SIDE_BY_SIDE, captured: BOTH, settings: S });
    expect([side.values.left, side.values.pair, side.sources.left]).toEqual([0.0625, 0.125, 'style']);
  });

  it('keeps each pair door 14 7/8" on a 30" tall between end panels; they close to 1/16" apart', () => {
    const run = {
      id: 'run-1', cabinetTypeId: TALL, x: 24, width: 31.5, z: 4, height: 90, depth: 24,
      ends: { left: { type: 'end_panel', width: null }, right: { type: 'end_panel', width: null } },
      autoCount: false, maxCabinetWidth: null, items: [{ id: 'a', kind: 'cabinet', width: 30, face: PD_3DF }],
      heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
    };
    const wall = {
      id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
      flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
    };
    const room = {
      id: 'room-1', name: 'Room 1', profile: { ...S.defaultProfile }, walls: [wall], wallOrder: ['wall-1'],
    };
    const { faces } = runFaceLayouts(room, resolveWall(room, room.walls[0]), run, S).get('a');
    expect(faces.map(({ path, half, x, width }) => [path, half ?? null, x, width])).toEqual([
      ['r.0', 'left', 24.84375, 14.875],
      ['r.0', 'right', 39.78125, 14.875],
      ['r.1.0', null, 24.84375, 29.8125],
      ['r.1.1', null, 24.84375, 29.8125],
      ['r.1.2', null, 24.84375, 29.8125],
    ]);
  });
});
