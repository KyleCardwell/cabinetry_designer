import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { Group, Line, Rect, Stage, Text } from 'react-konva';
import { CABINET_TYPE_IDS } from '../../model/constants.js';
import { gridLeaves, runItems } from '../../model/grid.js';
import { interiorDimensions } from '../../model/interiors.js';
import { resolveWall, syncRoom } from '../../model/room.js';
import { wallToScreen } from '../../canvas/transform.js';
import elevationReducer, { setItemInterior } from '../../store/elevationSlice.js';
import { run, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import ElevationCanvas from '../ElevationCanvas.jsx';
import WallContentLayer from '../WallContentLayer.jsx';
import WallOverlayLayer from '../WallOverlayLayer.jsx';
import InteriorDimensions from '../InteriorDimensions.jsx';
import InteriorShapes from '../InteriorShapes.jsx';
import RunGroup from '../RunGroup.jsx';
import TrackSizeInput from '../TrackSizeInput.jsx';

const hooks = vi.hoisted(() => ({ slots: new Map(), scope: '', index: 0 }));
vi.mock('react', async (original) => {
  const slot = (initial) => {
    const key = `${hooks.scope}:${hooks.index++}`;
    if (!hooks.slots.has(key)) hooks.slots.set(key, initial());
    return [key, hooks.slots.get(key)];
  };
  return {
    ...await original(),
    useState: (initial) => {
      const [key, value] = slot(() => typeof initial === 'function' ? initial()
        : initial?.width === 0 ? { width: 1100, height: 800 } : initial);
      return [value, (next) => hooks.slots.set(key, typeof next === 'function'
        ? next(hooks.slots.get(key)) : next)];
    },
    useRef: (initial) => slot(() => ({ current: initial }))[1],
    useMemo: (callback) => callback(),
    useCallback: (callback) => callback,
    useEffect: vi.fn(),
    useLayoutEffect: vi.fn(),
    useImperativeHandle: vi.fn(),
    useReducer: () => [0, vi.fn()],
    useId: () => 'interior-dimensions',
  };
});
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('react-konva', () => ({
  Group: 'group', Label: 'label', Layer: 'layer', Line: 'line', Rect: 'rect', Shape: 'shape',
  Stage: 'stage', Tag: 'tag', Text: 'text',
}));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const render = (scope, callback) => {
  hooks.scope = scope;
  hooks.index = 0;
  return nodes(callback());
};
const group = (direction, dividers, children = Array.from({ length: dividers.length + 1 }, () => ({}))) => (
  { direction, dividers, children }
);
const shelf = { kind: 'fixed' };
const partition = { kind: 'partition' };
let state;
let dispatch;
let pointer;

function fixture(interior = group('vertical', [shelf]), width = 24, height = 84) {
  hooks.slots.clear();
  state = stateWithRun(run({
    cabinetTypeId: CABINET_TYPE_IDS.TALL, x: 30, z: 4, width, height,
    autoCount: false, ends: { left: { type: 'none' }, right: { type: 'none' } },
    items: [{ id: 'cabinet', kind: 'cabinet', width, interior }],
  }));
  state.doorsOff = true;
  state.selection = { runId: 'run-1', pieceId: 'cabinet' };
}

function canvas() {
  const room = syncRoom(state.rooms[0], state.settings);
  const wall = resolveWall(room, room.walls[0], 'front');
  const tree = render('canvas', () => ElevationCanvas.render({ room, wall, settings: state.settings }, null));
  for (const Layer of [WallContentLayer, WallOverlayLayer]) {
    tree.push(...nodes(Layer(tree.find(({ type }) => type === Layer).props)));
  }
  const stage = tree.find(({ type }) => type === Stage);
  stage.ref.current = stage.ref.current ?? { getPointerPosition: () => pointer };
  const runNode = tree.find(({ type }) => type === RunGroup);
  const runTree = render('run', () => RunGroup.type(runNode.props));
  const shapeNode = runTree.find(({ type }) => type === InteriorShapes);
  const shapes = shapeNode ? render('shapes', () => InteriorShapes(shapeNode.props)) : [];
  const dimensionNode = runTree.find(({ type }) => type === InteriorDimensions);
  const dimensions = dimensionNode ? nodes(InteriorDimensions(dimensionNode.props)) : [];
  return { tree, stage, runNode, runTree, shapes, dimensionNode, dimensions };
}

function clickLabel(index = 0) {
  const view = canvas();
  const target = view.dimensions.filter(({ type }) => type === Rect)[index];
  const event = { target: { getStage: () => ({ getPointerPosition: () => pointer }) } };
  target.props.onClick(event);
  expect(event.cancelBubble).toBe(true);
  return canvas().tree.find(({ type }) => type === TrackSizeInput);
}

function typeAndEnter(text) {
  const editor = canvas().tree.find(({ type }) => type === TrackSizeInput);
  const input = () => render('input', () => TrackSizeInput(editor.props)).find(({ type }) => type === 'input');
  input().props.onChange({ target: { value: text } });
  input().props.onKeyDown({ key: 'Enter', stopPropagation: vi.fn(), preventDefault: vi.fn() });
}

const item = () => runItems(state.rooms[0].walls[0].runs[0])[0];
const expectInterior = (interior) => {
  expect(dispatch).toHaveBeenLastCalledWith(setItemInterior({
    roomId: 'room-1', wallId: 'wall-1', runId: 'run-1', itemIds: ['cabinet'], interior,
  }));
  expect(item().interior).toEqual(interior);
};

beforeEach(() => {
  vi.clearAllMocks();
  pointer = { x: 300, y: 200 };
  fixture();
  dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
});

describe('IN3 divider dimensions, typed edits and dragging', () => {
  it('anchor 1: opens the auto 42 bottom dimension and commits a typed 36 through the track input', () => {
    expect(clickLabel().props.edit).toEqual({
      runId: 'run-1', itemId: 'cabinet', path: 'r', index: 0, side: 'bottom',
      label: 'oc from bottom', value: 42, ...pointer,
    });
    const editor = canvas().tree.find(({ type }) => type === TrackSizeInput);
    const input = render('input', () => TrackSizeInput(editor.props)).find(({ type }) => type === 'input');
    expect(input.props).toMatchObject({ 'aria-label': 'oc from bottom', value: '42' });
    typeAndEnter('36');
    expectInterior(group('vertical', [{ kind: 'fixed', at: 36 }]));
    expect(canvas().tree.some(({ type }) => type === TrackSizeInput)).toBe(false);
  });

  it('anchor 2: colors the manual shelf and auto partition and clears the shelf with auto or blank', () => {
    const tree = group('vertical', [{ ...shelf, at: 36 }], [group('horizontal', [partition]), {}]);
    fixture(tree, 36);
    expect(canvas().dimensions.filter(({ type }) => type === Text).map(({ props }) => [props.text, props.fill]))
      .toEqual([['36', '#7dd3fc'], ['18', '#e2e8f0']]);
    clickLabel();
    typeAndEnter('auto');
    expectInterior(group('vertical', [shelf], tree.children));
    fixture(tree, 36);
    clickLabel();
    typeAndEnter('');
    expectInterior(group('vertical', [shelf], tree.children));
  });

  it('anchor 3: edits 12 from the right to 10 and preserves the side for an auto partition shown from the right', () => {
    fixture(group('horizontal', [{ ...partition, at: 12, from: 'right' }]), 36, 30.5);
    expect(clickLabel().props.edit).toMatchObject({ label: 'oc from right', value: 12, side: 'right' });
    typeAndEnter('10');
    expectInterior(group('horizontal', [{ kind: 'partition', at: 10, from: 'right' }]));
    // The second of two auto partitions dimensions from the nearest exterior side.
    fixture(group('horizontal', [partition, partition]), 36, 30.5);
    expect(clickLabel(1).props.edit.side).toBe('right');
    typeAndEnter('10');
    expectInterior(group('horizontal', [partition, { kind: 'partition', at: 10, from: 'right' }]));
    fixture(group('horizontal', [partition]), 36, 30.5);
    expect(clickLabel().props.edit).toMatchObject({ label: 'oc from left', side: 'left' });
    typeAndEnter('10');
    expectInterior(group('horizontal', [{ kind: 'partition', at: 10 }]));
    fixture(group('horizontal', [{ ...partition, at: 12, from: 'right' }]), 36, 30.5);
    clickLabel();
    typeAndEnter('auto');
    expectInterior(group('horizontal', [partition]));
  });

  it('anchor 4: previews an axis-only shelf drag up 3.03 inches, commits 45, and suppresses the following pick', () => {
    vi.useFakeTimers();
    try {
      const view = canvas();
      const divider = view.shapes.filter(({ type }) => type === Rect).at(-1);
      const { x, y } = divider.props;
      const scale = view.runNode.props.transform.scale;
      expect(divider.props).toMatchObject({ draggable: true, dragDistance: 3 });
      expect(divider.props.dragBoundFunc({ x: x + 100, y: y - 3.03 * scale }))
        .toEqual({ x, y: y - 3.03 * scale });
      const event = { target: {
        x: () => x, y: () => y - 3.03 * scale, position: vi.fn(),
      } };
      divider.props.onDragStart(event);
      divider.props.onDragMove(event);
      const preview = canvas();
      expect(preview.shapes.filter(({ type }) => type === Rect).at(-1).props.y).toBeCloseTo(y - 3.03 * scale);
      expect(preview.dimensions.find(({ type }) => type === Text).props.text).toBe('45');
      expect(dispatch).not.toHaveBeenCalled();
      divider.props.onDragEnd(event);
      expect(event.cancelBubble).toBe(true);
      expectInterior(group('vertical', [{ kind: 'fixed', at: 45 }]));
      const count = dispatch.mock.calls.length;
      divider.props.onClick({});
      view.runNode.props.onSelectPiece();
      const stageTarget = { getStage: () => stageTarget };
      view.stage.props.onClick({ target: stageTarget });
      expect(dispatch).toHaveBeenCalledTimes(count);
      vi.runAllTimers();
      view.runNode.props.onSelectPiece();
      expect(dispatch.mock.calls.length).toBeGreaterThan(count);
    } finally {
      vi.useRealTimers();
    }
  });

  it('draws lanes and ticks, gates editing, and handles partition drags, small moves and sixteenth minimums', () => {
    fixture(group('vertical', [shelf, { ...shelf, at: 30 }]));
    const view = canvas();
    const { transform } = view.runNode.props;
    const dimensions = interiorDimensions(view.dimensionNode.props.entry);
    const anchor = wallToScreen(dimensions[0].from, transform);
    const lines = view.dimensions.filter(({ type }) => type === Line);
    expect(lines).toHaveLength(8);
    expect(lines[0].props.points[0]).toBe(anchor.x + 22);
    expect(lines[4].props.points[0]).toBe(anchor.x + 8);
    expect(view.dimensions.filter(({ type }) => type === Group).map(({ props }) => props.rotation))
      .toContain(-90);
    state.tool = 'draw';
    expect(canvas().dimensions.some(({ type }) => type === Rect)).toBe(false);
    expect(canvas().shapes.filter(({ type }) => type === Rect).every(({ props }) => !props.draggable)).toBe(true);
    state.tool = 'select';
    state.doorsOff = false;
    expect(canvas().dimensionNode).toBeUndefined();
    state.doorsOff = true;
    state.selection.pieceId = null;
    expect(canvas().dimensionNode).toBeUndefined();
    for (const [dx, expected] of [[2, 10], [50, 1 / 16], [-50, 62]]) {
      fixture(group('horizontal', [{ ...partition, at: 12, from: 'right' }]), 36, 30.5);
      const current = canvas();
      const divider = current.shapes.filter(({ type }) => type === Rect).at(-1);
      const { x, y } = divider.props;
      const scale = current.runNode.props.transform.scale;
      expect(divider.props.dragBoundFunc({ x: x + dx * scale, y: y + 90 }))
        .toEqual({ x: x + dx * scale, y });
      divider.props.onDragEnd({ target: { x: () => x + dx * scale, y: () => y, position: vi.fn() } });
      expectInterior(group('horizontal', [{ kind: 'partition', at: expected, from: 'right' }]));
    }
    fixture();
    const small = canvas();
    const divider = small.shapes.filter(({ type }) => type === Rect).at(-1);
    pointer = { x: divider.props.x + 40, y: divider.props.y + divider.props.height / 2 };
    dispatch.mockClear();
    const event = { target: { x: () => divider.props.x, y: () => divider.props.y - 2.9, position: vi.fn() } };
    divider.props.onDragStart(event);
    divider.props.onDragEnd(event);
    expect(dispatch.mock.calls.every(([action]) => action.type !== setItemInterior.type)).toBe(true);
    expect(state).toMatchObject({ interiorPath: 'r', interiorDivider: 0 });
    // A following section click still works after the completed gesture.
    small.shapes.find(({ type }) => type === Group).props.onMouseDown({});
    pointer = { x: divider.props.x + 40, y: divider.props.y + 40 };
    small.shapes.filter(({ type }) => type === Rect)[1].props.onClick({});
    expect(state).toMatchObject({ interiorPath: 'r.1', interiorDivider: null });
  });
});


describe('IN7 automatic divider canvas edits', () => {
  it('anchors 1–2: dragging an automatic shelf stores its effective tree; typing auto returns it to 42', () => {
    state = structuredClone(state);
    const leaf = gridLeaves(state.rooms[0].walls[0].runs[0].grid)[0];
    delete leaf.interior;
    leaf.face = { direction: 'vertical', size: null,
      children: [{ type: 'door', size: null }, { type: 'door', size: null }] };
    const view = canvas();
    expect(view.dimensionNode.props.entry).toMatchObject({ auto: true });
    expect(view.dimensions.find(({ type }) => type === Text).props.text).toBe('42');
    const divider = view.shapes.filter(({ type }) => type === Rect).at(-1);
    const { x, y } = divider.props;
    const scale = view.runNode.props.transform.scale;
    divider.props.onDragEnd({ target: { x: () => x, y: () => y + 2 * scale, position: vi.fn() } });
    expectInterior(group('vertical', [{ kind: 'fixed', seam: 'r:0', at: 40 }]));
    expect(canvas().dimensionNode.props.entry.auto).toBe(false);
    clickLabel();
    typeAndEnter('auto');
    expectInterior(group('vertical', [{ kind: 'fixed', seam: 'r:0' }]));
    expect(canvas().dimensionNode.props.entry).toMatchObject({ auto: false });
    expect(canvas().dimensions.find(({ type }) => type === Text).props.text).toBe('42');
    state = structuredClone(state);
    delete gridLeaves(state.rooms[0].walls[0].runs[0].grid)[0].interior;
    expect(canvas().dimensionNode.props.entry.auto).toBe(true);
    clickLabel();
    typeAndEnter('40');
    expectInterior(group('vertical', [{ kind: 'fixed', seam: 'r:0', at: 40 }]));
  });
});
