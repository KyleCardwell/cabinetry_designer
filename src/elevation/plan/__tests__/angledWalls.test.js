import { describe, expect, it } from 'vitest';
import {
  connectWallEndpoints,
  isAngledWall,
  moveWallPerpendicular,
  setWallLength,
} from '../wallOps.js';

function wall(id, x1, y1, x2, y2) {
  return { id, x1, y1, x2, y2, connections: { start: null, end: null } };
}

/** Kyle's room: a 120" square with its R/B corner cut by a 45° wall C (24" each way). */
function chamfered() {
  let walls = [
    wall('T', 0, 0, 120, 0),
    wall('R', 120, 0, 120, 96),
    wall('C', 120, 96, 96, 120),
    wall('B', 96, 120, 0, 120),
    wall('L', 0, 120, 0, 0),
  ];
  for (const [a, b] of [['T', 'R'], ['R', 'C'], ['C', 'B'], ['B', 'L'], ['L', 'T']]) {
    walls = connectWallEndpoints(walls, a, 'end', b, 'start');
  }
  return { walls };
}

/** Each wall as [id, x1, y1, x2, y2], to 4 places. */
const ends = (result) => result.walls.map(({ id, x1, y1, x2, y2 }) => (
  [id, ...[x1, y1, x2, y2].map((value) => Math.round(value * 1e4) / 1e4)]
));

describe('SPEC-42.2 an angled wall gives', () => {
  it('knows an angled wall from a square one', () => {
    expect(chamfered().walls.map(isAngledWall)).toEqual([false, false, true, false, false]);
  });

  it('a typed length next to an angled wall moves only the shared corner', () => {
    // R grows 12" toward C: C changes angle, B keeps its 96".
    expect(ends(setWallLength(chamfered(), 'R', 108, 'right'))).toEqual([
      ['T', 0, 0, 120, 0], ['R', 120, 0, 120, 108], ['C', 120, 108, 96, 120], ['B', 96, 120, 0, 120], ['L', 0, 120, 0, 0],
    ]);
    // B grows 12" toward C.
    expect(ends(setWallLength(chamfered(), 'B', 108, 'left'))).toEqual([
      ['T', 0, 0, 120, 0], ['R', 120, 0, 120, 96], ['C', 120, 96, 108, 120], ['B', 108, 120, 0, 120], ['L', 0, 120, 0, 0],
    ]);
  });

  it('a square neighbour still moves square; the angled wall past it gives', () => {
    // T grows 12" to the right: R moves out square, C changes angle, B keeps its 96".
    expect(ends(setWallLength(chamfered(), 'T', 132, 'right'))).toEqual([
      ['T', 0, 0, 132, 0], ['R', 132, 0, 132, 96], ['C', 132, 96, 96, 120], ['B', 96, 120, 0, 120], ['L', 0, 120, 0, 0],
    ]);
  });

  it('a typed angled wall keeps its angle; its square neighbours slide', () => {
    const result = setWallLength(chamfered(), 'C', 40, 'left');
    const [T, R, C] = result.walls;
    expect(result.ok).toBe(true);
    expect(T.x2).toBeCloseTo(124.284271, 5);
    expect([R.x1, R.x2, R.y2]).toEqual([T.x2, T.x2, C.y1]);
    expect(C.y1).toBeCloseTo(91.715729, 5);
    expect([C.x2, C.y2]).toEqual([96, 120]);
    expect(Math.hypot(C.x2 - C.x1, C.y2 - C.y1)).toBeCloseTo(40, 6);
  });

  it('dragging a wall bends an angled neighbour; dragging the angled wall keeps its angle', () => {
    // R dragged 12" in: T shortens, C changes angle, B keeps its 96".
    expect(ends(moveWallPerpendicular(chamfered(), 'R', 12))).toEqual([
      ['T', 0, 0, 108, 0], ['R', 108, 0, 108, 96], ['C', 108, 96, 96, 120], ['B', 96, 120, 0, 120], ['L', 0, 120, 0, 0],
    ]);
    // C dragged 6" in: R and B slide along their own lines; C stays at 45°.
    expect(ends(moveWallPerpendicular(chamfered(), 'C', 6))).toEqual([
      ['T', 0, 0, 120, 0], ['R', 120, 0, 120, 87.5147], ['C', 120, 87.5147, 87.5147, 120],
      ['B', 87.5147, 120, 0, 120], ['L', 0, 120, 0, 0],
    ]);
  });
});
