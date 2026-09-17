import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import {
  cornerAt,
  cornerFillerMin,
  cornerReserve,
  cornerReserveParts,
  resolveHorizontal,
} from '../corners.js';
import { findCollisions } from '../footprints.js';
import { wallFrame } from '../geometry.js';
import {
  endCornerAnglesForRun,
  endMinWidthsForRun,
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

function roomWithCornerAngle(angle) {
  const direction = (180 - angle) * Math.PI / 180;
  return connectedRoom({
    wallB: {
      x2: 120 + 96 * Math.cos(direction),
      y2: 96 * Math.sin(direction),
    },
  });
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

describe('SPEC-6 angled corner clearance', () => {
  function reserveFixture(angle, runOverrides = {}) {
    const room = roomWithCornerAngle(angle);
    const run = cabinetRun('A-run', CABINET_TYPE_IDS.BASE, runOverrides);
    room.walls[1].runs = [cabinetRun('B-run', CABINET_TYPE_IDS.BASE, {
      anchors: { left: true, right: false },
    })];
    return { room, run };
  }

  it('1. keeps the 90-degree reserve at the neighboring front depth', () => {
    const { room, run } = reserveFixture(90);
    expect(cornerReserve(room, room.walls[0], 'right', run, DEFAULT_SETTINGS))
      .toBeCloseTo(24.875, 3);
  });

  it('2. adds the acute-angle back term and honors face and custom overrides', () => {
    const { room, run } = reserveFixture(60);
    const automatic = cornerReserveParts(room, room.walls[0], 'right', run, DEFAULT_SETTINGS);
    expect(automatic.face).toBeCloseTo(28.7232, 3);
    expect(automatic.back).toBeCloseTo(13.8564, 3);
    expect(automatic.total).toBeCloseTo(42.5796, 3);
    expect(automatic.source).toBe('auto');

    run.cornerClearance = { right: 'face' };
    const faceOnly = cornerReserveParts(room, room.walls[0], 'right', run, DEFAULT_SETTINGS);
    expect(faceOnly).toMatchObject({ source: 'face' });
    expect(faceOnly.face).toBeCloseTo(28.7232, 3);
    expect(faceOnly.back).toBeCloseTo(13.8564, 3);
    expect(faceOnly.total).toBeCloseTo(28.7232, 3);

    run.cornerClearance.right = 30;
    expect(cornerReserveParts(room, room.walls[0], 'right', run, DEFAULT_SETTINGS))
      .toMatchObject({ total: 30, source: 'custom' });
  });

  it('3. does not add a back term at a 135-degree corner', () => {
    const { room, run } = reserveFixture(135);
    const parts = cornerReserveParts(room, room.walls[0], 'right', run, DEFAULT_SETTINGS);
    expect(parts.face).toBeCloseTo(35.1786, 3);
    expect(parts.back).toBe(0);
    expect(parts.total).toBeCloseTo(35.1786, 3);
  });

  it('4. uses the current run depth for the acute-angle back term', () => {
    const { room, run } = reserveFixture(75, {
      cabinetTypeId: CABINET_TYPE_IDS.UPPER,
      depth: 12,
    });
    room.walls[1].runs[0] = cabinetRun('B-tall', CABINET_TYPE_IDS.TALL, {
      anchors: { left: true, right: false },
    });
    const parts = cornerReserveParts(room, room.walls[0], 'right', run, DEFAULT_SETTINGS);
    expect(parts.face).toBeCloseTo(25.7525, 3);
    expect(parts.back).toBeCloseTo(3.2154, 3);
    expect(parts.total).toBeCloseTo(28.9679, 3);
  });

  it('5. scales and clamps the corner filler minimum by angle', () => {
    expect(cornerFillerMin(DEFAULT_SETTINGS, 90)).toBeCloseTo(1.5, 3);
    expect(cornerFillerMin(DEFAULT_SETTINGS, 60)).toBeCloseTo(1.7321, 3);
    expect(cornerFillerMin(DEFAULT_SETTINGS, 135)).toBeCloseTo(2.1213, 3);
    expect(cornerFillerMin(DEFAULT_SETTINGS, 150)).toBeCloseTo(3, 3);
    expect(cornerFillerMin(DEFAULT_SETTINGS, 10)).toBe(6);
  });

  it('6. annotates only angled flex fillers with their corner angle', () => {
    const angled = reserveFixture(60);
    angled.run.anchors.right = true;
    const angledOptions = {
      endMinWidths: endMinWidthsForRun(
        angled.room,
        angled.room.walls[0],
        angled.run,
        DEFAULT_SETTINGS,
      ),
      endCornerAngles: endCornerAnglesForRun(
        angled.room,
        angled.room.walls[0],
        angled.run,
      ),
    };
    expect(angledOptions.endMinWidths.right).toBeCloseTo(1.7321, 3);
    const angledPiece = splitRun(angled.run, DEFAULT_SETTINGS, angledOptions).pieces
      .find((piece) => piece.role === 'end-right');
    expect(angledPiece.cornerAngle).toBeCloseTo(60, 6);

    const square = reserveFixture(90);
    square.run.anchors.right = true;
    const squarePiece = splitRun(square.run, DEFAULT_SETTINGS, {
      endMinWidths: endMinWidthsForRun(
        square.room,
        square.room.walls[0],
        square.run,
        DEFAULT_SETTINGS,
      ),
      endCornerAngles: endCornerAnglesForRun(
        square.room,
        square.room.walls[0],
        square.run,
      ),
    }).pieces.find((piece) => piece.role === 'end-right');
    expect(squarePiece).not.toHaveProperty('cornerAngle');
  });
});
