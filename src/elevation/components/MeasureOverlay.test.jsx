import { expect, it, vi } from 'vitest';
import { Group, Line, Rect, Text } from 'react-konva';
import { measureBetween } from '../model/measure.js';
import MeasureOverlay from './MeasureOverlay.jsx';

vi.mock('react-konva', () => ({ Group: 'group', Line: 'line', Rect: 'rect', Text: 'text' }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object'
    ? typeof tree.type === 'function' ? nodes(tree.type(tree.props)) : [tree, ...nodes(tree.props?.children)] : [];
const corner = (x, y) => ({ kind: 'corner', point: { x, y } });
const edge = (x1, y1, x2, y2, x, y) => ({ kind: 'edge', point: { x, y }, segment: { x1, y1, x2, y2 } });
const identity = (point) => point;
const overlay = (result, extra = {}) => nodes(MeasureOverlay({
  first: null, hover: null, measures: [{ result }], preview: null, toScreen: identity, ...extra,
}));
const texts = (tree) => tree.filter(({ type }) => type === Text).map(({ props }) => props.text);
const lines = (tree) => tree.filter(({ type }) => type === Line);

it('MS2b anchor 1: doubles the diagonal screen line and labels both dashed legs in inches', () => {
  const result = measureBetween(corner(0, 0), corner(48, 34.5));
  const tree = overlay(result, { toScreen: ({ x, y }) => ({ x: x * 2, y: y * 2 }) });
  expect(lines(tree)[0].props.points).toEqual([0, 0, 96, 69]);
  expect(texts(tree)).toEqual(['48"', '34 1/2"', '~59 1/8"']);
  expect(lines(tree).filter(({ props }) => props.dash).map(({ props }) => props))
    .toEqual([expect.objectContaining({ points: [0, 0, 96, 0, 96, 69], dash: [4, 3] })]);
  const labels = tree.filter(({ type, props }) => type === Group && props.rotation !== undefined);
  expect(labels.slice(0, 2).map(({ props }) => props.rotation)).toEqual([0, -90]);
  for (const tick of lines(tree).slice(1, 3)) {
    const [x1, y1, x2, y2] = tick.props.points;
    expect(Math.hypot(x2 - x1, y2 - y1)).toBeCloseTo(6);
    expect((x2 - x1) * 96 + (y2 - y1) * 69).toBeCloseTo(0);
  }
});

it('MS2b anchor 2: draws the 48-inch point-line measure with no legs', () => {
  const tree = overlay(measureBetween(corner(0, 34.5), edge(48, 0, 48, 34.5, 48, 10)));
  expect(lines(tree)[0].props.points).toEqual([0, 34.5, 48, 34.5]);
  expect(lines(tree)).toHaveLength(3); // Main line and its two end ticks.
  expect(texts(tree)).toEqual(['48"']);
  expect(lines(tree).some(({ props }) => props.dash)).toBe(false);
});

it('MS2b anchor 3: labels parallel lines and draws one unlabelled dashed extension', () => {
  const tree = overlay(measureBetween(edge(0, 0, 0, 34.5, 0, 5), edge(30.5, 54, 30.5, 84, 30.5, 60)));
  expect(texts(tree)).toEqual(['30 1/2"']);
  expect(lines(tree).filter(({ props }) => props.dash).map(({ props }) => props.points))
    .toEqual([[30.5, 5, 30.5, 54]]);
});

it('MS2b anchor 4: appends the acute angle of nonparallel lines', () => {
  const tree = overlay(measureBetween(edge(0, 0, 30, 0, 10, 0), edge(40, 0, 50, 10, 45, 5)));
  expect(texts(tree)).toContain('~35 11/32" · 45°');
});

it('keeps markers in screen pixels, previews translucent, and short or reversed labels readable', () => {
  const result = measureBetween(corner(0, 0), corner(1, 0));
  const tree = overlay(result, {
    hover: corner(2, 3), first: corner(4, 5), preview: result,
    toScreen: ({ x, y }) => ({ x: 10 + x * 5, y: 20 - y * 5 }),
  });
  expect(tree[0].props.listening).toBe(false);
  expect(tree.some(({ type, props }) => type === Group && props.opacity === 0.7)).toBe(true);
  const markers = tree.filter(({ type, props }) => type === Rect && props.width === 9);
  expect(markers.map(({ props }) => [props.x, props.y, props.height, props.fill]))
    .toEqual([[15.5, 0.5, 9, undefined], [25.5, -9.5, 9, '#f472b6']]);
  const label = tree.find(({ type, props }) => type === Group && props.rotation === 0);
  expect(label.props).toMatchObject({ x: 12.5, y: 32 });
  expect(tree.find(({ type, props }) => type === Rect && props.cornerRadius === 2).props)
    .toMatchObject({ fill: '#831843', height: 13 });
  expect(tree.find(({ type }) => type === Text).props).toMatchObject({ fontSize: 11, fill: '#fdf2f8' });
  for (const [x, y, angle] of [[-100, 0, 0], [0, -100, 90], [0, 100, 90], [-100, 100, -45]]) {
    const rotated = overlay(measureBetween(corner(0, 0), corner(x, y)));
    const main = rotated.filter(({ type, props }) => type === Group && props.rotation !== undefined).at(-1);
    expect(main.props.rotation).toBeCloseTo(angle);
  }
  for (const kind of ['mid', 'edge', 'on-edge', 'free']) {
    const pick = { ...edge(0, 0, 20, 0, 8, 0), kind };
    const markers = nodes(MeasureOverlay({ first: pick, hover: pick, measures: [], toScreen: identity }));
    const shapes = lines(markers);
    if (kind === 'mid') {
      expect(shapes.map(({ props }) => [props.closed, props.fill]))
        .toEqual([[true, undefined], [true, '#f472b6']]);
    } else if (kind === 'edge' || kind === 'on-edge') {
      expect(shapes.filter(({ props }) => props.points.length === 4 && props.points[2] === 20)
        .map(({ props }) => props.strokeWidth)).toEqual([2, kind === 'edge' ? 3 : 2]);
      expect(shapes[1].props.points).toEqual([4.5, -3.5, 11.5, 3.5]);
    } else {
      expect(shapes[0].props.points).toEqual([4.5, 0, 11.5, 0]);
      expect(shapes[1].props.points).toEqual([8, -3.5, 8, 3.5]);
    }
  }
});

it('TX1 c anchor 4: doubles measure text and its pill while preserving ticks and markers', () => {
  const result = measureBetween(corner(0, 0), corner(48, 34.5));
  const extra = { hover: corner(2, 3) };
  const original = overlay(result, extra);
  const scaled = overlay(result, { ...extra, transform: { text: { dimension: 2 } } });
  expect(scaled.filter(({ type }) => type === Text).map(({ props }) => props.fontSize)).toEqual([22, 22, 22]);
  const pills = (tree) => tree.filter(({ type, props }) => type === Rect && props.cornerRadius === 2);
  pills(scaled).forEach(({ props }, index) => {
    expect(props.height).toBe(24);
    expect(props.width).toBeCloseTo((pills(original)[index].props.width - 6) * 2 + 6);
  });
  expect(lines(scaled).map(({ props }) => props)).toEqual(lines(original).map(({ props }) => props));
  expect(scaled.find(({ type, props }) => type === Rect && props.width === 9).props)
    .toEqual(original.find(({ type, props }) => type === Rect && props.width === 9).props);
});
