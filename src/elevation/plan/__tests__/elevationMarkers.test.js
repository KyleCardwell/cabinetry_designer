import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { elevationMarkers } from '../elevationMarkers.js';

function makeWall(id, x1, y1, x2, y2, overrides = {}) {
  return {
    id,
    name: '',
    numberOverride: null,
    elevationForced: false,
    x1,
    y1,
    x2,
    y2,
    height: 108,
    thickness: 4.5,
    flipped: false,
    connections: { start: null, end: null },
    profile: {},
    openings: [],
    joints: [],
    runs: [],
    endPanels: { start: null, end: null },
    landings: { start: null, end: null },
    soffits: [],
    ...overrides,
  };
}

function makeRoom(walls) {
  return {
    id: 'room',
    name: 'Room',
    profile: { ...DEFAULT_SETTINGS.defaultProfile },
    wallOrder: walls.map((wall) => wall.id),
    walls,
  };
}

const run = (id, cabinetTypeId, depth, overrides = {}) => ({
  id,
  cabinetTypeId,
  x: 0,
  width: 30,
  z: 0,
  height: 30,
  depth,
  ends: {
    left: { type: 'end_panel', width: null },
    right: { type: 'end_panel', width: null },
  },
  anchors: { left: false, right: false },
  items: [],
  wallSide: 'front',
  ...overrides,
});

describe('elevationMarkers', () => {
  it('178. places front and back markers past the deepest run', () => {
    const room = makeRoom([makeWall('H', 0, 0, 246, 0, { runs: [
      run('B1', CABINET_TYPE_IDS.BASE, 24, { x: 20 }),
      run('U1', CABINET_TYPE_IDS.UPPER, 12, { x: 100, wallSide: 'back' }),
    ] })]);

    expect(elevationMarkers(room, DEFAULT_SETTINGS, 2)).toEqual([
      {
        key: 'H',
        wallId: 'H',
        side: 'front',
        letter: 'A',
        point: { x: 135, y: 42.875 },
        direction: { x: 0, y: 1 },
      },
      {
        key: 'H:back',
        wallId: 'H',
        side: 'back',
        letter: 'B',
        point: { x: 111, y: -35.375 },
        direction: { x: 0, y: -1 },
      },
    ]);
  });
});
