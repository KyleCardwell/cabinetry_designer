import { expect, it, vi } from 'vitest';
import { useState } from 'react';
import { newShape, shapeViewProfile } from '../../../elevation/model/libraryShapes.js';
import ProfileCanvas from '../ProfileCanvas.jsx';
import { toScreen } from '../profileView.js';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useEffect: vi.fn(),
  useReducer: (reducer, initial, init) => [init(initial), vi.fn()],
  useCallback: (callback) => callback,
  useImperativeHandle: vi.fn(), useRef: (current) => ({ current }) }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];

it('draws optional shaded bands across the canvas, following pan/zoom and y-up coordinates without catching clicks', () => {
  const profile = shapeViewProfile(newShape([], 'test-shape'), 'front');
  const size = { width: 800, height: 600 };
  const bands = [
    { dir: 'vertical', from: 3, to: 7, problem: false },
    { dir: 'horizontal', from: -2, to: 1, problem: true },
  ];
  const before = structuredClone({ profile, bands });
  for (const view of [{ cx: 4, cy: 2, scale: 50 }, { cx: -1, cy: 3, scale: 100 }]) {
    const render = (props) => {
      useState.mockImplementation((initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()]);
      useState.mockReturnValueOnce([size, vi.fn()]).mockReturnValueOnce([view, vi.fn()]);
      return ProfileCanvas.render({ profile, grid: 1 / 16, selection: null, tool: 'select', ...props }, null);
    };
    const tree = render({ bands });
    const strips = nodes(tree).filter((node) => node.type === 'rect');
    expect(strips).toHaveLength(2);
    expect(strips[0].props).toMatchObject({ x: toScreen(view, size, [3, 0])[0], y: 0,
      width: 4 * view.scale, height: 600, fill: '#fbbf24', fillOpacity: 0.18 });
    expect(strips[1].props).toMatchObject({ x: 0, y: toScreen(view, size, [0, 1])[1],
      width: 800, height: 3 * view.scale, fill: '#f87171', fillOpacity: 0.18 });
    expect(nodes(tree).find((node) => node.props?.children?.[0] === strips[0]).props.pointerEvents).toBe('none');
    expect(nodes(render({})).filter((node) => node.type === 'rect')).toHaveLength(0);
  }
  expect({ profile, bands }).toEqual(before);
});
