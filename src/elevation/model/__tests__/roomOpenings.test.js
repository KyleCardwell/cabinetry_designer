import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { elevationToPlan, wallFrame } from '../geometry.js';
import { openingGeometry } from '../openings.js';
import {
  compensateRuns,
  flipRunsForWall,
  roomDiagnostics,
  syncRoom,
} from '../room.js';
import { setWallLength } from '../../plan/wallOps.js';

function door(overrides = {}) {
  return {
    id: 'door-1',
    kind: 'door',
    label: 'D1',
    measureMode: 'jamb',
    width: 36,
    height: 80,
    sillZ: 0,
    offset: 24,
    offsetFrom: 'left',
    casing: { width: 3, thickness: 0.75 },
    ...overrides,
  };
}

function windowOpening(overrides = {}) {
  return {
    id: 'window-1',
    kind: 'window',
    label: 'W1',
    measureMode: 'jamb',
    width: 36,
    height: 48,
    sillZ: 36,
    offset: 12,
    offsetFrom: 'right',
    casing: { width: 3, thickness: 0.75 },
    ...overrides,
  };
}

function run(id, cabinetTypeId, overrides = {}) {
  const width = overrides.width ?? 30;
  return {
    id,
    cabinetTypeId,
    x: 0,
    width,
    z: cabinetTypeId === CABINET_TYPE_IDS.UPPER ? 54 : 4,
    height: 30.5,
    depth: cabinetTypeId === CABINET_TYPE_IDS.UPPER ? 12 : 24,
    ends: {
      left: { type: 'none', width: null },
      right: { type: 'none', width: null },
    },
    autoCount: false,
    maxCabinetWidth: null,
    items: [{ id: `${id}-cabinet`, kind: 'cabinet', width }],
    heightMode: 'manual',
    overrides: {},
    anchors: { left: false, right: false },
    ...overrides,
  };
}

function wall(values = {}) {
  return {
    id: 'W',
    name: '',
    numberOverride: null,
    x1: 0,
    y1: 0,
    x2: 120,
    y2: 0,
    height: 96,
    thickness: 4.5,
    flipped: false,
    connections: { start: null, end: null },
    profile: {},
    runs: [],
    openings: [],
    ...values,
  };
}

function room(targetWall) {
  return {
    id: 'room',
    name: 'Room',
    profile: { ...DEFAULT_SETTINGS.defaultProfile },
    wallOrder: [targetWall.id],
    walls: [targetWall],
  };
}

function blockWarnings(targetRoom, runId) {
  return roomDiagnostics(targetRoom, DEFAULT_SETTINGS)[runId].warnings
    .filter((warning) => warning.code === 'blocks-opening');
}

describe('room opening integration', () => {
  it('13. warns when a base run overlaps a door jamb but not when it touches', () => {
    const blockingRoom = room(wall({
      runs: [run('base', CABINET_TYPE_IDS.BASE, { width: 30 })],
      openings: [door()],
    }));
    expect(blockWarnings(blockingRoom, 'base')).toContainEqual({
      code: 'blocks-opening',
      openingId: 'door-1',
      label: 'D1',
    });

    const touchingRoom = room(wall({
      runs: [run('base', CABINET_TYPE_IDS.BASE, { width: 24 })],
      openings: [door()],
    }));
    expect(blockWarnings(touchingRoom, 'base')).toEqual([]);
  });

  it('14. ignores casing-only overlap between a base run and window', () => {
    const targetRoom = room(wall({
      runs: [run('base', CABINET_TYPE_IDS.BASE, { x: 72, width: 36 })],
      openings: [windowOpening()],
    }));
    expect(blockWarnings(targetRoom, 'base')).toEqual([]);
  });

  it('15. warns when an upper run overlaps the window jamb', () => {
    const targetRoom = room(wall({
      runs: [run('upper', CABINET_TYPE_IDS.UPPER, {
        x: 72,
        width: 36,
        z: 54,
        height: 30,
      })],
      openings: [windowOpening()],
    }));
    expect(blockWarnings(targetRoom, 'upper')).toContainEqual({
      code: 'blocks-opening',
      openingId: 'window-1',
      label: 'W1',
    });
  });

  it('16. keeps stored end offsets fixed when the wall length changes', () => {
    const targetWall = wall({
      openings: [
        door({ id: 'left', label: 'D1' }),
        door({ id: 'right', label: 'D2', offsetFrom: 'right' }),
      ],
    });
    const before = room(targetWall);
    const { walls } = setWallLength(before, targetWall.id, 132, 'right');
    const after = syncRoom(
      compensateRuns(before, { ...before, walls }),
      DEFAULT_SETTINGS,
    );
    const beforeLeft = openingGeometry(targetWall.openings[0], 120, DEFAULT_SETTINGS);
    const beforeRight = openingGeometry(targetWall.openings[1], 120, DEFAULT_SETTINGS);
    const [leftOpening, rightOpening] = after.walls[0].openings;
    const afterLeft = openingGeometry(leftOpening, 132, DEFAULT_SETTINGS);
    const afterRight = openingGeometry(rightOpening, 132, DEFAULT_SETTINGS);

    expect(leftOpening.offset).toBe(24);
    expect(rightOpening.offset).toBe(24);
    expect(afterLeft.offsets.left).toEqual(beforeLeft.offsets.left);
    expect(afterLeft.offsets.right.jamb - beforeLeft.offsets.right.jamb).toBe(12);
    expect(afterRight.offsets.right).toEqual(beforeRight.offsets.right);
    expect(afterRight.offsets.left.jamb - beforeRight.offsets.left.jamb).toBe(12);
  });

  it('17. flips the measured side without moving the jamb in plan', () => {
    const targetWall = wall({ openings: [door()] });
    const beforeRoom = room(targetWall);
    const beforeFrame = wallFrame(beforeRoom, targetWall);
    const beforeGeometry = openingGeometry(door(), beforeFrame.length, DEFAULT_SETTINGS);
    const beforePoints = [beforeGeometry.jamb.x, beforeGeometry.jamb.x + beforeGeometry.jamb.width]
      .map((x) => elevationToPlan(beforeFrame, x, 0));

    const flippedWall = flipRunsForWall(targetWall);
    const afterRoom = room(flippedWall);
    const afterFrame = wallFrame(afterRoom, flippedWall);
    const flippedOpening = flippedWall.openings[0];
    const afterGeometry = openingGeometry(flippedOpening, afterFrame.length, DEFAULT_SETTINGS);
    const afterPoints = [afterGeometry.jamb.x, afterGeometry.jamb.x + afterGeometry.jamb.width]
      .map((x) => elevationToPlan(afterFrame, x, 0))
      .reverse();

    expect(flippedOpening).toMatchObject({ offsetFrom: 'right', offset: 24 });
    expect(afterPoints).toEqual(beforePoints);
  });
});
