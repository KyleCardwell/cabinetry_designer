import { describe, expect, it } from 'vitest';
import { room, wall } from '../../../test/builders.js';
import { holdLandedWalls, landingReferenceDirection } from '../index.js';
import { landingInterval, landingOffsetFor, resolveLandings } from '../landings.js';
import { wallFrame } from '../geometry.js';
import { wallLabel } from '../topology.js';
import { wallSideFrame } from '../wallSides.js';
import {
  moveConnectedEndpoint,
  moveWallPerpendicular,
  setWallLength,
} from '../../plan/wallOps.js';

const K = room({
  wallOrder: ['wall-1', 'wall-2', 'wall-3', 'wall-4'],
  walls: [
    wall({
      id: 'wall-1', x1: 123.5, y1: 83.5, x2: -38.5, y2: 83.5, thickness: 4.5,
      connections: { start: null, end: { wallId: 'wall-2', endpoint: 'start' } },
      landings: { start: null, end: null },
    }),
    wall({
      id: 'wall-2', x1: -38.5, y1: 83.5, x2: -38.5, y2: 13.5, thickness: 4.5,
      connections: { start: { wallId: 'wall-1', endpoint: 'end' }, end: null },
      landings: {
        start: null,
        end: { wallId: 'wall-3', side: 'back', ref: 'right', to: 'near', offset: 39 },
      },
    }),
    wall({
      id: 'wall-3', x1: 0.5, y1: 9, x2: -123.5, y2: 9, thickness: 4.5,
      connections: { start: null, end: { wallId: 'wall-4', endpoint: 'start' } },
      landings: { start: null, end: null },
    }),
    wall({
      id: 'wall-4', x1: -123.5, y1: 9, x2: -123.5, y2: -83, thickness: 4.5,
      connections: { start: { wallId: 'wall-3', endpoint: 'end' }, end: null },
      landings: { start: null, end: null },
    }),
  ],
});

const byId = (room, id) => room.walls.find((wall) => wall.id === id);

describe('held landed walls (WL1)', () => {
  it('matches the shared Room K frames, interval and labels', () => {
    const host = byId(K, 'wall-3');
    expect(wallFrame(K, byId(K, 'wall-2')).n).toEqual({ x: 1, y: 0 });
    expect(wallSideFrame(K, host, 'front')).toMatchObject({
      length: 124, leftPoint: { x: 0.5, y: 9 }, r: { x: -1, y: 0 }, leftEndpoint: 'start',
    });
    expect(wallSideFrame(K, host, 'back')).toMatchObject({
      length: 124, leftPoint: { x: -123.5, y: 13.5 }, r: { x: 1, y: 0 },
      leftEndpoint: 'end', rightEndpoint: 'start',
    });
    expect(landingInterval(resolveLandings(K), byId(K, 'wall-2'), 'end'))
      .toMatchObject({ a: 80.5, b: 85 });
    expect(K.walls.map((wall) => wallLabel(K, wall)))
      .toEqual(['Wall 1', 'Wall 2', 'Wall 3', 'Wall 4']);
  });

  it.each([
    ['anchor 1: length edit', () => setWallLength(K, 'wall-3', 111, 'left').walls],
    ['anchor 2: endpoint edit', () => moveConnectedEndpoint(
      K.walls, 'wall-3', 'start', { x: -12.5, y: 9 },
    )],
  ])('%s holds the landed wall square with offset 26', (_, edit) => {
    const before = structuredClone(K);
    const after = { ...K, walls: edit() };
    const edited = structuredClone(after);
    const result = holdLandedWalls(K, after);
    expect(result).toMatchObject({ ok: true, reason: null, message: null });
    expect(byId(result, 'wall-2').landings.end).toEqual({
      ...byId(K, 'wall-2').landings.end, offset: 26,
    });
    const resolved = resolveLandings({ ...after, walls: result.walls });
    expect(byId(resolved, 'wall-2')).toMatchObject({
      x1: -38.5, y1: 83.5, x2: -38.5, y2: 13.5,
    });
    expect(byId(resolved, 'wall-3')).toMatchObject({
      x1: -12.5, y1: 9, x2: -123.5, y2: 9,
    });
    for (const id of ['wall-1', 'wall-3', 'wall-4']) {
      expect(byId(result, id)).toBe(byId(after, id));
    }
    expect(K).toEqual(before);
    expect(after).toEqual(edited);
  });

  it('moving the host corner retains offset 39', () => {
    const after = { ...K, walls: setWallLength(K, 'wall-3', 111, 'right').walls };
    const result = holdLandedWalls(K, after);
    expect(result.ok).toBe(true);
    expect(byId(result, 'wall-2').landings.end.offset).toBe(39);
    expect(byId(result, 'wall-2')).toBe(byId(after, 'wall-2'));
    const resolved = resolveLandings({ ...after, walls: result.walls });
    expect(byId(resolved, 'wall-4')).toMatchObject({
      x1: -110.5, y1: 9, x2: -110.5, y2: -83,
    });
    expect(byId(resolved, 'wall-2')).toEqual(byId(K, 'wall-2'));
  });

  it('moving the host across its face stretches only the landed end', () => {
    const after = { ...K, walls: moveWallPerpendicular(K, 'wall-3', 2).walls };
    const result = holdLandedWalls(K, after);
    expect(result.ok).toBe(true);
    expect(byId(result, 'wall-2').landings.end.offset).toBe(39);
    expect(byId(result, 'wall-2').y2).toBe(13.5); // Holding does not sync.
    const resolved = resolveLandings({ ...after, walls: result.walls });
    expect(byId(resolved, 'wall-3')).toMatchObject({ y1: 7, y2: 7 });
    expect(byId(resolved, 'wall-2')).toMatchObject({
      x1: -38.5, y1: 83.5, x2: -38.5, y2: 11.5,
    });
  });

  it('accepts a landing exactly at the host end', () => {
    const after = { ...K, walls: setWallLength(K, 'wall-3', 85, 'left').walls };
    const result = holdLandedWalls(K, after);
    expect(result.ok).toBe(true);
    expect(byId(result, 'wall-2').landings.end.offset).toBe(0);
  });

  it('refuses the whole edit if a held landing leaves the face', () => {
    const after = { ...K, walls: setWallLength(K, 'wall-3', 84, 'left').walls };
    const edited = structuredClone(after);
    const result = holdLandedWalls(K, after);
    expect(result).toEqual({
      ok: false, reason: 'landing-off-host', walls: K.walls,
      message: "Wall 3 can't end there: Wall 2 lands on it. Move or detach Wall 2 first.",
    });
    expect(result.walls).toBe(K.walls);
    expect(after).toEqual(edited);
  });

  it('leaves a moved landed wall\'s own landing untouched', () => {
    const after = { ...K, walls: moveWallPerpendicular(K, 'wall-2', 13).walls };
    const result = holdLandedWalls(K, after);
    expect(result.ok).toBe(true);
    expect(byId(result, 'wall-2')).toBe(byId(after, 'wall-2'));
    expect(byId(result, 'wall-2').landings.end).toBe(byId(K, 'wall-2').landings.end);
    expect(byId(result, 'wall-2').landings.end.offset).toBe(39);
  });

  it('skips a moved landed wall even when its host also changed', () => {
    const moved = moveWallPerpendicular(K, 'wall-2', 13).walls;
    const after = {
      ...K,
      walls: moved.map((wall) => wall.id === 'wall-3' ? { ...wall, x1: -12.5 } : wall),
    };
    const result = holdLandedWalls(K, after);
    expect(result.ok).toBe(true);
    expect(byId(result, 'wall-2')).toBe(byId(after, 'wall-2'));
    expect(byId(result, 'wall-2').landings.end).toBe(byId(K, 'wall-2').landings.end);
  });

  it('an unheld wing follows its host with its landing unchanged', () => {
    const wing = wall({
      id: 'wall-5', x1: -80, y1: 9, x2: -80, y2: -30, thickness: 4.5,
      connections: { start: null, end: null },
      landings: {
        start: { wallId: 'wall-3', side: 'front', ref: 'left', to: 'center', offset: 0 },
        end: null,
      },
    });
    const measured = { ...K, walls: [...K.walls, wing] };
    const before = {
      ...measured,
      walls: [...K.walls, {
        ...wing,
        landings: {
          ...wing.landings,
          start: {
            ...wing.landings.start,
            offset: landingOffsetFor(measured, wing, 'start', 'left', 'center'),
          },
        },
      }],
    };
    const after = { ...before, walls: setWallLength(before, 'wall-3', 111, 'left').walls };
    const result = holdLandedWalls(before, after);
    expect(result.ok).toBe(true);
    expect(byId(result, 'wall-5')).toBe(byId(after, 'wall-5'));
    expect(byId(result, 'wall-5').landings).toBe(byId(before, 'wall-5').landings);
    const resolved = resolveLandings({ ...after, walls: result.walls });
    expect(byId(resolved, 'wall-5')).toMatchObject({ x1: -93, y1: 9, x2: -93, y2: -30 });
  });

  it.each([
    ['thickness', { thickness: 6 }, 15],
    ['flip', { flipped: true }, 4.5],
  ])('re-measures a held landing after a host %s change', (_, changes, y2) => {
    const after = {
      ...K, walls: K.walls.map((wall) => wall.id === 'wall-3' ? { ...wall, ...changes } : wall),
    };
    const result = holdLandedWalls(K, after);
    expect(result.ok).toBe(true);
    expect(byId(result, 'wall-2').landings.end.offset)
      .toBe(landingOffsetFor(after, byId(after, 'wall-2'), 'end', 'right', 'near'));
    const resolved = resolveLandings({ ...after, walls: result.walls });
    expect(byId(resolved, 'wall-2')).toMatchObject({ x1: -38.5, y1: 83.5, x2: -38.5, y2 });
  });

  it('also holds an endpoint when the opposite endpoint has a landing', () => {
    const before = {
      ...K,
      walls: K.walls.map((wall) => wall.id === 'wall-2' ? {
        ...wall,
        connections: { start: null, end: null },
        landings: {
          ...wall.landings,
          start: { wallId: 'wall-1', side: 'front', ref: 'left', to: 'near', offset: 0 },
        },
      } : wall),
    };
    const after = { ...before, walls: setWallLength(before, 'wall-3', 111, 'left').walls };
    const result = holdLandedWalls(before, after);
    expect(result.ok).toBe(true);
    expect(byId(result, 'wall-2').landings.end.offset).toBe(26);
    expect(byId(result, 'wall-2').landings.start).toBe(byId(before, 'wall-2').landings.start);
  });

  it('re-measures wall references and exposes both reference directions', () => {
    const reference = wall({
      id: 'wall-5', x1: -80, y1: 13.5, x2: -80, y2: 40, thickness: 4.5,
      connections: { start: null, end: null },
      landings: {
        start: { wallId: 'wall-3', side: 'back', ref: 'left', to: 'near', offset: 43.5 },
        end: null,
      },
    });
    const before = {
      ...K,
      walls: [...K.walls.map((wall) => wall.id === 'wall-2' ? {
        ...wall,
        landings: { ...wall.landings, end: { ...wall.landings.end, ref: 'wall-5', offset: 32.5 } },
      } : wall), reference],
    };
    const after = {
      ...before,
      walls: setWallLength(before, 'wall-3', 111, 'left').walls.map((wall) => (
        wall.id === 'wall-5' ? {
          ...wall, x1: -70, x2: -70,
          landings: { ...wall.landings, start: { ...wall.landings.start, offset: 53.5 } },
        } : wall
      )),
    };
    const result = holdLandedWalls(before, after);
    expect(result.ok).toBe(true);
    expect(byId(result, 'wall-2').landings.end).toEqual({
      wallId: 'wall-3', side: 'back', ref: 'wall-5', to: 'near', offset: 22.5,
    });
    expect(landingReferenceDirection(before, byId(before, 'wall-2'), 'end', 'left')).toBe(1);
    expect(landingReferenceDirection(before, byId(before, 'wall-2'), 'end', 'right')).toBe(-1);
    expect(landingReferenceDirection(before, byId(before, 'wall-2'), 'end', 'wall-5')).toBe(1);
    expect(landingReferenceDirection(before, reference, 'start', 'wall-2')).toBe(-1);
    expect(byId(result, 'wall-5')).toBe(byId(after, 'wall-5'));
  });

  it.each([
    [85 - 0.5e-6, true],
    [85 - 2e-6, false],
    [43.5 - 0.5e-6, true],
    [43.5 - 2e-6, false],
  ])('checks both face boundaries with tolerance (length %s)', (length, ok) => {
    const growEnd = length > 80 ? 'left' : 'right';
    const after = { ...K, walls: setWallLength(K, 'wall-3', length, growEnd).walls };
    const result = holdLandedWalls(K, after);
    expect(result.ok).toBe(ok);
    if (!ok) expect(result.walls).toBe(K.walls);
  });

  it('reports the first failing landing in wall order and rolls back earlier re-measurements', () => {
    const another = wall({
      id: 'wall-5', x1: -60, y1: 60, x2: -60, y2: 13.5, thickness: 4.5,
      connections: { start: { wallId: 'wall-1', endpoint: 'start' }, end: null },
      landings: {
        start: null,
        end: { wallId: 'wall-3', side: 'back', ref: 'right', to: 'near', offset: 60.5 },
      },
    });
    const before = { ...K, walls: [another, ...K.walls] };
    const after = { ...before, walls: setWallLength(before, 'wall-3', 70, 'left').walls };
    const result = holdLandedWalls(before, after);
    expect(result.reason).toBe('landing-off-host');
    expect(result.message).toBe("Wall 3 can't end there: Wall 2 lands on it. Move or detach Wall 2 first.");
    expect(result.walls).toBe(before.walls);

    const bothFail = { ...before, walls: setWallLength(before, 'wall-3', 30, 'left').walls };
    expect(holdLandedWalls(before, bothFail).message).toBe(
      "Wall 3 can't end there: Wall 5 lands on it. Move or detach Wall 5 first.",
    );
  });
});
