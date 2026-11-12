import { describe, expect, it, vi } from 'vitest';
import { Text } from 'react-konva';
import { screenPointToWallSnapped } from '../canvas/drag.js';
import { wallToScreen } from '../canvas/transform.js';
import { DEFAULT_SETTINGS } from '../model/constants.js';
import { line } from '../../test/builders.js';
import { layoutLineAt } from './canvas/useStageClick.js';
import LayoutLines from './LayoutLines.jsx';

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

});

describe('LL5 b draggable layout lines', () => {
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
