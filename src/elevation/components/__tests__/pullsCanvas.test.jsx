import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { Shape } from 'react-konva';
import elevationReducer from '../../store/elevationSlice.js';
import { run, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import { setFaceHinge } from '../../model/faceTree.js';
import DoorDetails from '../DoorDetails.jsx';
import FaceOutlines from '../FaceOutlines.jsx';
import RoomDoorStylesPanel from '../RoomDoorStylesPanel.jsx';
import RunGroup from '../RunGroup.jsx';
import SwingMarks from '../SwingMarks.jsx';
import Pulls from '../Pulls.jsx';

// Inspect component output and exercise callbacks with the real model and reducer.
vi.mock('react', async (original) => ({
  ...await original(),
  useMemo: (callback) => callback(),
  useState: (initial) => [initial, vi.fn()],
  useRef: (current) => ({ current }),
  useId: () => 'pulls',
  useEffect: vi.fn(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('react-konva', () => ({
  Group: 'group', Label: 'label', Line: 'line', Rect: 'rect', Shape: 'shape', Tag: 'tag', Text: 'text',
}));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const transform = { scale: 8, offsetX: 20, offsetY: 30, wallHeight: 96 };
const doorAndDrawers = [
  { id: 'single', kind: 'cabinet', width: 18, face: { type: 'door', hinge: 'left' } },
  { id: 'drawers', kind: 'cabinet', width: 18, face: {
    direction: 'vertical', size: null,
    children: [
      { type: 'drawer_front', size: null },
      { type: 'drawer_front', size: null },
      { type: 'drawer_front', size: null, pullCount: 2 },
    ],
  } },
];
let state;
let dispatch;

function setup(items = [{ id: 'single', kind: 'cabinet', width: 18, face: { type: 'door', hinge: 'left' } }]) {
  state = stateWithRun(run({
    width: items.reduce((sum, item) => sum + item.width, 0),
    autoCount: false,
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    items,
  }));
}

function panel() {
  const content = RoomDoorStylesPanel();
  return nodes(content.type(content.props));
}

const checkbox = () => panel().find(({ props }) => props['aria-label'] === 'Show pulls');
const toggle = (checked) => checkbox().props.onChange({ target: { checked } });
function canvas() {
  const room = state.rooms[0];
  const wall = room.walls[0];
  const tree = nodes(RunGroup.type({ room, wall, run: wall.runs[0], settings: state.settings, transform }));
  const layer = tree.find(({ type }) => type === Pulls);
  const shapes = layer ? nodes(Pulls(layer.props)).filter(({ type }) => type === Shape) : [];
  return { tree, layer, shapes };
}

beforeEach(() => {
  vi.clearAllMocks();
  setup();
  dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
});

describe('HP5 step b canvas pulls', () => {
  it('anchor 1: defaults on beneath swing marks and draws a single-door pull above marks and below faces', () => {
    const controls = panel().filter(({ props }) => props.type === 'checkbox');
    expect(controls.map(({ props }) => props['aria-label'])).toEqual([
      'Draw door details', 'Show style tags', 'Show swing marks', 'Show pulls',
    ]);
    expect(checkbox().props.checked).toBe(true);
    expect(state.rooms[0]).not.toHaveProperty('showPulls');
    expect(canvas().shapes).toHaveLength(1);
    // Both drawing switches are independent of pulls, even in an outlines-only room.
    for (const swings of [false, true]) {
      state.rooms[0].doorDetails = false;
      state.rooms[0].swingMarks = swings;
      const { tree, layer, shapes } = canvas();
      expect(shapes).toHaveLength(1);
      const details = tree.find(({ type }) => type === DoorDetails);
      expect(details.props.showDetails).toBe(false);
      const marks = tree.find(({ type }) => type === SwingMarks);
      expect(tree.indexOf(layer)).toBe(tree.indexOf(swings ? marks : details) + 1);
      const outlines = tree.filter(({ type }) => type === FaceOutlines);
      expect(outlines.every((outline) => tree.indexOf(outline) > tree.indexOf(layer))).toBe(true);
    }
  });

  it('anchors 2 and 4: adds four drawer pulls and stores only the off switch', () => {
    setup(doorAndDrawers);
    expect(canvas().shapes).toHaveLength(5);
    expect(canvas().layer.props.pulls.map(({ centers }) => centers.length)).toEqual([1, 1, 1, 2]);
    expect(new Set(canvas().shapes.map(({ key }) => key)).size).toBe(5);
    toggle(false);
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({
      payload: { roomId: 'room-1', showPulls: false },
    }));
    expect(state.rooms[0].showPulls).toBe(false);
    expect(checkbox().props.checked).toBe(false);
    expect(canvas().shapes).toHaveLength(0);
    expect(canvas().layer).toBeUndefined();
    toggle(true);
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({
      payload: { roomId: 'room-1', showPulls: true },
    }));
    expect(state.rooms[0]).not.toHaveProperty('showPulls');
    expect(checkbox().props.checked).toBe(true);
    expect(canvas().shapes).toHaveLength(5);
    // An explicit none pick suppresses these faces through the existing placement model.
    setup(doorAndDrawers.map((item) => ({ ...item, doorPullId: 'none', drawerPullId: 'none' })));
    expect(canvas().shapes).toHaveLength(0);
  });

  // Known spec conflict: clearing Hinge means Auto in FaceProperties. The existing
  // model assigns a hinge toward the run end, so it retains 5 shapes, not 4.
  // Step b forbids changing that model; keep the original anchor until resolved.
  it.fails('anchor 3: clearing the door hinge should leave only the four drawer shapes', () => {
    const [door, drawers] = doorAndDrawers;
    setup([{ ...door, face: setFaceHinge(door.face, 'r', null) }, drawers]);
    expect(canvas().shapes).toHaveLength(4);
  });

  it('traces closed, unfilled true arcs and rectangles at every centre under pan and zoom', () => {
    const entries = [
      { partId: 'vertical', kind: 'pull', orientation: 'vertical', along: 4.75, across: 0.375,
        centers: [{ x: 23.5, z: 30.125 }] },
      { partId: 'horizontal', kind: 'pull', orientation: 'horizontal', along: 4.75, across: 0.375,
        centers: [{ x: 7.5, z: 31 }, { x: 22.5, z: 31 }] },
      { partId: 'knob', kind: 'knob', along: 1.25, across: 1.25, centers: [{ x: 10, z: 20 }] },
      { partId: 'tab', kind: 'tab', along: 3, across: 0.5, centers: [{ x: 10, z: 20 }] },
      { partId: 'short', kind: 'pull', orientation: 'vertical', along: 1, across: 2,
        centers: [{ x: 10, z: 20 }] },
      { partId: 'empty', kind: 'pull', along: 4.75, across: 0.375, centers: [] },
    ];
    const shapes = nodes(Pulls({ pulls: entries, transform }));
    expect(shapes).toHaveLength(6);
    const contexts = shapes.map(({ type, props }) => {
      expect(type).toBe(Shape);
      expect(props).toMatchObject({ stroke: '#f1f5f9', strokeWidth: 1, fillEnabled: false, listening: false });
      expect(props).not.toHaveProperty('fill');
      const context = Object.fromEntries(
        ['beginPath', 'moveTo', 'lineTo', 'arc', 'closePath', 'fillStrokeShape'].map((name) => [name, vi.fn()]),
      );
      const shape = {};
      props.sceneFunc(context, shape);
      expect(context.beginPath).toHaveBeenCalledOnce();
      expect(context.closePath).toHaveBeenCalledOnce();
      expect(context.fillStrokeShape).toHaveBeenCalledWith(shape);
      return context;
    });
    expect(contexts.map(({ arc }) => arc.mock.calls.length)).toEqual([2, 2, 2, 2, 0, 0]);
    expect(contexts[0].moveTo).toHaveBeenCalledWith(209.5, 574.5);
    expect(contexts[0].arc.mock.calls[0].slice(0, 3)).toEqual([208, 539.5, 1.5]);
    expect(contexts[1].moveTo).toHaveBeenCalledWith(62.5, 551.5);
    expect(contexts[2].moveTo).toHaveBeenCalledWith(182.5, 551.5);
    expect(contexts[3].arc.mock.calls.map((args) => args.slice(0, 3)))
      .toEqual([[100, 638, 5], [100, 638, 5]]);
    for (const { arc } of contexts.slice(0, 4)) {
      for (const [, , , start, end, anticlockwise] of arc.mock.calls) {
        expect(end - start).toBeCloseTo(-Math.PI);
        expect(anticlockwise).toBe(true);
      }
    }
    expect(contexts[4].moveTo).toHaveBeenCalledWith(88, 640);
    expect(contexts[4].lineTo.mock.calls).toEqual([[112, 640], [112, 636], [88, 636]]);
    expect(contexts[5].moveTo).toHaveBeenCalledWith(96, 646);
    expect(contexts[5].lineTo.mock.calls).toEqual([[104, 646], [104, 630], [96, 630]]);
  });
});

