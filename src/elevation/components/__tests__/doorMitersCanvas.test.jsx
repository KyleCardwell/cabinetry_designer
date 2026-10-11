import { describe, expect, it, vi } from 'vitest';
import { Line } from 'react-konva';
import DoorDetails from '../DoorDetails.jsx';

vi.mock('react-konva', () => ({ Line: 'line', Rect: 'rect', Text: 'text' }));

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}

const part = {
  key: 'door', x: 10, z: 5, width: 15, height: 30,
  openings: [], openingsShown: false, lines: [],
  miters: [
    { x1: 11, z1: 6, x2: 10, z2: 5 },
    { x1: 24, z1: 6, x2: 25, z2: 5 },
    { x1: 24, z1: 34, x2: 25, z2: 35 },
    { x1: 11, z1: 34, x2: 10, z2: 35 },
  ],
};
const transform = { scale: 10, offsetX: 20, offsetY: 30, wallHeight: 40 };
const render = (door = part, showDetails = true, scale = transform.scale) => nodes(DoorDetails({
  parts: [door], warnings: [], transform: { ...transform, scale }, showDetails, showTags: false,
})).filter(({ type }) => type === Line);

describe('Step 483 canvas miters', () => {
  it('renders four miters with the profile stroke and transformed endpoints even when openings are hidden', () => {
    const lines = render();
    expect(lines).toHaveLength(4);
    expect(lines.map(({ props }) => props.points)).toEqual([
      [130, 370, 120, 380],
      [260, 370, 270, 380],
      [260, 90, 270, 80],
      [130, 90, 120, 80],
    ]);
    for (const { props } of lines) {
      expect(props).toMatchObject({ stroke: '#cbd5e1', strokeWidth: 0.75, listening: false });
    }
  });

  it('hides miters when details are off and accepts parts without miters', () => {
    expect(render(part, false)).toHaveLength(0);
    expect(render({ ...part, miters: undefined })).toHaveLength(0);
  });

  it('skips segments shorter than two screen pixels, retaining the boundary and diagonal lengths', () => {
    const door = { ...part, miters: [
      { x1: 10, z1: 5, x2: 10, z2: 5 },
      { x1: 10, z1: 5, x2: 10.125, z2: 5 },
      { x1: 10, z1: 5, x2: 10.25, z2: 5 },
      { x1: 10, z1: 5, x2: 10.1875, z2: 5.1875 },
    ] };
    expect(render(door, true, 8).map(({ props }) => props.points)).toEqual([
      [100, 310, 102, 310],
      [100, 310, 101.5, 308.5],
    ]);
    expect(render(door, true, 4)).toHaveLength(0);
  });
});
