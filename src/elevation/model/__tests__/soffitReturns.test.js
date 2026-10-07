import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { landWallEnd } from '../landings.js';
import { soffitReturns } from '../soffits.js';
import { wallSideView } from '../wallSides.js';

const S = DEFAULT_SETTINGS;
const makeWall = (id, x1, y1, x2, y2, extra = {}) => ({
  id, name: '', numberOverride: null, elevationForced: false, x1, y1, x2, y2, height: 108, thickness: 4.5,
  flipped: false, connections: { start: null, end: null }, profile: {}, openings: [], joints: [], runs: [],
  endPanels: { start: null, end: null }, landings: { start: null, end: null }, soffits: [], ...extra,
});
const makeRoom = (walls) => ({
  id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: walls.map(({ id }) => id), walls,
});
const END = { to: 'end', offset: 0 };
const soffit = (id, anchors, extra = {}) => ({
  id, wallSide: 'front', x: 0, width: 30, bottom: 84, depth: 14, molding: 'crown', anchors, ...extra,
});

describe('SPEC-38.1 soffit returns', () => {
  it('shows a soffit anchored into a connected inside corner on the other wall', () => {
    // A (0,0)→(120,0), B (120,0)→(120,96): A's right corner is inside, B's left side.
    const room = makeRoom([
      makeWall('A', 0, 0, 120, 0, {
        height: 96,
        connections: { start: null, end: { wallId: 'B', endpoint: 'start' } },
        soffits: [soffit('SA', { left: false, right: END }, { x: 60, width: 60, bottom: 80, depth: 12 })],
      }),
      makeWall('B', 120, 0, 120, 96, {
        height: 96,
        connections: { start: { wallId: 'A', endpoint: 'end' }, end: null },
        soffits: [
          soffit('SB', { left: END, right: false }),
          soffit('SX', { left: false, right: false }, { x: 40 }),
        ],
      }),
    ]);
    expect(soffitReturns(room, room.walls[0])).toEqual([
      { key: 'right:B:SB', wallId: 'B', soffitId: 'SB', x: 106, width: 14, bottom: 84, top: 96 },
    ]);
    expect(soffitReturns(room, room.walls[1])).toEqual([
      { key: 'left:A:SA', wallId: 'A', soffitId: 'SA', x: 0, width: 12, bottom: 80, top: 96 },
    ]);
  });

  it('shows soffits between a host and its wing wall on each other\'s elevation', () => {
    // W1 lands on H's front at 120 (its 9" thickness covers 120–129). W1's front faces H's 0–120 part,
    // its back faces 129–240; its start (at H) is the left end of its front and the right end of its back.
    let room = makeRoom([
      makeWall('H', 0, 0, 240, 0, {
        soffits: [soffit('SH', { left: false, right: { to: 'wall', wallId: 'W1', offset: 0 } }, {
          x: 60, width: 60, bottom: 90, depth: 12,
        })],
      }),
      makeWall('W1', 120, 0, 120, 30, {
        thickness: 9,
        soffits: [
          soffit('SW', { left: END, right: false }),
          soffit('SWB', { left: false, right: END }, { wallSide: 'back' }),
        ],
      }),
    ]);
    room = landWallEnd(room, 'W1', 'start', { wallId: 'H', side: 'front', x: 120 });
    const host = room.walls.find(({ id }) => id === 'H');
    const wing = room.walls.find(({ id }) => id === 'W1');
    expect(soffitReturns(room, wallSideView(host, 'front'))).toEqual([
      { key: 'landing:W1:left:SWB', wallId: 'W1', soffitId: 'SWB', x: 129, width: 14, bottom: 84, top: 108 },
      { key: 'landing:W1:right:SW', wallId: 'W1', soffitId: 'SW', x: 106, width: 14, bottom: 84, top: 108 },
    ]);
    expect(soffitReturns(room, wallSideView(wing, 'front'))).toEqual([
      { key: 'left:H:SH', wallId: 'H', soffitId: 'SH', x: 0, width: 12, bottom: 90, top: 108 },
    ]);
  });
});
