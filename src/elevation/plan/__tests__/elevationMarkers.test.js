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
        point: { x: 35, y: 42.875 },
        direction: { x: 0, y: 1 },
      },
      {
        key: 'H:back',
        wallId: 'H',
        side: 'back',
        letter: 'B',
        point: { x: 131, y: -52.375 },
        direction: { x: 0, y: -1 },
      },
    ]);
  });

  it('185. centres a marker on the span of the side runs', () => {
    const room = makeRoom([makeWall('H', 0, 0, 246, 0, { runs: [
      run('B1', CABINET_TYPE_IDS.BASE, 24, { x: 20 }),
      run('B2', CABINET_TYPE_IDS.BASE, 24, { x: 140, width: 40 }),
    ] })]);

    expect(elevationMarkers(room, DEFAULT_SETTINGS, 2)).toEqual([
      {
        key: 'H',
        wallId: 'H',
        side: 'front',
        letter: 'A',
        point: { x: 100, y: 42.875 },
        direction: { x: 0, y: 1 },
      },
    ]);
  });

  it('186. keeps the shifted wall-centre marker for a side with no runs', () => {
    const room = makeRoom([makeWall('H', 0, 0, 246, 0, { elevationForced: true })]);

    expect(elevationMarkers(room, DEFAULT_SETTINGS, 2)).toEqual([
      {
        key: 'H',
        wallId: 'H',
        side: 'front',
        letter: 'A',
        point: { x: 135, y: 18 },
        direction: { x: 0, y: 1 },
      },
    ]);
  });

  it('Kyle 2026-10-23: a combined elevation centres its marker on all its walls, past every face\'s cabinets', () => {
    const to = (wallId, endpoint) => ({ wallId, endpoint });
    const room = makeRoom([
      makeWall('A', 0, 0, 100, 0, { connections: { start: null, end: to('J', 'start') },
        runs: [run('A1', CABINET_TYPE_IDS.BASE, 24, { x: 10 })] }),
      makeWall('J', 100, 0, 100, 16, { connections: { start: to('A', 'end'), end: to('B', 'start') } }),
      makeWall('B', 100, 16, 160, 16, { connections: { start: to('J', 'end'), end: to('K', 'start') },
        runs: [run('B1', CABINET_TYPE_IDS.BASE, 24, { x: 0 })] }),
      makeWall('K', 160, 16, 160, 0, { connections: { start: to('B', 'end'), end: to('C', 'start') } }),
      makeWall('C', 160, 0, 240, 0, { connections: { start: to('K', 'end'), end: null },
        runs: [run('C1', CABINET_TYPE_IDS.BASE, 24, { x: 0 })] }),
    ]);
    const alone = elevationMarkers(room, DEFAULT_SETTINGS, 2);
    room.combinedElevations = [{ id: 'g', on: true, faces: ['A', 'B', 'C'] }];
    const markers = elevationMarkers(room, DEFAULT_SETTINGS, 2);
    expect(markers).toHaveLength(1);
    const [marker] = markers;
    const along = (m) => m.point.x * Math.abs(m.direction.y) + m.point.y * Math.abs(m.direction.x);
    const across = (m) => m.point.x * m.direction.x + m.point.y * m.direction.y;
    const walls = room.walls.filter(({ id }) => ['A', 'B', 'C'].includes(id));
    const ends = walls.flatMap((wall) => [wall.x1, wall.x2]);
    expect(along(marker)).toBeCloseTo((Math.min(...ends) + Math.max(...ends)) / 2, 6);
    for (const single of alone) expect(across(marker)).toBeGreaterThanOrEqual(across(single) - 1e-6);
  });
});
