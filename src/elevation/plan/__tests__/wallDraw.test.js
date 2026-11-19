import { expect, it } from 'vitest';
import { drawDirection, snapPointOrtho } from '../wallOps.js';

it.each([
  [{ x: 1, y: 0 }, 90, 1, 0, 1],
  [{ x: 1, y: 0 }, 90, -1, 0, -1],
  [{ x: 1, y: 0 }, 135, 1, Math.SQRT1_2, Math.SQRT1_2],
  [{ x: 1, y: 0 }, 135, -1, Math.SQRT1_2, -Math.SQRT1_2],
  [null, 0, 1, 1, 0],
  [null, 45, 1, Math.SQRT1_2, -Math.SQRT1_2],
  [null, 90, 1, 0, -1],
])('draws from %j at %s° on side %s (MW1)', (previousDir, angle, side, x, y) => {
  const direction = drawDirection({ previousDir, angle, side });
  expect(direction.x).toBeCloseTo(x, 9);
  expect(direction.y).toBeCloseTo(y, 9);
});

it('projects a pointer at 40° onto the 45° diagonal (MW1)', () => {
  const radians = 40 * Math.PI / 180;
  const pointer = { x: 10 + 30 * Math.cos(radians), y: 20 + 30 * Math.sin(radians) };
  const snapped = snapPointOrtho({ x: 10, y: 20 }, pointer, true, 45);
  const projected = 30 * Math.cos(5 * Math.PI / 180) * Math.SQRT1_2;
  expect(snapped.x).toBeCloseTo(10 + projected, 9);
  expect(snapped.y).toBeCloseTo(20 + projected, 9);
});
