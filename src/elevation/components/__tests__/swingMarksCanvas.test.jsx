import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { Line } from 'react-konva';
import elevationReducer from '../../store/elevationSlice.js';
import { run, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import DoorDetails from '../DoorDetails.jsx';
import FaceOutlines from '../FaceOutlines.jsx';
import RoomDoorStylesPanel from '../RoomDoorStylesPanel.jsx';
import RunGroup from '../RunGroup.jsx';
import SwingMarks from '../SwingMarks.jsx';

// Inspect component output and exercise callbacks with the real model and reducer.
vi.mock('react', async (original) => ({
  ...await original(),
  useMemo: (callback) => callback(),
  useState: (initial) => [initial, vi.fn()],
  useRef: (current) => ({ current }),
  useId: () => 'swing-marks',
  useEffect: vi.fn(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('react-konva', () => ({
  Group: 'group', Label: 'label', Line: 'line', Rect: 'rect', Shape: 'shape', Tag: 'tag', Text: 'text',
}));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const transform = { scale: 8, offsetX: 20, offsetY: 30, wallHeight: 96 };
let state;
let dispatch;

function setup(items = [{ id: 'single', kind: 'cabinet', width: 18 }]) {
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

const checkbox = () => panel().find(({ props }) => props['aria-label'] === 'Show swing marks');
const toggle = (checked) => checkbox().props.onChange({ target: { checked } });
function canvas() {
  const room = state.rooms[0];
  const wall = room.walls[0];
  const tree = nodes(RunGroup.type({ room, wall, run: wall.runs[0], settings: state.settings, transform }));
  const layer = tree.find(({ type }) => type === SwingMarks);
  const lines = layer ? nodes(SwingMarks(layer.props)).filter(({ type }) => type === Line) : [];
  return { tree, layer, lines };
}

beforeEach(() => {
  vi.clearAllMocks();
  setup();
  dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
});

describe('HP2 step b canvas swing marks', () => {
  it('anchor 1: defaults the checkbox off beneath style tags and renders no swing lines', () => {
    const controls = panel().filter(({ props }) => props.type === 'checkbox');
    expect(controls.map(({ props }) => props['aria-label'])).toEqual([
      'Draw door details', 'Show style tags', 'Show swing marks',
    ]);
    expect(checkbox().props.checked).toBe(false);
    expect(state.rooms[0]).not.toHaveProperty('swingMarks');
    expect(canvas().lines).toHaveLength(0);
    expect(canvas().layer).toBeUndefined();
  });

  it('anchors 2 and 4: toggles two dashed single-door lines and removes the stored key when unchecked', () => {
    toggle(true);
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({
      payload: { roomId: 'room-1', swingMarks: true },
    }));
    expect(state.rooms[0].swingMarks).toBe(true);
    expect(checkbox().props.checked).toBe(true);
    const { tree, lines } = canvas();
    expect(lines).toHaveLength(2);
    // The stone-top reveal is 1/4 inch, leaving a 30 1/8 inch outer door.
    expect(tree.find(({ type }) => type === FaceOutlines).props.faces[0]).toMatchObject({
      x: 0.0625, z: 4.125, width: 17.875, height: 30.125, hinge: 'left',
    });
    expect(lines.map(({ props }) => props.points)).toEqual([
      [20.5, 644.5, 163.5, 524],
      [20.5, 644.5, 163.5, 765],
    ]);
    for (const { props } of lines) {
      expect(props).toMatchObject({ stroke: '#cbd5e1', strokeWidth: 1, dash: [6, 4], listening: false });
    }
    toggle(false);
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({
      payload: { roomId: 'room-1', swingMarks: false },
    }));
    expect(state.rooms[0]).not.toHaveProperty('swingMarks');
    expect(checkbox().props.checked).toBe(false);
    expect(canvas().lines).toHaveLength(0);
  });

  it('anchor 3: draws four pair-door lines above details and below outlines, with none on a drawer bank', () => {
    setup([
      { id: 'pair', kind: 'cabinet', width: 30, face: { type: 'pair_door' } },
      { id: 'drawers', kind: 'cabinet', width: 18, face: {
        direction: 'vertical', size: null,
        children: Array.from({ length: 3 }, () => ({ type: 'drawer_front', size: null })),
      } },
    ]);
    // Swing marks remain visible in an outlines-only room.
    state.rooms[0].doorDetails = false;
    toggle(true);
    const { tree, layer, lines } = canvas();
    expect(lines).toHaveLength(4);
    expect(layer.props.marks.map(({ pieceId, half }) => [pieceId, half])).toEqual([
      ['pair', 'left'], ['pair', 'right'],
    ]);
    const details = tree.find(({ type }) => type === DoorDetails);
    const outlines = tree.filter(({ type }) => type === FaceOutlines);
    expect(details.props.showDetails).toBe(false);
    expect(tree.indexOf(layer)).toBe(tree.indexOf(details) + 1);
    expect(outlines.every((outline) => tree.indexOf(outline) > tree.indexOf(layer))).toBe(true);
    expect(outlines.flatMap(({ props }) => props.faces).map(({ type }) => type)).toEqual([
      'pair_door', 'pair_door', 'drawer_front', 'drawer_front', 'drawer_front',
    ]);
    expect(new Set(lines.map(({ key }) => key)).size).toBe(4);
  });
});
