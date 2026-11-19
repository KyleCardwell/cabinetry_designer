import { expect, it } from 'vitest';
import { room, wall } from '../../../test/builders.js';
import { cornerAngleMarks } from '../cornerAngleMarks.js';
import { dot, wallFrame } from '../geometry.js';

const clipped = room({ walls: [
  wall({ id: 'bottom', x1: 0, y1: 0, x2: 100, y2: 0, connections: {
    start: { wallId: 'left', endpoint: 'end' }, end: { wallId: 'clip', endpoint: 'start' },
  } }),
  wall({ id: 'clip', x1: 100, y1: 0, x2: 120, y2: 20, connections: {
    start: { wallId: 'bottom', endpoint: 'end' }, end: { wallId: 'right', endpoint: 'start' },
  } }),
  wall({ id: 'right', x1: 120, y1: 20, x2: 120, y2: 96, connections: {
    start: { wallId: 'clip', endpoint: 'end' }, end: { wallId: 'top', endpoint: 'start' },
  } }),
  wall({ id: 'top', x1: 120, y1: 96, x2: 0, y2: 96, connections: {
    start: { wallId: 'right', endpoint: 'end' }, end: { wallId: 'left', endpoint: 'start' },
  } }),
  wall({ id: 'left', x1: 0, y1: 96, x2: 0, y2: 0, connections: {
    start: { wallId: 'top', endpoint: 'end' }, end: { wallId: 'bottom', endpoint: 'start' },
  } }),
] });


it('marks both clipped corners on the room side and omits square corners (MW1)', () => {
  const marks = cornerAngleMarks(clipped);
  expect(marks).toHaveLength(2);
  expect(marks.map(({ walls, endpoints }) => ({ walls, endpoints }))).toEqual([
    { walls: ['bottom', 'clip'], endpoints: ['end', 'start'] },
    { walls: ['clip', 'right'], endpoints: ['end', 'start'] },
  ]);
  for (const mark of marks) {
    expect(mark.angle).toBeCloseTo(135, 6);
    expect(Math.abs(mark.sweep) * 180 / Math.PI).toBeCloseTo(135, 6);
    const middle = mark.startAngle + mark.sweep / 2;
    const frame = wallFrame(clipped, clipped.walls.find(({ id }) => id === mark.walls[0]));
    expect(dot({ x: Math.cos(middle), y: Math.sin(middle) }, frame.n)).toBeGreaterThan(0);
  }
});
