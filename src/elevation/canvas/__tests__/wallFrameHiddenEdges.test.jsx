import { describe, expect, it, vi } from 'vitest';
import WallFrame from '../../components/WallFrame.jsx';
import SoffitShapes from '../../components/SoffitShapes.jsx';

vi.mock('react-konva', () => ({ Group: 'group', Line: 'line', Rect: 'rect', Text: 'text' }));

const transform = { scale: 1, offsetX: 0, offsetY: 0, wallHeight: 96 };
const wall = { id: 'B', side: 'front', length: 60, height: 96, soffits: [], recesses: [] };
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const solidLines = (tree) => nodes(tree)
  .filter((node) => node.type === 'line' && node.props.stroke === '#94a3b8').map((node) => node.props.points);

describe('combined soffit joins on the canvas (Kyle 2026-10-23)', () => {
  it('draws the wall outline as one stroked rect without hidden edges', () => {
    const tree = WallFrame({ wall, transform });
    expect(nodes(tree).find((node) => node.type === 'rect').props.strokeEnabled).toBe(true);
    expect(solidLines(tree)).toEqual([]);
  });

  it('leaves a hidden side span out of the wall outline', () => {
    const tree = WallFrame({ wall, transform, hiddenEdges: { left: [], right: [{ bottom: 84, top: 96 }] } });
    expect(nodes(tree).find((node) => node.type === 'rect').props.strokeEnabled).toBe(false);
    // Bottom, top, the whole left side, and the right side only below the soffit (screen y = 96 - z).
    expect(solidLines(tree)).toEqual([[0, 96, 60, 96], [0, 0, 60, 0], [0, 96, 0, 0], [60, 96, 60, 12]]);
  });

  it('opens the joined soffit side', () => {
    const soffit = { id: 'S', side: 'front', x: 30, width: 30, bottom: 84, depth: 16 };
    const view = { ...wall, soffits: [soffit] };
    const sides = (combinedJoins) => SoffitShapes({ room: { walls: [] }, wall: view, transform, combinedJoins })
      .flatMap(nodes).filter((node) => node.type === 'line').map((node) => node.props.points);
    expect(sides([])).toContainEqual([60, 0, 60, 12]);
    expect(sides([{ soffitId: 'S', side: 'right', bottom: 84, top: 96 }])).not.toContainEqual([60, 0, 60, 12]);
  });
});
