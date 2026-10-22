import { describe, expect, it, vi } from 'vitest';
import { Group, Line, Rect, Text } from 'react-konva';
import InteriorDimensions from '../InteriorDimensions.jsx';
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


describe('DM7 other canvas dimension lines', () => {
  const lines = (tree) => nodes(tree).filter(({ type }) => type === Line).map(({ props }) => props.points);
  const length = ([x1, y1, x2, y2]) => Math.hypot(x2 - x1, y2 - y1);

  it('gaps each cell track at exact fit on both axes, preserving short labels, ticks and editing', () => {
    for (const axis of ['row', 'col']) {
      for (const scale of [2.8, 2.79, 2]) {
        const onEditTrack = vi.fn();
        const tree = CellChains({
          grids: [{ id: 'grid', axis, x: 0, z: 0, width: 20, height: 20,
            tracks: [{ id: 'first', start: 0, end: 10 }, { id: 'second', start: 10, end: 20 }] }],
          transform: { ...transform, scale }, editable: true, onEditTrack,
        });
        const all = nodes(tree);
        // Three shared boundary ticks, plus independent line pieces for each track.
        expect(lines(tree)).toHaveLength(scale === 2.8 ? 7 : 5);
        for (const id of ['first', 'second']) {
          const track = all.find(({ key }) => key === id);
          const pieces = lines(track);
          expect(pieces).toHaveLength(scale === 2.8 ? 2 : 1);
          pieces.forEach((points) => expect(length(points)).toBeCloseTo(scale === 2.8 ? 4 : 10 * scale));
          const text = nodes(track).find(({ type }) => type === Text);
          if (scale === 2) {
            expect(text).toBeUndefined();
            continue;
          }
          const hit = nodes(track).find(({ type }) => type === Rect);
          if (axis === 'row') {
            const label = nodes(track).find(({ type, props }) => type === Group && props.rotation === -90);
            expect(label.props.x).toBe(scale === 2.8 ? 5 : 13);
            expect(label.props.y).toBeCloseTo((96 - (id === 'first' ? 5 : 15)) * scale);
          } else {
            expect(text.props.y).toBe(96 * scale - 10 - (scale === 2.8 ? 5 : 13));
            expect(hit.props.y).toBe(text.props.y);
          }
          const event = { target: { getStage: () => ({ getPointerPosition: () => ({ x: 20, y: 30 }) }) } };
          hit.props.onClick(event);
          expect(event.cancelBubble).toBe(true);
          expect(onEditTrack).toHaveBeenLastCalledWith({
            trackId: id, label: axis === 'row' ? 'Height' : 'Width', value: 10, x: 20, y: 30,
          });
        }
      }
    }
  });

  it('centres interior dimensions at exact fit from bottom, left and right, keeping beside fallbacks and previews', () => {
    for (const side of ['bottom', 'left', 'right']) {
      const entry = { itemId: 'cabinet', box: { x: 0, z: 0, width: 24 }, dividers: [{
        path: 'r', index: 0, dimFrom: side, x: 0, z: 0, height: 0,
        fromBottom: 10, fromLeft: side === 'right' ? 14 : 10, fromRight: 10,
      }] };
      for (const scale of [2.8, 2.79]) {
        const tree = InteriorDimensions({ entry, transform: { ...transform, scale }, editable: true });
        const pieces = lines(tree);
        expect(pieces).toHaveLength(scale === 2.8 ? 4 : 3);
        if (scale === 2.8) {
          expect(length(pieces[0])).toBeCloseTo(4);
          expect(length(pieces[1])).toBeCloseTo(4);
          const label = nodes(tree).find(({ type, props }) => type === Group && props.x !== undefined);
          if (side === 'bottom') {
            expect(label.props.x + 5).toBe(8);
            expect(label.props.y).toBeCloseTo(91 * scale);
          } else {
            expect(label.props.x).toBeCloseTo((side === 'left' ? 5 : 19) * scale);
            expect(label.props.y + 5).toBe(96 * scale + 8);
          }
        } else {
          const label = nodes(tree).find(({ type, props }) => type === Group && props.x !== undefined);
          if (side === 'bottom') expect(label.props.x).toBe(11);
          else expect(label.props.y).toBe(96 * scale + 11);
        }
      }
      const preview = InteriorDimensions({ entry, transform, dragPreview: {
        itemId: 'cabinet', key: 'r:0', delta: side === 'bottom' ? { x: 0, z: 1 } : { x: side === 'right' ? -1 : 1, z: 0 },
      } });
      expect(texts(preview)).toEqual(['11']);
      expect(lines(preview)).toHaveLength(4);
    }
  });

  it('gaps elevation and rotated plan clearances with screen-size padding, preserving short-span labels', () => {
    for (const scale of [2.92, 2.91]) {
      const tree = ClearanceCallouts({ callouts: [{ openingId: 'opening', side: 'left', start: 0, end: 10, z: 40 }],
        transform: { ...transform, scale } });
      const pieces = lines(tree);
      expect(pieces).toHaveLength(scale === 2.92 ? 4 : 3);
      const text = nodes(tree).find(({ type }) => type === Text).props;
      expect(text.y).toBe(56 * scale - (scale === 2.92 ? 5.5 : 14));
      if (scale === 2.92) {
        expect(length(pieces[0])).toBeCloseTo(4);
        expect(length(pieces[1])).toBeCloseTo(4);
      }
    }
    for (const scale of [0.5, 4, 10]) {
      for (const to of [{ x: 30, y: 0 }, { x: 0, y: -30 }, { x: -18, y: 24 }]) {
        const tree = PlanClearances({ dimensions: [{ kind: 'aisle', from: { x: 0, y: 0 }, to, length: 30 }], scale });
        const pieces = lines(tree);
        const fits = scale > 0.5;
        expect(pieces).toHaveLength(fits ? 4 : 3);
        if (fits) {
          // "30" is 15.6px wide; the gap adds 4px on each side at every zoom.
          expect((30 - length(pieces[0]) - length(pieces[1])) * scale).toBeCloseTo(23.6);
        }
        const label = nodes(tree).find(({ type, props }) => type === Group && props.rotation !== undefined).props;
        expect(label.x).toBe(to.x / 2);
        expect(label.y).toBe(to.y / 2);
        expect(label.rotation).toBeGreaterThanOrEqual(-90);
        expect(label.rotation).toBeLessThanOrEqual(90);
        expect(texts(tree)).toEqual(['30']);
      }
    }
    for (const [value, scale, fits] of [[10, 3.16, true], [10, 3.159, false], [0.5, 78.8, true], [0.5, 78.79, false]]) {
      const tree = PlanClearances({ dimensions: [{ kind: 'aisle', from: { x: 0, y: 0 },
        to: { x: 0, y: value }, length: value }], scale });
      const pieces = lines(tree);
      expect(pieces).toHaveLength(fits ? 4 : 3);
      if (fits) {
        expect(length(pieces[0]) * scale).toBeCloseTo(4);
        expect(length(pieces[1]) * scale).toBeCloseTo(4);
      }
    }
    const violated = ClearanceCallouts({ callouts: [{ openingId: 'opening', side: 'left', start: 0, end: 30, z: 40,
      violated: true, required: 24 }], transform });
    expect(texts(violated)).toEqual(['30 (24)']);
    expect(nodes(violated).find(({ type }) => type === Text).props.fill).toBe('#f59e0b');
    expect(300 - length(lines(violated)[0]) - length(lines(violated)[1])).toBeCloseTo(54.2);
  });
});
