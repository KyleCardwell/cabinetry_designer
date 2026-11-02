import { describe, expect, it } from 'vitest';
import { wall } from '../../../test/builders.js';
import { K, K2 } from '../../../test/fixtures/landingRoomK.js';
import { wallFrame } from '../geometry.js';
import {
  landEndpointOnFace,
  landingInterval,
  landingLabel,
  landWallEnd,
  NEAR_MISS_DISTANCE,
  resolveLandings,
  snapToWallFace,
  wallNearMisses,
} from '../landings.js';
import { wallSideFrame } from '../wallSides.js';

const byId = (room, id) => room.walls.find((entry) => entry.id === id);
const target = { hostId: 'wall-3', side: 'back', x: 85 };

describe('WL2 a: existing wall ends and near misses', () => {
  it('anchor 1: finds only wall-2 two inches from the back face in K2', () => {
    expect(NEAR_MISS_DISTANCE).toBe(6);
    expect(wallSideFrame(K2, byId(K2, 'wall-3'), 'back')).toMatchObject({
      leftPoint: { x: -123.5, y: 13.5 },
      r: { x: 1, y: 0 }, n: { x: 0, y: 1 }, length: 124,
    });
    expect(wallSideFrame(K2, byId(K2, 'wall-3'), 'front')).toMatchObject({
      leftPoint: { x: 0.5, y: 9 }, n: { x: 0, y: -1 },
    });
    expect(wallFrame(K2, byId(K2, 'wall-2')).n).toEqual({ x: 1, y: 0 });
    expect(wallNearMisses(K2)).toEqual([{
      wallId: 'wall-2', endpoint: 'end', hostId: 'wall-3', side: 'back',
      gap: 2, x: 85, point: { x: -38.5, y: 13.5 }, from: { x: -38.5, y: 15.5 },
    }]);
  });

  it('anchor 2: excludes landed ends and gaps past six inches', () => {
    expect(wallNearMisses(K)).toEqual([]);
    const farther = {
      ...K2,
      walls: K2.walls.map((entry) => entry.id === 'wall-2' ? { ...entry, y2: 20 } : entry),
    };
    expect(wallNearMisses(farther)).toEqual([]);
  });

  it.each([
    [19.5, 6],
    [13.5, 0],
  ])('anchor 3: end at y=%s has gap %s', (y, gap) => {
    const adjusted = {
      ...K2,
      walls: K2.walls.map((entry) => entry.id === 'wall-2' ? { ...entry, y2: y } : entry),
    };
    expect(wallNearMisses(adjusted)).toEqual([{
      wallId: 'wall-2', endpoint: 'end', hostId: 'wall-3', side: 'back',
      gap, x: 85, point: { x: -38.5, y: 13.5 }, from: { x: -38.5, y },
    }]);
  });

  it('anchor 4: rejects an end whose thickness extends past the face', () => {
    const withWing = {
      ...K2,
      walls: [...K2.walls, wall({
        id: 'wall-5', x1: 2, y1: 40, x2: 2, y2: 15.5, thickness: 4.5,
      })],
    };
    expect(wallNearMisses(withWing)).toEqual(wallNearMisses(K2));
  });

  it('does not skip a closer off-face host to mark a farther one', () => {
    const withShortHost = {
      ...K2,
      walls: [...K2.walls, wall({
        id: 'wall-5', x1: -40, y1: 14.5, x2: -30, y2: 14.5, thickness: 4.5,
      })],
    };
    expect(wallNearMisses(withShortHost)
      .filter((miss) => miss.wallId === 'wall-2')).toEqual([]);
  });

  it('ignores a far-away face whose extended line passes near the end', () => {
    const withFarWall = {
      ...K2,
      walls: [...K2.walls, wall({
        id: 'wall-5', x1: 100, y1: 14.5, x2: 160, y2: 14.5, thickness: 4.5,
      })],
    };
    expect(wallNearMisses(withFarWall)).toEqual(wallNearMisses(K2));
  });

  it('finds the miss past a collinear wall piece listed first (doorway split)', () => {
    const piece = wall({ id: 'wall-0', x1: 60.5, y1: 9, x2: 20.5, y2: 9, thickness: 4.5 });
    for (const walls of [[piece, ...K2.walls], [...K2.walls, piece]]) {
      expect(wallNearMisses({ ...K2, walls })
        .filter((miss) => miss.wallId === 'wall-2')).toEqual(wallNearMisses(K2));
    }
  });

  it('anchor 5: lands the free end without flipping or moving the other walls', () => {
    const result = landEndpointOnFace(K2, 'wall-2', 'end', target);
    expect(result).toMatchObject({ ok: true, reason: null, message: null });
    expect(byId({ walls: result.walls }, 'wall-2')).toMatchObject({
      x1: -38.5, y1: 83.5, x2: -38.5, y2: 13.5, flipped: false,
    });
    expect(result.landing).toEqual({
      wallId: 'wall-3', side: 'back', ref: 'right', to: 'near', offset: 39,
    });
    expect(byId({ walls: result.walls }, 'wall-2').landings.end).toBe(result.landing);
    expect(landingLabel(K2, result.landing)).toBe('39" from Free end');
    for (const entry of K2.walls.filter((candidate) => candidate.id !== 'wall-2')) {
      expect(byId({ walls: result.walls }, entry.id)).toBe(entry);
    }
    expect(byId(resolveLandings({ ...K2, walls: result.walls }), 'wall-2'))
      .toEqual(byId({ walls: result.walls }, 'wall-2'));
  });

  it('anchor 6: a flipped wall stays flipped, measuring from the other edge', () => {
    const flipped = {
      ...K2,
      walls: K2.walls.map((entry) => entry.id === 'wall-2'
        ? { ...entry, flipped: true } : entry),
    };
    const result = landEndpointOnFace(flipped, 'wall-2', 'end', target);
    expect(result.ok).toBe(true);
    const landed = byId({ walls: result.walls }, 'wall-2');
    expect(landed.flipped).toBe(true);
    expect(landingInterval({ ...flipped, walls: result.walls }, landed, 'end'))
      .toMatchObject({ a: 85, b: 89.5 });
    expect(result.landing.offset).toBe(34.5);
    expect(landingLabel(flipped, result.landing)).toBe('34 1/2" from Free end');
  });

  it('anchor 7: rejects off-face, parallel, and nonfree ends without editing walls', () => {
    for (const [endpoint, face, reason, message] of [
      ['end', { ...target, x: 130 }, 'off-face', 'Wall 2 would miss the end of Wall 3.'],
      ['end', { hostId: 'wall-4', side: 'front', x: 10 },
        'parallel', "Wall 2 can't land on Wall 4: they're parallel."],
      ['start', target, 'not-free', null],
    ]) {
      expect(landEndpointOnFace(K2, 'wall-2', endpoint, face)).toEqual({
        ok: false, reason, message, walls: K2.walls, landing: null,
      });
    }
  });

  it('anchor 8: rejects landing onto a wall already landed on this one', () => {
    const withWing = {
      ...K,
      walls: [...K.walls, wall({
        id: 'wall-5', x1: -80, y1: 13.5, x2: -80, y2: 40,
      })],
    };
    const landed = landWallEnd(withWing, 'wall-5', 'start',
      { wallId: 'wall-3', side: 'back', x: 43.5 });
    expect(landed).not.toBeNull();
    expect(landEndpointOnFace(landed, 'wall-3', 'start',
      { hostId: 'wall-5', side: 'front', x: 5 })).toEqual({
      ok: false, reason: 'host-lands-on-wall',
      message: "Wall 5 lands on Wall 3, so Wall 3 can't land on it.",
      walls: landed.walls, landing: null,
    });
  });

  it('anchor 9: snaps along the dragged line only to the facing back face', () => {
    const options = { excludeWallId: 'wall-2', from: { x: -38.5, y: 83.5 } };
    for (const y of [16, 11]) {
      expect(snapToWallFace(K2, { x: -38.5, y }, 6, options)).toEqual({
        wallId: 'wall-3', side: 'back', x: 85, point: { x: -38.5, y: 13.5 },
      });
    }
    expect(snapToWallFace(K2, { x: -38.5, y: 25 }, 6, options)).toBeNull();
  });

  it('anchor 10: without options retains the projection snap', () => {
    expect(snapToWallFace(K2, { x: -38.5, y: 16 }, 6)).toEqual({
      wallId: 'wall-2', side: 'front', x: 67.5, point: { x: -38.5, y: 16 },
    });
    expect(snapToWallFace(K2, { x: -38.5, y: 16 }, 6,
      { excludeWallId: 'wall-2' })).toEqual({
      wallId: 'wall-3', side: 'back', x: 85, point: { x: -38.5, y: 13.5 },
    });
  });

  it('keeps the new-wall flip by default but can preserve an existing flip', () => {
    const face = { wallId: 'wall-3', side: 'back', x: 10 };
    expect(byId(landWallEnd(K2, 'wall-2', 'end', face), 'wall-2').flipped).toBe(true);
    expect(byId(landWallEnd(K2, 'wall-2', 'end', face,
      { keepFlipped: true }), 'wall-2').flipped).toBe(false);
  });

  it('does not report an end inside the host or snapping from the wrong side', () => {
    const inside = {
      ...K2,
      walls: K2.walls.map((entry) => entry.id === 'wall-2'
        ? { ...entry, y2: 11 } : entry),
    };
    expect(wallNearMisses(inside)).toEqual([]);
    expect(snapToWallFace(K2, { x: -38.5, y: 5 }, 6, {
      excludeWallId: 'wall-2', from: { x: -38.5, y: 11 },
    })).toBeNull();
  });

  it('rejects a whole end outside the face even if its line point is inside', () => {
    const result = landEndpointOnFace(K2, 'wall-2', 'end', { ...target, x: 2 });
    expect(result).toEqual({
      ok: false, reason: 'off-face',
      message: 'Wall 2 would miss the end of Wall 3.',
      walls: K2.walls, landing: null,
    });
  });

  it('uses wall labels for wall-id landing references', () => {
    expect(landingLabel(K, {
      wallId: 'wall-3', side: 'back', ref: 'wall-2', offset: 12.5,
    })).toBe('12 1/2" from Wall 2');
  });
});
