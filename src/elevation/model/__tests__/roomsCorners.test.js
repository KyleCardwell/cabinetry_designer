import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import {
  cornerAt,
  cornerReserve,
  resolveHorizontal,
} from '../corners.js';
import { findCollisions } from '../footprints.js';
import { wallFrame } from '../geometry.js';
import {
  flipRunsForWall,
  syncRoom,
} from '../room.js';
import { splitRun } from '../splitRun.js';

function cabinetRun(id, type, overrides = {}) {
  return {
    id,
    cabinetTypeId: type,
    x: 0,
    width: 48,
    z: type === CABINET_TYPE_IDS.UPPER ? 54 : 4,
    height: type === CABINET_TYPE_IDS.UPPER ? 36 : 30.5,
    depth: type === CABINET_TYPE_IDS.UPPER ? 12 : 24,
    ends: {
      left: { type: 'filler', width: null },
      right: { type: 'filler', width: null },
    },
    autoCount: false,
    maxCabinetWidth: null,
    items: [{ id: `${id}-cab`, kind: 'cabinet', width: 45 }],
    heightMode: 'manual',
    overrides: {},
    anchors: { left: false, right: false },
    ...overrides,
  };
}

function connectedRoom(values = {}) {
  const wallA = {
    id: 'A',
    name: 'Wall A',
    x1: 0,
    y1: 0,
    x2: 120,
    y2: 0,
    height: 96,
    thickness: 4.5,
    flipped: false,
    connections: { start: null, end: { wallId: 'B', endpoint: 'start' } },
    profile: {},
    runs: [],
    ...values.wallA,
  };
  const wallB = {
    id: 'B',
    name: 'Wall B',
    x1: 120,
    y1: 0,
    x2: 120,
    y2: 96,
    height: 96,
    thickness: 4.5,
    flipped: false,
    connections: { start: { wallId: 'A', endpoint: 'end' }, end: null },
    profile: {},
    runs: [],
    ...values.wallB,
  };
  return {
    id: 'R',
    name: 'Room R',
    profile: { ...DEFAULT_SETTINGS.defaultProfile },
    walls: [wallA, wallB],
  };
}

describe('wall frames and corners', () => {
  it('7. resolves interior normals and elevation endpoints', () => {
    const room = connectedRoom();
    expect(wallFrame(room, room.walls[0])).toMatchObject({
      n: { x: 0, y: 1 },
      leftEndpoint: 'start',
    });
    expect(wallFrame(room, room.walls[1])).toMatchObject({
      n: { x: -1, y: 0 },
      leftEndpoint: 'start',
    });
    const reversed = connectedRoom({
      wallA: {
        x1: 120,
        y1: 0,
        x2: 0,
        y2: 0,
        connections: { start: { wallId: 'B', endpoint: 'start' }, end: null },
      },
      wallB: { connections: { start: { wallId: 'A', endpoint: 'start' }, end: null } },
    });
    expect(wallFrame(reversed, reversed.walls[0]).leftEndpoint).toBe('end');
  });

  it('8. classifies the connected right corner as inside', () => {
    const room = connectedRoom();
    expect(cornerAt(room, room.walls[0], 'right')).toMatchObject({
      type: 'inside',
      angle: 90,
      neighborWallId: 'B',
      neighborSide: 'left',
    });
    expect(cornerAt(room, room.walls[0], 'left')).toEqual({ type: 'open' });
  });

  it('9. distinguishes outside and straight connections', () => {
    const outside = connectedRoom({
      wallA: { flipped: true },
      wallB: { x2: 120, y2: -96 },
    });
    expect(cornerAt(outside, outside.walls[0], 'right').type).toBe('outside');
    const straight = connectedRoom({ wallB: { x2: 200, y2: 0 } });
    expect(cornerAt(straight, straight.walls[0], 'right').type).toBe('straight');
  });

  it('10. reserves neighboring base front depth at an inside corner', () => {
    const room = connectedRoom();
    room.walls[0].runs = [cabinetRun('A-base', CABINET_TYPE_IDS.BASE, {
      width: 60,
      anchors: { left: false, right: true },
    })];
    room.walls[1].runs = [cabinetRun('B-base', CABINET_TYPE_IDS.BASE, {
      anchors: { left: true, right: false },
    })];
    const synced = syncRoom(room, DEFAULT_SETTINGS);
    expect(synced.walls[0].runs[0].x).toBe(35.125);
    expect(synced.walls[1].runs[0].x).toBe(24.875);
  });

  it('11. uses no reserve when the neighboring wall has no runs', () => {
    const room = connectedRoom();
    room.walls[0].runs = [cabinetRun('A-base', CABINET_TYPE_IDS.BASE, {
      x: 60,
      width: 60,
      anchors: { left: false, right: true },
    })];
    const run = syncRoom(room, DEFAULT_SETTINGS).walls[0].runs[0];
    expect(run.x + run.width).toBe(120);
  });

  it('12. applies reserves only across compatible cabinet bands', () => {
    const room = connectedRoom();
    const aBase = cabinetRun('A-base', CABINET_TYPE_IDS.BASE);
    const aUpper = cabinetRun('A-upper', CABINET_TYPE_IDS.UPPER);
    const bUpper = cabinetRun('B-upper', CABINET_TYPE_IDS.UPPER, {
      anchors: { left: true, right: false },
    });
    room.walls[1].runs = [bUpper];
    expect(cornerReserve(room, room.walls[0], 'right', aBase, DEFAULT_SETTINGS)).toBe(0);
    expect(cornerReserve(room, room.walls[0], 'right', aUpper, DEFAULT_SETTINGS)).toBe(12.875);
    room.walls[1].runs = [cabinetRun('B-tall', CABINET_TYPE_IDS.TALL, {
      anchors: { left: true, right: false },
    })];
    expect(cornerReserve(room, room.walls[0], 'right', aBase, DEFAULT_SETTINGS)).toBe(24.875);
    expect(cornerReserve(room, room.walls[0], 'right', aUpper, DEFAULT_SETTINGS)).toBe(24.875);
  });

  it('13. flags unreserved overlaps but not two resolved anchored runs', () => {
    const room = connectedRoom();
    room.walls[0].runs = [cabinetRun('A-base', CABINET_TYPE_IDS.BASE, {
      x: 60,
      width: 60,
      anchors: { left: false, right: true },
    })];
    room.walls[1].runs = [cabinetRun('B-base', CABINET_TYPE_IDS.BASE, {
      x: 0,
      anchors: { left: false, right: false },
    })];
    expect(findCollisions(syncRoom(room, DEFAULT_SETTINGS), DEFAULT_SETTINGS))
      .toHaveLength(2);
    room.walls[1].runs[0].anchors.left = true;
    expect(findCollisions(syncRoom(room, DEFAULT_SETTINGS), DEFAULT_SETTINGS)).toEqual([]);
  });

  it('14. scales reserve by the sine of a 135-degree corner', () => {
    const room = connectedRoom({ wallB: { x2: 187.8823, y2: 67.8823 } });
    room.walls[1].runs = [cabinetRun('B-base', CABINET_TYPE_IDS.BASE, {
      anchors: { left: true, right: false },
    })];
    const reserve = cornerReserve(
      room,
      room.walls[0],
      'right',
      cabinetRun('A-base', CABINET_TYPE_IDS.BASE),
      DEFAULT_SETTINGS,
    );
    expect(reserve).toBeCloseTo(35.1786, 3);
  });

  it('15. resolves both anchors across the available wall span', () => {
    const room = connectedRoom();
    room.walls[0].runs = [cabinetRun('A-base', CABINET_TYPE_IDS.BASE, {
      anchors: { left: true, right: true },
    })];
    room.walls[1].runs = [cabinetRun('B-base', CABINET_TYPE_IDS.BASE, {
      anchors: { left: true, right: false },
    })];
    expect(syncRoom(room, DEFAULT_SETTINGS).walls[0].runs[0]).toMatchObject({
      x: 0,
      width: 95.125,
    });
  });

  it('16. mirrors runs when flipping a wall', () => {
    const wall = connectedRoom().walls[0];
    wall.runs = [cabinetRun('run', CABINET_TYPE_IDS.BASE, {
      x: 10,
      width: 30,
      anchors: { left: true, right: false },
      ends: {
        left: { type: 'end_panel', width: null },
        right: { type: 'filler', width: null },
      },
      items: [
        { id: 'a', kind: 'cabinet', width: null },
        { id: 'b', kind: 'cabinet', width: null },
      ],
    })];
    const flipped = flipRunsForWall(wall);
    expect(flipped.flipped).toBe(true);
    expect(flipped.runs[0]).toMatchObject({
      x: 80,
      anchors: { left: false, right: true },
      ends: { left: { type: 'filler' }, right: { type: 'end_panel' } },
    });
    expect(flipped.runs[0].items.map((item) => item.id)).toEqual(['b', 'a']);
  });

  it('17a. stores a one-sided anchor shrink and reports it directly', () => {
    const room = connectedRoom();
    room.walls[0].runs = [cabinetRun('A-base', CABINET_TYPE_IDS.BASE, {
      width: 110,
      anchors: { left: false, right: true },
    })];
    room.walls[1].runs = [cabinetRun('B-base', CABINET_TYPE_IDS.BASE, {
      anchors: { left: true, right: false },
    })];
    expect(syncRoom(room, DEFAULT_SETTINGS).walls[0].runs[0]).toMatchObject({
      x: 0,
      width: 95.125,
    });
    expect(resolveHorizontal(
      room.walls[0].runs[0],
      120,
      0,
      24.875,
      DEFAULT_SETTINGS,
    ).warnings).toContainEqual({ code: 'anchor-shrunk' });
  });

  it('17. applies the larger corner filler minimum only to the anchored side', () => {
    const settings = { ...DEFAULT_SETTINGS, cornerFillerMinWidth: 3 };
    const room = connectedRoom();
    room.walls[0].runs = [cabinetRun('A-base', CABINET_TYPE_IDS.BASE, {
      x: 60,
      width: 60,
      anchors: { left: false, right: true },
      autoCount: true,
      items: [],
    })];
    room.walls[1].runs = [cabinetRun('B-base', CABINET_TYPE_IDS.BASE, {
      anchors: { left: true, right: false },
    })];
    const synced = syncRoom(room, settings);
    const run = synced.walls[0].runs[0];
    const result = splitRun(run, settings, { endMinWidths: { left: 1.5, right: 3 } });
    const left = result.pieces.find((piece) => piece.role === 'end-left');
    const right = result.pieces.find((piece) => piece.role === 'end-right');
    expect(left.width).toBeGreaterThanOrEqual(1.5);
    expect(right.width).toBeGreaterThanOrEqual(3);
  });
});
