import { expect, it, vi } from 'vitest';
import { Group, Line, Rect, Text } from 'react-konva';
import DimensionRow from '../DimensionRow.jsx';
import CellChains from '../CellChains.jsx';
import InteriorDimensions from '../InteriorDimensions.jsx';
import ClearanceCallouts from '../ClearanceCallouts.jsx';

vi.mock('react-konva', () => ({ Group: 'group', Line: 'line', Rect: 'rect', Text: 'text' }));
vi.mock('react', async (original) => ({
  ...await original(), useState: (initial) => [initial, vi.fn()], useMemo: (fn) => fn(),
}));
vi.mock('../../canvas/cursor.js', () => ({ useCursorKeys: () => ({}) }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object'
    ? typeof tree.type === 'function' ? nodes(tree.type(tree.props)) : [tree, ...nodes(tree.props?.children)] : [];
const transform = { scale: 40, offsetX: 0, offsetY: 0, wallHeight: 96 };

it('TX1 c anchor 3: grows dimension labels, boxes and popout leaders with fixed padding and ticks', () => {
  for (const orientation of ['horizontal', 'vertical']) {
    const props = {
      segments: [{ start: 0, end: 1.5, kind: 'run' }], orientation,
      side: orientation === 'horizontal' ? 'below' : 'left', offsetPx: 40, onSegmentClick: vi.fn(),
    };
    const original = nodes(DimensionRow({ ...props, transform }));
    expect(original.find(({ type }) => type === Text).props.fontSize).toBe(11);
    const scaled = nodes(DimensionRow({ ...props, transform: { ...transform, text: { dimension: 2 } } }));
    const text = scaled.find(({ type }) => type === Text).props;
    expect(text.fontSize).toBe(22);
    const box = scaled.find(({ type, props }) => type === Rect && props.rotation !== undefined).props;
    expect(box.height).toBe(30);
    expect(box.width - text.width).toBe(8);
    expect(box.offsetY).toBe(15);
    expect(text.width).toBeCloseTo(5 * 0.6 * 22 + 8);
    // The same 60px segment now needs a popout with a doubled 24px leader.
    const leader = scaled.find(({ type, props }) => type === Line && props.strokeWidth === 0.75
      && Math.abs(props.points[2] - props.points[0]) + Math.abs(props.points[3] - props.points[1]) === 24);
    expect(leader).toBeDefined();
    const ticks = (tree) => tree.filter(({ type, props }) => type === Line && props.stroke === '#94a3b8')
      .map(({ props }) => props);
    expect(ticks(scaled)).toEqual(ticks(original));
  }
});

it('scales cell, interior and clearance text, editing boxes, fit checks and lane offsets', () => {
  const zoomed = { ...transform, scale: 4, text: { dimension: 2 } };
  for (const axis of ['row', 'col']) {
    const tree = nodes(CellChains({ grids: [{ id: 'grid', axis, x: 0, z: 0,
      tracks: [{ id: 'track', start: 0, end: 20 }] }], transform: zoomed, editable: true }));
    expect(tree.find(({ type }) => type === Text).props).toMatchObject({ fontSize: 20, height: 20 });
    expect(tree.find(({ type }) => type === Rect).props.height).toBe(20);
    expect(tree.find(({ type }) => type === Line).props.points).toEqual(axis === 'row'
      ? [17, 384, 23, 384] : [0, 361, 0, 367]);
    const short = nodes(CellChains({ grids: [{ id: 'grid', axis, x: 0, z: 0,
      tracks: [{ id: 'track', start: 0, end: 10 }] }], transform: zoomed }));
    expect(short.some(({ type }) => type === Text)).toBe(false); // 40px < scaled 48px minimum.
  }
  const interior = nodes(InteriorDimensions({ entry: { itemId: 'cabinet',
    box: { x: 0, z: 0, width: 24 }, dividers: [{ path: 'r', index: 0, dimFrom: 'bottom',
      x: 0, z: 0, height: 0, fromBottom: 10, fromLeft: 10, fromRight: 14 }] },
  transform: zoomed, editable: true }));
  expect(interior.find(({ type }) => type === Text).props).toMatchObject({ fontSize: 20, height: 20 });
  expect(interior.find(({ type }) => type === Rect).props.height).toBe(20);
  expect(interior.find(({ type, props }) => type === Group && props.rotation === -90).props.x).toBe(6);
  const callouts = [{ openingId: 'opening', side: 'left', start: 0, end: 10, z: 40 }];
  const original = nodes(ClearanceCallouts({ callouts, transform: { ...transform, scale: 4 } }));
  const scaled = nodes(ClearanceCallouts({ callouts, transform: zoomed }));
  expect(original.find(({ type }) => type === Text).props).toMatchObject({ fontSize: 11, width: 13.2 });
  expect(scaled.find(({ type }) => type === Text).props)
    .toMatchObject({ fontSize: 22, width: 160, y: 56 * 4 - 28 }); // Larger text no longer fits inline.
  expect(scaled.filter(({ type }) => type === Line).slice(-2).map(({ props }) => props.points))
    .toEqual(original.filter(({ type }) => type === Line).slice(-2).map(({ props }) => props.points));
});
