import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentHoverLabel, hideHoverLabel, pieceSizeText } from '../../canvas/hoverLabel.js';
import PieceRect from '../PieceRect.jsx';

vi.mock('react', async (original) => ({
  ...await original(),
  useState: vi.fn((initial) => [initial, vi.fn()]),
}));
vi.mock('react-konva', () => ({
  Group: 'group', Label: 'label', Layer: 'layer', Rect: 'rect', Tag: 'tag', Text: 'text',
}));
vi.mock('../../canvas/cursor.js', async (original) => ({
  ...await original(), useCursorKeys: () => ({ request: vi.fn(), release: vi.fn() }),
}));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const transform = { scale: 10, offsetX: 20, offsetY: 30, wallHeight: 96, text: { label: 2 } };
const box = { id: 'c1', kind: 'cabinet', auto: true, x: 0, z: 4, width: 28.5, height: 30.5 };

afterEach(() => hideHoverLabel());

describe('hover size label (EC2)', () => {
  it('formats W × H, with run flex after the width', () => {
    expect(pieceSizeText(box)).toBe('28 1/2 × 30 1/2');
    expect(pieceSizeText({ ...box, width: 30.125, absorbed: 0.125 })).toBe('30 1/8 (+1/8) × 30 1/2');
    expect(pieceSizeText({ ...box, absorbed: -0.25 })).toBe('28 1/2 (-1/4) × 30 1/2');
  });

  it.each([
    [false, ['28 1/2 × 30 1/2', 'Note']],
    [true, ['28 1/2 × 30 1/2']],
  ])('a hovered piece (framed %s) reports its size to the top layer and draws no label itself', (framed, lines) => {
    const tree = PieceRect({ piece: box, transform, framed, notes: ['Note'], onSelect: vi.fn() });
    expect(nodes(tree).filter(({ type }) => type === 'label')).toHaveLength(0);
    tree.props.onMouseEnter();
    expect(currentHoverLabel()).toEqual({
      id: 'c1', rect: { x: 20, y: 645, width: 285, height: 305 }, lines, fontSize: 22,
    });
    tree.props.onMouseLeave();
    expect(currentHoverLabel()).toBeNull();
  });

});
