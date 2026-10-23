import { expect, it } from 'vitest';
import { measureBetween, profileMeasureGeometry, snapMeasure } from '../model/measure.js';
import { measureMarks } from './measureMarks.js';

const R = {
  points: { b: [1, 0], c: [0, 1] },
  loops: [{ closed: false, segs: [{ type: 'arc', from: 'b', to: 'c', center: [0, 0], ccw: true }] }],
};
const geometry = profileMeasureGeometry([R]);
const toScreen = ({ x, y }) => ({ x: x * 100, y: y * 100 });
const marks = (extra) => measureMarks({ measures: [], toScreen, ...extra });

it('MS5 anchor 2: preserves the diagonal line, ticks, dashed legs and labels in screen pixels', () => {
  const result = measureBetween({ kind: 'corner', point: { x: 0, y: 0 } },
    { kind: 'corner', point: { x: 48, y: 34.5 } });
  const layout = marks({ measures: [{ result }], toScreen: ({ x, y }) => ({ x: x * 2, y: y * 2 }) });
  const lines = layout.filter(({ type }) => type === 'line');
  expect(lines).toHaveLength(4);
  expect(lines[0].points).toEqual([0, 0, 96, 69]);
  for (const { points: [x1, y1, x2, y2] } of lines.slice(1, 3)) {
    expect(Math.hypot(x2 - x1, y2 - y1)).toBeCloseTo(6);
    expect((x2 - x1) * 96 + (y2 - y1) * 69).toBeCloseTo(0);
  }
  expect(lines[3]).toMatchObject({ points: [0, 0, 96, 0, 96, 69], dash: [4, 3] });
  const labels = layout.filter(({ type }) => type === 'label');
  expect(labels.map(({ text }) => text)).toEqual(['48"', '34 1/2"', '~59 1/8"']);
  expect(labels.slice(0, 2).map(({ angle }) => angle)).toEqual([0, -90]);
  expect(labels[2].width).toBeCloseTo('~59 1/8"'.length * 11 * 0.6 + 6);
  const ordered = marks({ measures: [{ result }], preview: result,
    hover: { kind: 'corner', point: { x: 2, y: 3 } }, first: { kind: 'mid', point: { x: 4, y: 5 } } });
  expect(ordered.slice(0, 7).every(({ opacity }) => opacity === 1)).toBe(true);
  expect(ordered.slice(7, 14).every(({ opacity }) => opacity === 0.7)).toBe(true);
  expect(ordered.slice(14)).toEqual([
    { type: 'rect', x: 195.5, y: 295.5, width: 9, height: 9, fill: undefined },
    { type: 'line', points: [400, 495, 405, 505, 395, 505], closed: true, fill: true },
  ]);
});

it('MS5 anchor 3: marks the MS4 center pick with a four-pixel circle and seven-pixel plus', () => {
  const pick = snapMeasure({ x: 0.02, y: 0.01 }, geometry, 0.1);
  expect(pick.kind).toBe('center');
  expect(marks({ hover: pick })).toEqual([
    { type: 'circle', x: 0, y: 0, r: 4, fill: undefined },
    { type: 'line', points: [-3.5, 0, 3.5, 0] },
    { type: 'line', points: [0, -3.5, 0, 3.5] },
  ]);
  expect(marks({ first: pick })[0].fill).toBe(true);
});

it('MS5 anchor 4: highlights the sampled MS4 arc and its projected pick with a seven-pixel cross', () => {
  const pick = snapMeasure({ x: 0.9, y: 0.5 }, geometry, 0.1);
  expect(pick.kind).toBe('arc');
  const [arc, ...cross] = marks({ hover: pick });
  expect(arc).toMatchObject({ type: 'line', width: 2 });
  expect(arc.points).toHaveLength(50);
  expect(arc.points.slice(0, 2)).toEqual([100, 0]);
  expect(arc.points.slice(-2)).toEqual([0, 100]);
  const [x1, y1, x2, y2] = cross[0].points;
  expect((x1 + x2) / 2).toBeCloseTo(87.42, 2);
  expect((y1 + y2) / 2).toBeCloseTo(48.56, 2);
  expect([x2 - x1, y2 - y1]).toEqual([7, 7]);
  expect(cross[1].points).toEqual([x1, y2, x2, y1]);
  expect(marks({ first: pick })[0].width).toBe(3);
});
