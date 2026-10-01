import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { openingChain } from '../dimensions.js';
import { landWallEnd } from '../landings.js';
import { wallFaceSegments } from '../wallFaceRow.js';

const S = DEFAULT_SETTINGS;

const makeWall = (id, x1, y1, x2, y2, extra = {}) => ({
  id, name: '', numberOverride: null, elevationForced: false, x1, y1, x2, y2, height: 108, thickness: 4.5,
  flipped: false, connections: { start: null, end: null }, profile: {}, openings: [], joints: [], runs: [],
  endPanels: { start: null, end: null }, landings: { start: null, end: null }, soffits: [], ...extra,
});

const makeRoom = (walls) => ({
  id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: walls.map(({ id }) => id), walls,
});

/** A 36" door, 3" casing, its jamb 24" from the left: casing 21 to 63. */
const DOOR = {
  id: 'D', kind: 'door', label: 'D1', measureMode: 'jamb', width: 36, height: 80, sillZ: 0,
  offset: 24, offsetFrom: 'left', casing: { width: 3, thickness: 0.75 },
};
/** A 36" window, no casing, its jamb 12" from the right of a 246" wall: 198 to 234. */
const WINDOW = {
  id: 'W', kind: 'window', label: 'W1', measureMode: 'jamb', width: 36, height: 48, sillZ: 36,
  offset: 12, offsetFrom: 'right', casing: null,
};

const shown = (segments) => segments.map(({ start, end, kind }) => [kind, start, end]);
const host = (room) => room.walls.find(({ id }) => id === 'H');

describe('SPEC-36.3.1 the wall face row in plan', () => {
  it('dimensions each opening from outside casing to outside casing, or its jamb', () => {
    const room = makeRoom([makeWall('H', 0, 0, 246, 0, { openings: [DOOR, WINDOW] })]);
    expect(shown(wallFaceSegments(room, host(room), 'front', S))).toEqual([
      ['space', 0, 21],
      ['opening', 21, 63],
      ['space', 63, 198],
      ['opening', 198, 234],
      ['space', 234, 246],
    ]);
    expect(wallFaceSegments(room, host(room), 'back', S)).toEqual([]);
    const bare = makeRoom([makeWall('H', 0, 0, 246, 0)]);
    expect(wallFaceSegments(bare, host(bare), 'front', S)).toEqual([]);
  });

  it('puts the openings in one row with the wing walls on that face', () => {
    let room = makeRoom([
      makeWall('H', 0, 0, 246, 0, { openings: [DOOR] }),
      makeWall('W1', 120, 0, 120, 30, { thickness: 9 }),
    ]);
    room = landWallEnd(room, 'W1', 'start', { wallId: 'H', side: 'front', x: 120 });
    expect(shown(wallFaceSegments(room, host(room), 'front', S))).toEqual([
      ['space', 0, 21],
      ['opening', 21, 63],
      ['space', 63, 120],
      ['landing', 120, 129],
      ['space', 129, 246],
    ]);
  });
});

describe('SPEC-37.4 the wall row in elevation', () => {
  it('shows each wing wall at its thickness beside the doors and windows, with or without them', () => {
    const wing = makeWall('W1', 120, 0, 120, 30, { thickness: 9 });
    let room = makeRoom([makeWall('H', 0, 0, 246, 0, { openings: [DOOR] }), wing]);
    room = landWallEnd(room, 'W1', 'start', { wallId: 'H', side: 'front', x: 120 });
    expect(openingChain(room, host(room), S)).toEqual([
      { start: 0, end: 24, kind: 'gap' },
      { start: 24, end: 60, kind: 'opening', openingId: 'D', label: 'D1' },
      { start: 60, end: 120, kind: 'gap' },
      { start: 120, end: 129, kind: 'wall', wallId: 'W1' },
      { start: 129, end: 246, kind: 'gap' },
    ]);

    let bare = makeRoom([makeWall('H', 0, 0, 246, 0), wing]);
    expect(openingChain(bare, host(bare), S)).toEqual([]);
    bare = landWallEnd(bare, 'W1', 'start', { wallId: 'H', side: 'front', x: 120 });
    expect(openingChain(bare, host(bare), S)).toEqual([
      { start: 0, end: 120, kind: 'gap' },
      { start: 120, end: 129, kind: 'wall', wallId: 'W1' },
      { start: 129, end: 246, kind: 'gap' },
    ]);
  });
});
