import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { Group, Rect, Stage, Text } from 'react-konva';
import { wallShelves } from '../../model/shelves.js';
import { wallDrawerBoxes } from '../../model/drawerBoxes.js';
import { gridLeaves } from '../../model/grid.js';
import { resolveWall, syncRoom } from '../../model/room.js';
import { BUILT_IN_SLIDES } from '../../model/slides.js';
import { wallRectToScreen, wallToScreen } from '../../canvas/transform.js';
import elevationReducer, { setDoorsOff, setItemInterior, setItemShelves } from '../../store/elevationSlice.js';
import { run, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import ElevationCanvas from '../ElevationCanvas.jsx';
import InteriorShapes from '../InteriorShapes.jsx';
import RunGroup from '../RunGroup.jsx';

vi.mock('react', async (original) => ({
  ...await original(),
  useState: (initial) => [initial?.width === 0 ? { width: 1100, height: 800 } : initial, vi.fn()],
  useRef: (current) => ({ current }),
  useMemo: (callback) => callback(),
  useCallback: (callback) => callback,
  useEffect: vi.fn(),
  useLayoutEffect: vi.fn(),
  useImperativeHandle: vi.fn(),
  useReducer: () => [0, vi.fn()],
  useId: () => 'drawer-boxes',
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('react-konva', () => ({
  Group: 'group', Label: 'label', Layer: 'layer', Line: 'line', Rect: 'rect', Shape: 'shape',
  Stage: 'stage', Tag: 'tag', Text: 'text',
}));
vi.mock('../../model/shelves.js', async (original) => {
  const actual = await original();
  return { ...actual, wallShelves: vi.fn(actual.wallShelves) };
});
vi.mock('../../model/drawerBoxes.js', async (original) => {
  const actual = await original();
  return { ...actual, wallDrawerBoxes: vi.fn(actual.wallDrawerBoxes) };
});

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const drawer = (size = null) => ({ type: 'drawer_front', size });
let state;
let dispatch;
const at = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1', itemIds: ['cabinet'] };
const item = () => gridLeaves(state.rooms[0].walls[0].runs[0].grid)[0];

function canvas() {
  const room = syncRoom(state.rooms[0], state.settings);
  const wall = resolveWall(room, room.walls[0], 'front');
  const tree = nodes(ElevationCanvas.render({ room, wall, settings: state.settings }, null));
  const runNode = tree.find(({ type }) => type === RunGroup);
  const runTree = nodes(RunGroup.type(runNode.props));
  const interiorNode = runTree.find(({ type }) => type === InteriorShapes);
  const shapes = interiorNode ? nodes(InteriorShapes(interiorNode.props)) : [];
  const boxes = shapes.filter(({ type, props }) => type === Group && props.listening === false);
  return { tree, runNode, runTree, interiorNode, shapes, boxes };
}

beforeEach(() => {
  vi.clearAllMocks();
  state = stateWithRun(run({
    x: 30, z: 4, width: 18, autoCount: false,
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    items: [{ id: 'cabinet', kind: 'cabinet', width: 18,
      face: { direction: 'vertical', size: null, children: [drawer(5.875), drawer(), drawer()] },
      reveals: { top: 0.125, bottom: 0.125, left: 0.0625, right: 0.0625, horizontal: 0.125, vertical: 0.125 },
    }],
  }));
  state.settings = { ...state.settings, runFlex: 0, slides: BUILT_IN_SLIDES, drawerSlideId: 'blum-562h',
    // These fixtures type a 1/8" top reveal; keep the standard fronts at 5 7/8 (IN7.2).
    stoneTopReveal: 0.125 };
  state.doorsOff = true;
  state.selection = { runId: 'run-1', pieceId: 'cabinet' };
  dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
});

describe('IN5 doors-off drawer boxes', () => {
  it('anchor 1: draws three offset wall rectangles over the interior with centred height labels', () => {
    const view = canvas();
    expect(view.boxes).toHaveLength(3);
    expect(view.runNode.props.drawerBoxes).toMatchObject([{ itemId: 'cabinet', runId: 'run-1' }]);
    const expected = [
      { x: 31, z: 29, width: 16, height: 4.25 },
      { x: 31, z: 16.8125, width: 16, height: 10.25 },
      { x: 31, z: 5.3125, width: 16, height: 10.25 },
    ];
    view.boxes.forEach((box, index) => {
      const rect = wallRectToScreen(expected[index], view.runNode.props.transform);
      expect(nodes(box).find(({ type }) => type === Rect).props)
        .toMatchObject({ ...rect, stroke: '#e2e8f0' });
      expect(nodes(box).find(({ type }) => type === Text).props).toMatchObject({
        ...rect, text: ['4 1/4', '10 1/4', '10 1/4'][index], align: 'center', verticalAlign: 'middle',
      });
    });
    expect(view.shapes.indexOf(view.boxes[0])).toBeGreaterThan(
      view.shapes.findIndex(({ type, props }) => type === Rect && props.listening));
    // Each run receives only its own cabinet entries.
    state.rooms[0].walls[0].runs.push(run({
      id: 'run-2', x: 70, width: 18, autoCount: false,
      ends: { left: { type: 'none' }, right: { type: 'none' } },
      items: [{ ...structuredClone(item()), id: 'other', width: 18 }],
    }));
    const runs = canvas().tree.filter(({ type }) => type === RunGroup);
    expect(runs.map(({ props }) => props.drawerBoxes.map(({ itemId }) => itemId)))
      .toEqual([['cabinet'], ['other']]);
  });

  it('anchor 2: skips a too-short box, colours any warning, and hides labels that do not fit', () => {
    item().face.children[0].size = 2;
    item().face.children[1].drawerBox = { depth: 30 };
    const view = canvas();
    expect(view.runNode.props.drawerBoxes[0].boxes[0]).toMatchObject({
      height: null, warnings: [{ code: 'drawer-too-short' }],
    });
    expect(view.boxes).toHaveLength(2);
    expect(nodes(view.boxes[0]).find(({ type }) => type === Rect).props.stroke).toBe('#f59e0b');
    expect(nodes(view.boxes[0]).find(({ type }) => type === Text).props.fill).toBe('#f59e0b');
    expect(nodes(view.boxes[1]).find(({ type }) => type === Rect).props.stroke).toBe('#e2e8f0');
    for (const scale of [0.1, 0.5]) {
      const shapes = nodes(InteriorShapes({
        ...view.interiorNode.props, transform: { ...view.runNode.props.transform, scale },
      }));
      const boxes = shapes.filter(({ type, props }) => type === Group && props.listening === false);
      expect(boxes).toHaveLength(2);
      expect(boxes.flatMap(nodes).some(({ type }) => type === Text)).toBe(false);
    }
  });

  it('IN12c e anchor 5: shows counted accessories when they fit, falls back to height, and keeps warnings amber', () => {
    state.settings.accessories = [
      { id: 'CU', name: 'Charging unit', attachesTo: 'drawer_box', effects: [{ kind: 'clear_behind', inches: 2 }] },
      { id: 'KN', name: 'Knife insert', attachesTo: 'drawer_box', effects: [] },
      { id: 'Susan', name: 'Lazy susan', attachesTo: 'section', effects: [] },
    ];
    item().face.children[0].drawerBox = { accessories: [{ accessoryId: 'CU' }] };
    let view = canvas();
    const fitting = nodes(InteriorShapes({ ...view.interiorNode.props,
      transform: { ...view.runNode.props.transform, scale: 10 } }));
    expect(nodes(fitting.find(({ key }) => key === 'drawer:r.0')).find(({ type }) => type === Text).props.text)
      .toBe('4 1/4 · Charging unit');
    const narrow = nodes(InteriorShapes({ ...view.interiorNode.props,
      transform: { ...view.runNode.props.transform, scale: 4 } }));
    const top = narrow.find(({ key }) => key === 'drawer:r.0');
    expect(nodes(top).find(({ type }) => type === Text).props.text).toBe('4 1/4');
    item().face.children[0].drawerBox = { accessories: [
      { accessoryId: 'CU', qty: 2 }, { accessoryId: 'KN' }, { accessoryId: 'gone' }, { accessoryId: 'Susan' },
    ] };
    view = canvas();
    const wide = nodes(InteriorShapes({ ...view.interiorNode.props,
      transform: { ...view.runNode.props.transform, scale: 30 } }));
    const labelled = wide.find(({ key }) => key === 'drawer:r.0');
    expect(nodes(labelled).find(({ type }) => type === Text).props)
      .toMatchObject({ text: '4 1/4 · 2 × Charging unit, Knife insert', fill: '#f59e0b' });
    expect(nodes(labelled).find(({ type }) => type === Rect).props.stroke).toBe('#f59e0b');
  });

  it('anchor 3: passes a click inside a box through to the underlying section', () => {
    const view = canvas();
    for (const box of view.boxes) {
      expect(nodes(box).every(({ props }) => props.listening === false && !props.onClick)).toBe(true);
    }
    const stage = view.tree.find(({ type }) => type === Stage);
    const pointer = wallToScreen({ x: 39, z: 30 }, view.runNode.props.transform);
    stage.ref.current = { getPointerPosition: () => pointer };
    const section = view.shapes.find(({ type, props }) => type === Rect && props.listening);
    const event = {};
    section.props.onClick(event);
    expect(event.cancelBubble).toBe(true);
    expect(state.selection).toMatchObject({ runId: 'run-1', pieceId: 'cabinet' });
    expect(state).toMatchObject({ interiorPath: 'r', interiorDivider: null });
  });

  it('anchor 4: does not resolve or draw drawer boxes with doors on', () => {
    state.doorsOff = false;
    const view = canvas();
    expect(wallDrawerBoxes).not.toHaveBeenCalled();
    expect(view.runNode.props.drawerBoxes).toEqual([]);
    expect(view.interiorNode).toBeUndefined();
    expect(view.boxes).toEqual([]);
  });

  it('draws ROT and hamper boxes with their kind and height in the doors-off label', () => {
    item().face.children = [drawer(5.875), { type: 'door', action: 'pullout', size: null }];
    for (const [purpose, label] of [['trash', 'ROT 15 1/8'], ['hamper', 'Hamper 6 1/4']]) {
      item().purpose = purpose;
      const view = canvas();
      expect(view.boxes).toHaveLength(2);
      expect(nodes(view.boxes[0]).find(({ type }) => type === Text).props.text).toBe('4 1/4');
      expect(nodes(view.boxes[1]).find(({ type }) => type === Rect)).toBeDefined();
      expect(nodes(view.boxes[1]).find(({ type }) => type === Text).props.text).toBe(label);
      expect(nodes(view.boxes[1]).every(({ props }) => props.listening === false)).toBe(true);
    }
  });
});


describe('IN8 doors-off shelves', () => {
  const shelfRects = (view) => view.shapes.filter(({ key }) => key?.startsWith('shelf:'));
  const base = (width = 24, type = 'door') => {
    state = structuredClone(state);
    const run = state.rooms[0].walls[0].runs[0];
    run.width = run.grid.cols[0].size = item().width = width;
    item().face = { type, size: null };
    delete item().reveals;
  };

  it('anchor 1: draws two undimensioned outlines at unrounded positions; clicks reach the section; doors-on skips resolution', () => {
    base();
    dispatch(setItemInterior({ ...at, interior: { shelves: { count: 2 } } }));
    const view = canvas();
    const entry = view.interiorNode.props.entries[0];
    const shelf = view.interiorNode.props.shelves.get('cabinet').get('r');
    expect(shelf.positions.map((z) => z - entry.box.z)).toEqual([
      0.75 + (29 - 1.5) / 3,
      0.75 + (29 - 1.5) / 3 * 2 + 0.75,
    ]);
    expect(shelf.positions[0] - entry.box.z).toBeCloseTo(9.917, 3);
    expect(shelf.positions[1] - entry.box.z).toBeCloseTo(19.833, 3);
    expect(shelfRects(view)).toHaveLength(2);
    shelfRects(view).forEach((rect, index) => {
      expect(rect.type).toBe(Rect);
      expect(rect.props).toMatchObject({
        // 1/16" side clearance each side (IN8.2, Kyle 2026-10-20): a 22 1/2" section takes a 22 3/8" shelf.
        ...wallRectToScreen({ x: entry.sections[0].x + 1 / 16, z: shelf.positions[index],
          width: 22.375, height: 0.75 }, view.runNode.props.transform),
        stroke: '#94a3b8', strokeWidth: 0.75, fillEnabled: false, listening: false,
      });
      expect(rect.props.onClick).toBeUndefined();
    });
    // The section size plus the clear space below, between and above the shelves (IN8.1, information only).
    expect(view.shapes.filter(({ type }) => type === Text).map(({ props }) => props.text))
      .toEqual(['22 1/2 × 29', '9 3/16', '9 3/16', '9 3/16']);
    const stage = view.tree.find(({ type }) => type === Stage);
    stage.ref.current = { getPointerPosition: () => wallToScreen({ x: 42, z: shelf.positions[0] }, view.runNode.props.transform) };
    const section = view.shapes.find(({ type, props }) => type === Rect && props.listening);
    section.props.onClick({});
    expect(state).toMatchObject({ interiorPath: 'r', interiorDivider: null });
    dispatch(setDoorsOff(false));
    wallShelves.mockClear();
    expect(canvas().interiorNode).toBeUndefined();
    expect(wallShelves).not.toHaveBeenCalled();
  });

  it('anchor 2: cabinet hardwood removes the wide partition and draws a 1 1/2-inch shelf; glass draws 1/4-inch', () => {
    base(42, 'pair_door');
    expect(canvas().interiorNode.props.entries[0].dividers).toHaveLength(1);
    dispatch(setItemShelves({ ...at, patch: { nosing: 'hardwood' } }));
    const view = canvas();
    expect(item()).not.toHaveProperty('interior');
    expect(view.interiorNode.props.entries[0].sections).toHaveLength(1);
    expect(view.interiorNode.props.entries[0].dividers).toEqual([]);
    expect(shelfRects(view)).toHaveLength(1);
    expect(shelfRects(view)[0].props.height).toBeCloseTo(1.5 * view.runNode.props.transform.scale);
    dispatch(setItemInterior({ ...at, interior: { shelves: { glass: true } } }));
    const glass = canvas();
    expect(shelfRects(glass)[0].props.height).toBeCloseTo(0.25 * glass.runNode.props.transform.scale);
  });
});
