import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { createRun, defaultsForType, inferRunType } from '../runDefaults.js';

describe('run defaults', () => {
  const wall = {
    id: 'A',
    x1: 0,
    y1: 0,
    x2: 120,
    y2: 0,
    profile: {},
    connections: { start: null, end: { wallId: 'B', endpoint: 'start' } },
    runs: [],
  };
  const wallB = {
    id: 'B',
    x1: 120,
    y1: 0,
    x2: 120,
    y2: 96,
    profile: {},
    connections: { start: { wallId: 'A', endpoint: 'end' }, end: null },
    runs: [],
  };
  const room = {
    id: 'R',
    profile: { ...DEFAULT_SETTINGS.defaultProfile },
    walls: [wall, wallB],
  };
  const ctx = { settings: DEFAULT_SETTINGS, room, wall };

  it.each([
    [2, 30, CABINET_TYPE_IDS.BASE],
    [50, 80, CABINET_TYPE_IDS.UPPER],
    [1, 90, CABINET_TYPE_IDS.TALL],
  ])('infers the type for bottom %s and top %s', (bottomZ, topZ, expected) => {
    expect(inferRunType(bottomZ, topZ)).toBe(expected);
  });

  it('creates a base run with snapped default geometry', () => {
    const run = createRun({ x: 0, width: 60, bottomZ: 2, topZ: 30 }, ctx);

    expect(run).toMatchObject({
      cabinetTypeId: CABINET_TYPE_IDS.BASE,
      z: 4,
      height: 30.5,
      depth: 24,
    });
  });

  it('creates an upper run with snapped default geometry', () => {
    const run = createRun({ x: 0, width: 60, bottomZ: 50, topZ: 80 }, ctx);

    expect(run).toMatchObject({
      cabinetTypeId: CABINET_TYPE_IDS.UPPER,
      z: 54,
      height: 36,
      depth: 12,
    });
  });

  it('creates a tall run with snapped default geometry', () => {
    const run = createRun({ x: 0, width: 60, bottomZ: 1, topZ: 90 }, ctx);

    expect(run).toMatchObject({
      cabinetTypeId: CABINET_TYPE_IDS.TALL,
      z: 4,
      height: 86,
      depth: 24,
    });
  });

  it('rounds drawn geometry when height snapping is disabled', () => {
    const settings = { ...DEFAULT_SETTINGS, snapHeightsToDefaults: false };
    const run = createRun(
      { x: 1.24, width: 60.26, bottomZ: 49.74, topZ: 80.26 },
      { settings, room, wall },
    );

    expect(run).toMatchObject({ x: 1, width: 60.5, z: 49.5, height: 30.5 });
  });

  it('clamps drawn horizontal bounds to the configured overhang range', () => {
    const left = createRun(
      { x: -50, width: 60, bottomZ: 2, topZ: 30 },
      ctx,
    );
    const right = createRun(
      { x: 150, width: 60, bottomZ: 2, topZ: 30 },
      ctx,
    );

    expect(left).toMatchObject({ x: -36, width: 46 });
    expect(right).toMatchObject({ x: 150, width: 6 });
  });

  it('returns the configured defaults for each type', () => {
    expect(defaultsForType(CABINET_TYPE_IDS.BASE, DEFAULT_SETTINGS)).toEqual({ z: 4, height: 30.5, depth: 24 });
    expect(defaultsForType(CABINET_TYPE_IDS.UPPER, DEFAULT_SETTINGS)).toEqual({ z: 54, height: 36, depth: 12 });
    expect(defaultsForType(CABINET_TYPE_IDS.TALL, DEFAULT_SETTINGS)).toEqual({ z: 4, height: 86, depth: 24 });
  });

  it('5. anchors a nearby open end and gives it an end panel', () => {
    const run = createRun({ x: 2, width: 60, bottomZ: 2, topZ: 30 }, ctx);

    expect(run).toMatchObject({
      anchors: { left: true, right: false },
      ends: { left: { type: 'end_panel' }, right: { type: 'end_panel' } },
    });
  });

  it('6. adds end panels to both free sides away from corners', () => {
    const run = createRun({ x: 6, width: 60, bottomZ: 2, topZ: 30 }, ctx);

    expect(run).toMatchObject({
      anchors: { left: false, right: false },
      ends: { left: { type: 'end_panel' }, right: { type: 'end_panel' } },
    });
  });

  it('7. anchors an edge within three inches of an inside corner', () => {
    const run = createRun({ x: 58.5, width: 60, bottomZ: 2, topZ: 30 }, ctx);

    expect(run).toMatchObject({
      anchors: { left: false, right: true },
      ends: { left: { type: 'end_panel' }, right: { type: 'filler', width: null } },
    });
  });

  it('8. uses the default end beside a band-compatible adjacent run', () => {
    const adjacentWall = {
      ...wall,
      runs: [{ cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width: 60 }],
    };
    const adjacentRoom = { ...room, walls: [adjacentWall, wallB] };
    const run = createRun(
      { x: 60.5, width: 30, bottomZ: 2, topZ: 30 },
      { settings: DEFAULT_SETTINGS, room: adjacentRoom, wall: adjacentWall },
    );

    expect(run.ends).toMatchObject({
      left: { type: DEFAULT_SETTINGS.defaultEnds.left },
      right: { type: 'end_panel' },
    });
  });

  it('9. falls back to default ends when automatic end panels are disabled', () => {
    const settings = { ...DEFAULT_SETTINGS, autoEndPanelOnFreeEnd: false };
    const run = createRun(
      { x: 6, width: 60, bottomZ: 2, topZ: 30 },
      { settings, room, wall },
    );

    expect(run.ends).toEqual({
      left: { type: settings.defaultEnds.left, width: null },
      right: { type: settings.defaultEnds.right, width: null },
    });
  });

  it('10. uses a three-inch corner snap distance', () => {
    const run = createRun({ x: 55, width: 60, bottomZ: 2, topZ: 30 }, ctx);

    expect(DEFAULT_SETTINGS.cornerSnapDistance).toBe(3);
    expect(run.anchors.right).toBe(false);
    expect(run.ends.right.type).toBe('end_panel');
  });

  it('11a. uses different end treatments for inside and open anchors', () => {
    const inside = createRun(
      { x: 1.5, width: 60, bottomZ: 2, topZ: 30 },
      { settings: DEFAULT_SETTINGS, room, wall: wallB },
    );
    const open = createRun(
      { x: 1.5, width: 60, bottomZ: 2, topZ: 30 },
      ctx,
    );

    expect(inside).toMatchObject({
      anchors: { left: true },
      ends: { left: { type: 'filler', width: null } },
    });
    expect(open).toMatchObject({
      anchors: { left: true },
      ends: { left: { type: 'end_panel', width: null } },
    });
  });

  it('11. auto-anchors near an outside corner but not beyond the snap distance', () => {
    const outsideWall = { ...wall, flipped: true };
    const outsideNeighbor = { ...wallB, x2: 120, y2: -96 };
    const outsideRoom = { ...room, walls: [outsideWall, outsideNeighbor] };
    const outsideContext = {
      settings: DEFAULT_SETTINGS,
      room: outsideRoom,
      wall: outsideWall,
    };
    const near = createRun(
      { x: 59, width: 60, bottomZ: 2, topZ: 30 },
      outsideContext,
    );
    const far = createRun(
      { x: 54, width: 60, bottomZ: 2, topZ: 30 },
      outsideContext,
    );

    expect(near).toMatchObject({
      anchors: { right: true },
      ends: { right: { type: 'end_panel', width: null } },
    });
    expect(far.anchors.right).toBe(false);
  });
});
