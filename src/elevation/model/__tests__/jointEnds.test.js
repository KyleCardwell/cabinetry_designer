import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { syncRoom } from '../room.js';
import { AUTO_NONE, joinedRooms } from './helpers/joinedRooms.js';

const S = DEFAULT_SETTINGS;

describe('SPEC-38.3 joined ends beside a back panel', () => {
  it('gives the cabinets an end panel; the back panel run still dies into them', () => {
    const runs = syncRoom(joinedRooms(), S).walls[0].runs;
    expect(runs.find(({ id }) => id === 'R').ends.left).toEqual({ type: 'end_panel', width: null, auto: true });
    expect(runs.find(({ id }) => id === 'L').ends.right).toEqual(AUTO_NONE);
  });
});
