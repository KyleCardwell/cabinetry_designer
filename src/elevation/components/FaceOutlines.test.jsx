import { describe, expect, it, vi } from 'vitest';
import { Rect, Text } from 'react-konva';
import FaceOutlines from './FaceOutlines.jsx';

vi.mock('react-konva', () => ({ Rect: 'rect', Text: 'text' }));

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}

const face = { path: 'r.0', type: 'open', x: 10, z: 5, width: 24, height: 30 };
const transform = { scale: 8, offsetX: 20, offsetY: 30, wallHeight: 96 };

describe('FX6 step a open face outlines', () => {
  it.each([false, true])('hides the unselected open outline and size; selectable=%s', (selectable) => {
    const onSelectFace = vi.fn();
    const tree = nodes(FaceOutlines({ faces: [face], transform, selectable,
      showSizes: true, onSelectFace }));
    const rect = tree.find(({ type }) => type === Rect);
    expect(rect.props).toMatchObject({ strokeEnabled: false, listening: selectable });
    expect(rect.props.fill).toBe(selectable ? 'rgba(0, 0, 0, 0.001)' : undefined);
    expect(tree.filter(({ type }) => type === Text)).toHaveLength(0);
    if (selectable) {
      const event = { cancelBubble: false };
      rect.props.onClick(event);
      expect(event.cancelBubble).toBe(true);
      expect(onSelectFace).toHaveBeenCalledWith('r.0');
    } else {
      expect(rect.props.onClick).toBeUndefined();
    }
  });

  it('draws a selected open face with a solid blue outline and no size', () => {
    const tree = nodes(FaceOutlines({ faces: [face], transform,
      selectedPath: face.path, showSizes: true }));
    const rect = tree.find(({ type }) => type === Rect);
    expect(rect.props).toMatchObject({ strokeEnabled: true, stroke: '#7dd3fc', strokeWidth: 2 });
    expect(rect.props.dash).toBeUndefined();
    expect(tree.filter(({ type }) => type === Text)).toHaveLength(0);
  });

  it('keeps the door outline and size label', () => {
    const tree = nodes(FaceOutlines({ faces: [{ ...face, type: 'door' }],
      transform, showSizes: true }));
    const rect = tree.find(({ type }) => type === Rect);
    expect(rect.props).toMatchObject({ strokeEnabled: true, stroke: '#e2e8f0', strokeWidth: 1 });
    expect(rect.props.dash).toBeUndefined();
    expect(tree.filter(({ type }) => type === Text)).toHaveLength(1);
  });

  it('keeps the solid framed opening outline and hides its size', () => {
    const tree = nodes(FaceOutlines({ faces: [face], transform, framed: true, showSizes: true }));
    const rect = tree.find(({ type }) => type === Rect);
    expect(rect.props).toMatchObject({ strokeEnabled: true, stroke: '#e2e8f0', strokeWidth: 1 });
    expect(rect.props.dash).toBeUndefined();
    expect(tree.filter(({ type }) => type === Text)).toHaveLength(0);
  });
});
