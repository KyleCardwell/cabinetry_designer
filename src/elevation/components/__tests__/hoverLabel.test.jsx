import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  currentHoverLabel, hideHoverLabel, pieceSizeText, showHoverLabel,
} from '../../canvas/hoverLabel.js';
import { HOVER_TINT, HoverLabelShapes } from '../HoverLabelLayer.jsx';
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

describe('EC2 hover size label', () => {
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

  it('leaving another piece keeps the current label; hide with no id always clears', () => {
    showHoverLabel({ id: 'a', rect: { x: 0, y: 0, width: 1, height: 1 }, lines: ['x'] });
    hideHoverLabel('b');
    expect(currentHoverLabel()?.id).toBe('a');
    hideHoverLabel();
    expect(currentHoverLabel()).toBeNull();
  });

  it('draws a tint over the piece and the label above it', () => {
    expect(HoverLabelShapes({ label: null })).toBeNull();
    const rect = { x: 10, y: 20, width: 100, height: 50 };
    const all = nodes(HoverLabelShapes({ label: { id: 'a', rect, lines: ['30 × 34 1/2', 'Note'], fontSize: 22 } }));
    expect(all.find(({ type }) => type === 'rect').props).toMatchObject({ ...rect, fill: HOVER_TINT });
    expect(all.find(({ type }) => type === 'label').props).toMatchObject({ x: 60, y: 15 });
    expect(all.find(({ type }) => type === 'text').props).toMatchObject({ text: '30 × 34 1/2 · Note', fontSize: 22 });
  });
});
