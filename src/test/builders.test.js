import { describe, expect, it } from 'vitest';
import { syncRoom } from '../elevation/model/room.js';
import { DEFAULT_SETTINGS } from '../elevation/model/constants.js';
import { auto, room, run, wall } from './builders.js';

describe('shared test builders', () => {
  it('builds a wall with the app defaults, overrides and extra keys', () => {
    const built = wall({ x2: 96, side: 'back' });
    expect(built).toMatchObject({ id: 'wall-1', x1: 0, x2: 96, y1: 0, height: 96, runs: [], soffits: [] });
    expect(built.side).toBe('back');
  });

  it('builds a room that syncs with a run of auto cabinets', () => {
    const synced = syncRoom(room({ walls: [wall({ runs: [run({ items: [auto('a'), auto('b')] })] })] }), DEFAULT_SETTINGS);
    expect(synced.wallOrder).toEqual(['wall-1']);
    expect(synced.walls[0].runs).toHaveLength(1);
  });
});
