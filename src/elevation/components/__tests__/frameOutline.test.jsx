import { expect, it, vi } from 'vitest';
import { Rect, Shape } from 'react-konva';
import { runScene } from '../../model/runScene.js';
import { notchedFrameRoom, notchedFrameSettings } from '../../model/__tests__/fixtures/notchedFrame.js';
import FrameOutline from '../FrameOutline.jsx';

vi.mock('react-konva', () => ({ Rect: 'rect', Shape: 'shape' }));

const transform = { scale: 4, offsetX: 10, offsetY: 20, wallHeight: 96 };
const regionFor = (room) => runScene(room, room.walls[0], room.walls[0].runs[0],
  notchedFrameSettings).frames.regions[0];
const trace = (node) => {
  const path = [];
  node.props.sceneFunc({
    beginPath: () => path.push('begin'),
    moveTo: (...point) => path.push(['move', ...point]),
    lineTo: (...point) => path.push(['line', ...point]),
    closePath: () => path.push('close'),
    fillStrokeShape: () => {},
  });
  return path;
};

it('ST2 anchor 1: traces the base frame notch in transformed screen coordinates', () => {
  const region = regionFor(notchedFrameRoom());
  const node = FrameOutline({ region, transform });
  expect(node.type).toBe(Shape);
  expect(node.props).toMatchObject({
    fillEnabled: false, stroke: '#e7e5e4', strokeWidth: 1, listening: false,
  });
  expect(trace(node)).toEqual([
    'begin', ['move', 10, 388], ['line', 370, 388], ['line', 370, 266],
    ['line', 246, 266], ['line', 246, 274], ['line', 134, 274],
    ['line', 134, 266], ['line', 10, 266], 'close',
  ]);
});

it('ST2 anchor 2: keeps unstepped and empty-notch frames rectangular', () => {
  const region = regionFor(notchedFrameRoom({}));
  for (const candidate of [region, { ...region, notches: [] }]) {
    const node = FrameOutline({ region: candidate, transform });
    expect(node.type).toBe(Rect);
    expect(node.props).toMatchObject({
      x: 10, y: 266, width: 360, height: 122,
      fillEnabled: false, stroke: '#e7e5e4', strokeWidth: 1, listening: false,
    });
  }
});

it('walks multiple top and bottom notches in perimeter order without mutating the region', () => {
  const region = { x: 10, z: 20, width: 30, height: 10, notches: [
    { edge: 'top', x: 30, z: 27, width: 5, height: 3 },
    { edge: 'bottom', x: 30, z: 20, width: 5, height: 2 },
    { edge: 'top', x: 15, z: 29, width: 5, height: 1 },
    { edge: 'bottom', x: 15, z: 20, width: 5, height: 4 },
  ] };
  const before = structuredClone(region);
  expect(trace(FrameOutline({ region,
    transform: { scale: 1, offsetX: 0, offsetY: 0, wallHeight: 50 },
  }))).toEqual([
    'begin', ['move', 10, 30], ['line', 15, 30], ['line', 15, 26],
    ['line', 20, 26], ['line', 20, 30], ['line', 30, 30], ['line', 30, 28],
    ['line', 35, 28], ['line', 35, 30], ['line', 40, 30], ['line', 40, 20],
    ['line', 35, 20], ['line', 35, 23], ['line', 30, 23], ['line', 30, 20],
    ['line', 20, 20], ['line', 20, 21], ['line', 15, 21], ['line', 15, 20],
    ['line', 10, 20], 'close',
  ]);
  expect(region).toEqual(before);
});
