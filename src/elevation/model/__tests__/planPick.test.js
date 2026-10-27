import { beforeEach, describe, expect, it } from 'vitest';
import { opening, room, run, wall } from '../../../test/builders.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { runFootprint } from '../footprints.js';
import { elevationToPlan } from '../geometry.js';
import { planPickStack, pointNearPolygon } from '../planPick.js';
import { syncRoom } from '../roomSync.js';
import { wallLabel } from '../topology.js';
import { wallOutline } from '../wallOutline.js';
import { wallSideFrame } from '../wallSides.js';

const settings = { ...DEFAULT_SETTINGS };
const keys = (candidates) => candidates.map(({ key }) => key);
const point = (model, x, off, side = 'front') => (
  elevationToPlan(wallSideFrame(model, model.walls[0], side), x, off)
);

describe('planPickStack', () => {
  let model;
  beforeEach(() => {
    model = room({ walls: [wall({
      id: 'W1', x2: 120, thickness: 0,
      runs: [run({ id: 'B', x: 10, width: 60, depth: 24 })],
    })] });
  });

  it.each([
    [1, 40, 12, 0, false, 0, false, ['run:B', 'wall:W1']],
    [2, 40, 0.5, 1, false, 0, false, ['run:B', 'wall:W1']],
    [3, 90, 0.5, 1, false, 0, false, ['wall:W1']],
    [4, 90, 3, 1, false, 0, false, []],
    [5, 40, 6, 0, true, 0, false, ['run:U', 'run:B', 'wall:W1']],
    [6, 40, 18, 0, true, 0, false, ['run:B', 'wall:W1']],
    [7, 40, -2, 0, false, 4.5, false, ['wall:W1']],
    [8, 95, 0.5, 1, false, 0, true, ['opening:door-1', 'wall:W1']],
  ])('anchor %i: picks at P(%s, %s)', (_anchor, x, off, tolerance, upper, thickness, door, expected) => {
    model.walls[0].thicknessOverride = thickness;
    if (upper) model.walls[0].runs.push(run({
      id: 'U', x: 10, width: 60, depth: 12, cabinetTypeId: CABINET_TYPE_IDS.UPPER,
    }));
    if (door) model.walls[0].openings.push(opening({ offset: 80 }));
    model = syncRoom(model, settings);
    expect(keys(planPickStack(model, point(model, x, off), settings, { tolerance }))).toEqual(expected);
  });

  it('anchor 9: supplies labels, selections, host ids and plan outlines', () => {
    model = syncRoom(model, settings);
    const host = model.walls[0];
    expect(planPickStack(model, point(model, 40, 12), settings)).toEqual([
      {
        kind: 'run', key: 'run:B', label: 'Base run 60"', wallId: 'W1',
        selection: { runId: 'B', pieceId: null },
        outline: runFootprint(wallSideFrame(model, host), host.runs[0], settings),
      },
      {
        kind: 'wall', key: 'wall:W1', label: wallLabel(model, host), wallId: 'W1',
        selection: null, outline: wallOutline(model, host),
      },
    ]);
  });

  it('anchor 10: lists a nearby adjoining wall before the run host', () => {
    model.walls[0].runs = [run({ id: 'R', x: 90, width: 30, depth: 24 })];
    model.walls[0].connections.end = { wallId: 'W2', endpoint: 'start' };
    model.walls.push(wall({
      id: 'W2', x1: 120, y1: 0, x2: 120, y2: 96, thickness: 0,
      connections: { start: { wallId: 'W1', endpoint: 'end' }, end: null },
    }));
    model = syncRoom(model, settings);
    expect(keys(planPickStack(model, point(model, 119.5, 12), settings, { tolerance: 1 })))
      .toEqual(['run:R', 'wall:W2', 'wall:W1']);
  });

  it('anchor 11: picks a back-side run on a mid-room wall', () => {
    model.walls[0].runs[0].wallSide = 'back';
    model = syncRoom(model, settings);
    expect(keys(planPickStack(model, point(model, 40, 12, 'back'), settings)))
      .toEqual(['run:B', 'wall:W1']);
  });

  it('orders runs by band then later wall/run, openings by later wall/opening, and nearby walls last', () => {
    model.walls = ['W1', 'W2'].map((id) => wall({
      id, x2: 120, thickness: 0,
      runs: [
        run({ id: `${id}:B`, x: 10, width: 60 }),
        run({ id: `${id}:T`, x: 10, width: 60, cabinetTypeId: CABINET_TYPE_IDS.TALL }),
        run({ id: `${id}:U1`, x: 10, width: 60, depth: 12, cabinetTypeId: CABINET_TYPE_IDS.UPPER }),
        run({ id: `${id}:U2`, x: 10, width: 60, depth: 12, cabinetTypeId: CABINET_TYPE_IDS.UPPER }),
      ],
      openings: [opening({ id: `${id}:D1` }), opening({ id: `${id}:D2` })],
    }));
    model = syncRoom(model, settings);
    const runs = ['run:W2:U2', 'run:W2:U1', 'run:W1:U2', 'run:W1:U1',
      'run:W2:T', 'run:W2:B', 'run:W1:T', 'run:W1:B'];
    expect(keys(planPickStack(model, point(model, 40, 0.5), settings, { tolerance: 1 })))
      .toEqual([...runs, 'opening:W2:D2', 'opening:W2:D1', 'opening:W1:D2', 'opening:W1:D1',
        'wall:W2', 'wall:W1']);
    expect(keys(planPickStack(model, point(model, 40, 6), settings)))
      .toEqual([...runs, 'wall:W2', 'wall:W1']);
    model.walls[0].runs = model.walls[0].runs.filter(({ cabinetTypeId }) => cabinetTypeId === CABINET_TYPE_IDS.UPPER);
    model.walls[1].runs = model.walls[1].runs.filter(({ cabinetTypeId }) => cabinetTypeId !== CABINET_TYPE_IDS.UPPER);
    model = syncRoom(model, settings);
    expect(keys(planPickStack(model, point(model, 40, 6), settings)))
      .toEqual(['run:W1:U2', 'run:W1:U1', 'run:W2:T', 'run:W2:B', 'wall:W1', 'wall:W2']);
  });

  it('keeps run footprints exact even when walls and openings have tolerance', () => {
    model = syncRoom(model, settings);
    expect(planPickStack(model, point(model, 9.5, 6), settings, { tolerance: 1 })).toEqual([]);
    expect(keys(planPickStack(model, point(model, 10, 6), settings)))
      .toEqual(['run:B', 'wall:W1']);
  });

  it('hits the void or casing, rather than their bounding rectangle, and returns the full outline', () => {
    model.walls[0].thicknessOverride = 4.5;
    model.walls[0].openings = [opening({ offset: 80 })];
    model = syncRoom(model, settings);
    const candidates = planPickStack(model, point(model, 95, -2), settings);
    expect(candidates[0]).toEqual({
      kind: 'opening', key: 'opening:door-1', label: 'Door D1', wallId: 'W1',
      selection: { openingId: 'door-1' },
      outline: [{ x: 77, y: 0.75 }, { x: 119, y: 0.75 }, { x: 119, y: -4.5 }, { x: 77, y: -4.5 }],
    });
    expect(keys(planPickStack(model, point(model, 78, -2), settings))).toEqual(['wall:W1']);
    expect(keys(planPickStack(model, point(model, 78, 0.5), settings)))
      .toEqual(['opening:door-1', 'wall:W1']);
    expect(keys(planPickStack(model, point(model, 76.5, 1.25), settings, { tolerance: 1 })))
      .toEqual(['opening:door-1', 'wall:W1']);
  });

  it('picks an uncased window on a rotated zero-thickness wall', () => {
    model.walls[0] = wall({
      id: 'W1', x1: 120, y1: 0, x2: 120, y2: 120, thickness: 0,
      openings: [opening({ id: 'window', kind: 'window', label: 'W1',
        casing: null, offset: 80 })],
    });
    model = syncRoom(model, settings);
    const candidates = planPickStack(model, point(model, 95, 0.5), settings, { tolerance: 1 });
    expect(keys(candidates)).toEqual(['opening:window', 'wall:W1']);
    expect(candidates[0]).toMatchObject({
      label: 'Window W1',
      selection: { openingId: 'window' },
      outline: [point(model, 80, 0), point(model, 116, 0), point(model, 116, 0), point(model, 80, 0)],
    });
  });

  it('returns no candidates without a room or point', () => {
    expect(planPickStack(null, { x: 0, y: 0 }, settings)).toEqual([]);
    expect(planPickStack(model, null, settings)).toEqual([]);
  });
});

describe('pointNearPolygon', () => {
  it('includes interiors and exact edges, and measures distance to segments rather than bounding boxes', () => {
    const diamond = [{ x: 0, y: 2 }, { x: 2, y: 0 }, { x: 0, y: -2 }, { x: -2, y: 0 }];
    expect(pointNearPolygon(diamond, { x: 0, y: 0 }, 0)).toBe(true);
    expect(pointNearPolygon(diamond, { x: 1, y: 1 }, 0)).toBe(true);
    expect(pointNearPolygon(diamond, { x: 1.5, y: 1.5 }, 0.7)).toBe(false);
    expect(pointNearPolygon(diamond, { x: 1.5, y: 1.5 }, Math.SQRT1_2)).toBe(true);
    expect(pointNearPolygon(diamond, { x: 3, y: 0 }, 1)).toBe(true);
    expect(pointNearPolygon(diamond, { x: 3, y: 1 }, 1)).toBe(false);
  });

  it('handles zero-thickness polygons, collapsed edges and empty polygons', () => {
    const line = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }];
    expect(pointNearPolygon(line, { x: 5, y: 0 }, 0)).toBe(true);
    expect(pointNearPolygon(line, { x: 5, y: 1 }, 1)).toBe(true);
    expect(pointNearPolygon(line, { x: 5, y: 1.01 }, 1)).toBe(false);
    expect(pointNearPolygon(line, { x: 11, y: 1 }, 1)).toBe(false);
    expect(pointNearPolygon([{ x: 0, y: 0 }], { x: 3, y: 4 }, 5)).toBe(true);
    expect(pointNearPolygon([], { x: 0, y: 0 }, 1)).toBe(false);
  });
});
