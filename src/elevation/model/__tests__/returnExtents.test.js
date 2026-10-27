import { beforeEach, describe, expect, it } from 'vitest';
import { auto, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { cornerShapes } from '../cornerParts.js';
import { returnExtents } from '../index.js';
import { resolveWall, syncRoom } from '../room.js';
import { runSide } from '../runSide.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const expected = [{ wallId: 'W', runId: 'R', left: 35.125, right: 60 }];
let stored;

beforeEach(() => {
  stored = room({ walls: [
    wall({ id: 'H', x2: 120 }),
    wall({
      id: 'W', x1: 60, y1: 0, x2: 60, y2: 72, thickness: 0,
      landings: {
        start: { wallId: 'H', side: 'front', ref: 'left', to: 'near', offset: 60 },
        end: null,
      },
      runs: [run({ id: 'R', width: 48, items: [auto('cabinet')],
        anchors: { left: true, right: false } })],
    }),
  ] });
});

describe('DR3b landed return extents', () => {
  it('anchor 1: spans the Euro box and 13/16 inch doors, independently of run length', () => {
    const synced = syncRoom(stored, settings);
    const view = resolveWall(synced, synced.walls[0], 'front');
    expect(returnExtents(synced, view, settings)).toEqual(expected);
    expect(returnExtents(synced, resolveWall(synced, synced.walls[0], 'back'), settings)).toEqual([]);
    const shorter = syncRoom({ ...stored, walls: [stored.walls[0], {
      ...stored.walls[1], runs: [{ ...stored.walls[1].runs[0], width: 36 }],
    }] }, settings);
    expect(returnExtents(shorter, resolveWall(shorter, shorter.walls[0], 'front'), settings)).toEqual(expected);
  });

  it('anchor 2: ignores a wood top overhanging one inch', () => {
    stored.walls[1].runs[0].top = 'wood';
    stored.walls[1].runs[0].topOverhang = { front: 1 };
    const synced = syncRoom(stored, settings);
    const landed = resolveWall(synced, synced.walls[1], 'front');
    const pieces = runSide(synced, landed, landed.runs[0], settings);
    expect(pieces.find(({ piece }) => piece === 'countertop').front).toBe(25.875);
    expect(returnExtents(synced, resolveWall(synced, synced.walls[0], 'front'), settings)).toEqual(expected);
  });

  it('anchor 3: excludes a run whose end is not anchored into the host', () => {
    stored.walls[1].runs[0].anchors.left = false;
    const synced = syncRoom(stored, settings);
    expect(returnExtents(synced, resolveWall(synced, synced.walls[0], 'front'), settings)).toEqual([]);
  });

  it('anchor 4: keeps the box back at the near face of a 4.5 inch wall', () => {
    stored.walls[1].thickness = 4.5;
    stored.walls[1].thicknessOverride = 4.5;
    const synced = syncRoom(stored, settings);
    expect(returnExtents(synced, resolveWall(synced, synced.walls[0], 'front'), settings)).toEqual(expected);
  });

  it('excludes returns at connected inside corners', () => {
    stored.walls[0].connections.end = { wallId: 'W', endpoint: 'start' };
    Object.assign(stored.walls[1], {
      x1: 120, x2: 120,
      landings: { start: null, end: null },
      connections: { start: { wallId: 'H', endpoint: 'end' }, end: null },
    });
    const synced = syncRoom(stored, settings);
    const view = resolveWall(synced, synced.walls[0], 'front');
    expect(cornerShapes(synced, view, 'front', settings)).toEqual([
      expect.objectContaining({ kind: 'return', wallId: 'W', runId: 'R' }),
    ]);
    expect(returnExtents(synced, view, settings)).toEqual([]);
  });
});
