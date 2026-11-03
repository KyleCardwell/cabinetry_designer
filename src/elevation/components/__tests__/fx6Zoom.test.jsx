import { expect, it, vi } from 'vitest';
import { Line } from 'react-konva';
import DimensionRow from '../DimensionRow.jsx';
import CellChains from '../CellChains.jsx';
import InteriorDimensions from '../InteriorDimensions.jsx';

vi.mock('react-konva', () => ({ Group: 'group', Line: 'line', Rect: 'rect', Text: 'text' }));
vi.mock('react', async (original) => ({
  ...await original(), useState: (initial) => [initial, vi.fn()], useMemo: (fn) => fn(),
}));
vi.mock('../../canvas/cursor.js', () => ({ useCursorKeys: () => ({}) }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object'
    ? typeof tree.type === 'function' ? nodes(tree.type(tree.props)) : [tree, ...nodes(tree.props?.children)] : [];
const transform = { scale: 4, offsetX: 0, offsetY: 0, wallHeight: 96 };
const halfLength = ({ props: { points: [x1, y1, x2, y2] } }) => Math.hypot(x2 - x1, y2 - y1) / 2;

it('FX6 b scales dimension row ticks by 4 × factor and wall-end ticks by 6 × factor', () => {
  for (const factor of [1, 1.5, 2]) {
    for (const side of ['above', 'below', 'left', 'right']) {
      const tree = nodes(DimensionRow({
        segments: [{ start: 0, end: 96, kind: 'wall' }],
        orientation: ['above', 'below'].includes(side) ? 'horizontal' : 'vertical', side,
        offsetPx: 40, wallEndMarks: [0, 96], wallLength: 96,
        transform: { ...transform, ...(factor === 1 ? {} : { text: { dimension: factor } }) },
      }));
      const ticks = tree.filter(({ type, props }) => type === Line && props.stroke === '#94a3b8');
      expect(ticks).toHaveLength(2);
      ticks.forEach((tick) => {
        expect(halfLength(tick)).toBeCloseTo(4 * factor);
        expect(tick.props.strokeWidth).toBe(1);
      });
      const wallEnds = tree.filter(({ type, props }) => type === Line && props.strokeWidth === 2);
      expect(wallEnds).toHaveLength(2);
      wallEnds.forEach((tick) => expect(halfLength(tick)).toBeCloseTo(6 * factor));
    }
  }
});

it('FX6 b scales both cell-chain and interior tick orientations without changing their strokes', () => {
  const scaled = { ...transform, text: { dimension: 1.5 } };
  for (const axis of ['row', 'col']) {
    const tree = nodes(CellChains({ grids: [{ id: 'grid', axis, x: 0, z: 0,
      tracks: [{ id: 'track', start: 0, end: 20 }] }], transform: scaled }));
    const ticks = tree.filter(({ type, key }) => type === Line && key?.startsWith('tick:'));
    expect(ticks).toHaveLength(2);
    ticks.forEach((tick) => expect(halfLength(tick)).toBe(4.5));
  }
  for (const dimFrom of ['bottom', 'left', 'right']) {
    const tree = nodes(InteriorDimensions({ entry: { itemId: 'cabinet',
      box: { x: 0, z: 0, width: 24 }, dividers: [{ path: 'r', index: 0, dimFrom,
        x: 0, z: 0, height: 0, fromBottom: 10, fromLeft: 10, fromRight: 14 }] }, transform: scaled }));
    const ticks = tree.filter(({ type, key }) => type === Line && ['0', '1'].includes(key));
    expect(ticks).toHaveLength(2);
    ticks.forEach((tick) => {
      expect(halfLength(tick)).toBe(4.5);
      expect(tick.props.strokeWidth).toBe(1);
    });
  }
});
