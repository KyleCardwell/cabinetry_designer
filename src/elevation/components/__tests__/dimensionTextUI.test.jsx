import { describe, expect, it, vi } from 'vitest';
import { Text } from 'react-konva';
import CellChains from '../CellChains.jsx';
import ClearanceCallouts from '../ClearanceCallouts.jsx';
import DragPreview from '../DragPreview.jsx';
import FaceOutlines from '../FaceOutlines.jsx';
import PieceRect from '../PieceRect.jsx';
import PlanClearances from '../../plan/PlanClearances.jsx';

vi.mock('react-konva', () => ({
  Group: 'group', Label: 'label', Line: 'line', Rect: 'rect', Tag: 'tag', Text: 'text',
}));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal(), useState: (initial) => [initial, vi.fn()],
}));
vi.mock('../../canvas/cursor.js', () => ({
  CURSORS: { select: 'select' }, useCursorKeys: () => ({ request: vi.fn(), release: vi.fn() }),
}));

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  if (typeof tree.type === 'function') return nodes(tree.type(tree.props));
  return [tree, ...nodes(tree.props?.children)];
}
const texts = (tree) => nodes(tree).filter(({ type }) => type === Text).map(({ props }) => props.text);
const transform = { scale: 10, offsetX: 0, offsetY: 0, wallHeight: 96 };

describe('SPEC-50.14 canvas dimension text', () => {
  it('omits inch marks on measured sizes and clearances while retaining descriptive sublabels', () => {
    const piece = { id: 'piece', kind: 'cabinet', x: 0, z: 4, width: 24.875, height: 30, absorbed: 1 / 16 };
    expect(texts(PieceRect({ piece, transform, subLabel: 'Panel 24 7/8"' })))
      .toEqual(['24 7/8 (+1/16)', 'Panel 24 7/8"', '*']);
    expect(texts(DragPreview({ run: piece, valid: true, transform }))).toEqual(['24 7/8']);
    expect(texts(FaceOutlines({
      faces: [{ ...piece, path: 'face', height: 24.875 }], transform, showSizes: true,
    }))).toEqual(['24 7/8']);
    expect(texts(CellChains({
      grids: ['row', 'col'].map((axis) => ({
        id: axis, axis, x: 0, z: 0, width: 30, height: 30,
        tracks: [{ id: 'track', start: 0, end: 24.875 }],
      })), transform,
    }))).toEqual(['24 7/8', '24 7/8']);
    expect(texts(ClearanceCallouts({
      callouts: [{ openingId: 'opening', side: 'left', start: 0, end: 30, z: 40, violated: true, required: 24 }],
      transform,
    }))).toEqual(['30 (24)']);
    expect(texts(PlanClearances({
      dimensions: [{ kind: 'aisle', from: { x: 0, y: 0 }, to: { x: 30, y: 0 }, length: 30 }], scale: 4,
    }))).toEqual(['30']);
  });
});
