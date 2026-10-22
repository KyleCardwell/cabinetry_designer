import { describe, expect, it, vi } from 'vitest';
import { Rect } from 'react-konva';
import { topSegmentRoom, topSegmentSettings } from '../../model/__tests__/fixtures/topSegments.js';
import RunGroup from '../RunGroup.jsx';

vi.mock('react', async (original) => ({ ...await original(),
  useMemo: (callback) => callback(), useState: (initial) => [initial, vi.fn()],
  useRef: (current) => ({ current }), useId: () => 'top-segments', useEffect: vi.fn(),
}));
vi.mock('react-konva', () => ({
  Group: 'group', Label: 'label', Line: 'line', Rect: 'rect', Shape: 'shape', Tag: 'tag', Text: 'text',
}));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];

describe('ST4 step c top segment canvas', () => {
  it('draws both stone spans and the wood insert at the anchor coordinates', () => {
    const room = topSegmentRoom();
    const wall = room.walls[0];
    const tree = RunGroup.type({ room, wall, run: wall.runs[0], settings: topSegmentSettings,
      transform: { scale: 4, offsetX: 10, offsetY: 20, wallHeight: 96 } });
    expect(nodes(tree).filter(({ type, props }) => type === Rect && props.stroke === '#64748b')
      .map(({ props: { x, y, width, height, fill } }) => [x, y, width, height, fill]))
      .toEqual([
        [7, 260, 123, 6, '#cbd5e1'], [250, 260, 123, 6, '#cbd5e1'],
        [130, 260, 120, 14, '#c8a27a'],
      ]);
  });
});
