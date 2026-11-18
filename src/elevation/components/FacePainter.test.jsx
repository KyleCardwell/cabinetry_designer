import { expect, it, vi } from 'vitest';
import { Rect, Shape } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import FacePainter from './FacePainter.jsx';

vi.mock('react-konva', () => ({ Group: 'group', Line: 'line', Rect: 'rect', Shape: 'shape', Text: 'text' }));

it('fills the frame around its holes, strokes only the outer edge solid, and dashes openings with doors off (GC6.2)', () => {
  const transform = { offsetX: 0, offsetY: 0, wallHeight: 50, scale: 2 };
  const hole = { x: 1.5, z: 1.5, width: 27, height: 27 };
  const part = { id: 'frame', kind: 'frame', x: 0, z: 0, width: 30, height: 30, holes: [hole] };
  const tree = FacePainter({ entries: [{ part, pulls: [], swingMarks: [], legLoops: [] }], transform, doorsOff: true });
  const children = tree.props.children[0].props.children.flat().filter(Boolean);
  const outer = children.find(({ type }) => type === Shape);
  const opening = children.find(({ type }) => type === Rect);
  expect(opening.props).toMatchObject({
    ...wallRectToScreen(hole, transform), dash: [4, 3], fillEnabled: false,
    stroke: outer.props.stroke, strokeWidth: outer.props.strokeWidth,
  });
  const paths = [];
  let path;
  const context = {
    beginPath() { path = []; },
    rect(...rect) { path.push(rect); },
    fillShape() { paths.push(['fill', [...path]]); },
    strokeShape() { paths.push(['stroke', [...path]]); },
  };
  outer.props.sceneFunc(context, {});
  const box = wallRectToScreen(part, transform);
  const cutout = wallRectToScreen(hole, transform);
  const boxPath = [box.x, box.y, box.width, box.height];
  expect(outer.props.fillRule).toBe('evenodd');
  expect(paths).toEqual([
    ['fill', [boxPath, [cutout.x, cutout.y, cutout.width, cutout.height]]],
    ['stroke', [boxPath]],
  ]);
  expect(outer.props.dash).toBeUndefined();
});
