import { describe, expect, it, vi } from 'vitest';
import { Line, Text } from 'react-konva';
import { screenPointToWallSnapped } from '../canvas/drag.js';
import { wallToScreen } from '../canvas/transform.js';
import { DEFAULT_SETTINGS } from '../model/constants.js';
import { openingGeometry } from '../model/openings.js';
import { attach, line, opening } from '../../test/builders.js';
import { layoutLineAt } from './canvas/useStageClick.js';
import LayoutLines, { LINE_COLOR } from './LayoutLines.jsx';
import OpeningShape from './OpeningShape.jsx';

vi.mock('react', async (original) => ({
  ...await original(), useRef: (current) => ({ current }), useEffect: vi.fn(), useId: () => 'id',
  useMemo: (callback) => callback(),
}));
vi.mock('react-konva', () => ({ Group: 'group', Line: 'line', Rect: 'rect', Text: 'text' }));
vi.mock('uuid', () => ({ v4: () => 'new-line' }));
const nodes = (tree) => {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  if (typeof tree.type === 'function') return nodes(tree.type(tree.props));
  return [tree, ...nodes(tree.props?.children)];
};

const transform = { scale: 2, offsetX: 10, offsetY: 20, wallHeight: 96 };
const face = { id: 'H', length: 240, height: 96, lines: [line('L1', 100)] };

describe('LL3 layout lines on the elevation', () => {
  it('1–2. adds a line from the nearer end, snapped', () => {
    const at = (x) => layoutLineAt(face, screenPointToWallSnapped(
      wallToScreen({ x, z: 10 }, transform), face, transform, DEFAULT_SETTINGS.openingSnap, 0,
    ).x);
    expect(at(61.3)).toEqual({ wallId: 'H', id: 'new-line', from: 'left', value: 61.5 });
    expect(at(200.2)).toEqual({ wallId: 'H', id: 'new-line', from: 'right', value: 40 });
    expect(layoutLineAt({ ...face, side: 'back' }, 10)).toMatchObject({ wallSide: 'back' });
  });

  it('3. draws a dashed line and label, and the distance when selected', () => {
    const plain = nodes(LayoutLines({ wall: face, transform, selectedLineId: null }));
    const dashed = plain.filter(({ type, props }) => type === Line && props.dash);
    expect(dashed).toHaveLength(1);
    const x = wallToScreen({ x: 100, z: 0 }, transform).x;
    expect(dashed[0].props).toMatchObject({ stroke: LINE_COLOR, strokeWidth: 1 });
    expect(dashed[0].props.points[0]).toBe(x);
    expect(dashed[0].props.points[2]).toBe(x);
    expect(plain.filter(({ type }) => type === Text).map(({ props }) => props.text)).toEqual(['L1']);

    const selected = nodes(LayoutLines({ wall: face, transform, selectedLineId: 'L1' }));
    expect(selected.find(({ type, props }) => type === Line && props.dash).props.strokeWidth).toBe(2);
    expect(selected.filter(({ type }) => type === Text).map(({ props }) => props.text)).toEqual(['L1', '100"']);
  });

  it('draws nothing on a face without lines', () => {
    expect(LayoutLines({ wall: { ...face, lines: [] }, transform })).toBeNull();
  });

  it('4. an attached opening is not draggable', () => {
    const item = opening({ kind: 'window', sillZ: 36, height: 40, attach: attach('L1') });
    const props = {
      opening: item, geometry: openingGeometry(item, 240, DEFAULT_SETTINGS), settings: DEFAULT_SETTINGS,
      transform, selected: true, selectable: true, onMove: vi.fn(),
    };
    expect(OpeningShape({ ...props, locked: true }).props.draggable).toBe(false);
    expect(OpeningShape(props).props.draggable).toBe(true);
  });
});

describe('LL5 b draggable layout lines', () => {
  it('anchor 1: only the selected line with drag handlers is draggable, with the appropriate cursor', () => {
    const onDragStart = vi.fn();
    const cursor = { request: vi.fn(), release: vi.fn() };
    for (const selected of [true, false]) {
      const tree = nodes(LayoutLines({ wall: face, transform, selectedLineId: selected ? 'L1' : null, onDragStart, cursor }));
      const drag = tree.find(({ props }) => props.dragBoundFunc);
      expect(drag.props.draggable).toBe(selected);
      drag.props.onMouseEnter();
      expect(cursor.request).toHaveBeenLastCalledWith(expect.any(String), selected ? 'ew-resize' : 'pointer');
    }
    const tree = nodes(LayoutLines({ wall: face, transform, selectedLineId: 'L1' }));
    expect(tree.find(({ props }) => props.dragBoundFunc).props.draggable).toBe(false);
  });

  it('converts the group’s screen delta to face x, keeps y fixed, resets on release, and leaves the dimension stored', () => {
    const onDragStart = vi.fn();
    const onDragMove = vi.fn();
    const position = vi.fn();
    const target = { x: () => 68, position };
    const onDragEnd = vi.fn(() => expect(position).toHaveBeenCalledWith({ x: 0, y: 0 }));
    const props = { wall: { ...face, lines: [line('L1', 140, { from: 'right' })] }, transform,
      selectedLineId: 'L1', onDragStart, onDragMove, onDragEnd };
    const tree = nodes(LayoutLines(props));
    const drag = tree.find(({ props }) => props.dragBoundFunc);
    expect(drag.props.dragBoundFunc({ x: 68, y: 50 })).toEqual({ x: 68, y: 0 });
    for (const handler of ['onDragStart', 'onDragMove', 'onDragEnd']) {
      const event = { target, cancelBubble: false };
      drag.props[handler](event);
      expect(event.cancelBubble).toBe(true);
    }
    expect(onDragStart).toHaveBeenCalledWith('L1');
    expect(onDragMove).toHaveBeenCalledWith('L1', 134);
    expect(onDragEnd).toHaveBeenCalledWith('L1', 134);
    expect(nodes(drag).filter(({ type }) => type === Text).map(({ props }) => props.text)).toEqual(['L1']);
    expect(tree.filter(({ type }) => type === Text).map(({ props }) => props.text)).toEqual(['L1', '140"']);
  });
});
