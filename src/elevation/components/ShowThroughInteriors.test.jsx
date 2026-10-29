import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { Group, Line, Rect, Text } from 'react-konva';
import { wallRectToScreen, wallToScreen } from '../canvas/transform.js';
import { newAccessory } from '../model/accessories.js';
import { gridLeaves } from '../model/grid.js';
import { resolveWall } from '../model/room.js';
import { wallShowThrough } from '../model/showThrough.js';
import { run, stateWithRun } from '../store/__tests__/helpers/sliceFixtures.js';
import { opening } from '../../test/builders.js';
import CombinedFaces, { resolveCombinedFaces } from './CombinedFaces.jsx';
import DoorDetails from './DoorDetails.jsx';
import ElevationCanvas from './ElevationCanvas.jsx';
import WallContentLayer from './WallContentLayer.jsx';
import WallOverlayLayer from './WallOverlayLayer.jsx';
import ElevationPreviews from './ElevationPreviews.jsx';
import FaceOutlines from './FaceOutlines.jsx';
import FrameOutline from './FrameOutline.jsx';
import InteriorShapes from './InteriorShapes.jsx';
import OpeningShape from './OpeningShape.jsx';
import RunGroup from './RunGroup.jsx';
import ShowThroughInteriors from './ShowThroughInteriors.jsx';

vi.mock('react', async (original) => ({
  ...await original(),
  useMemo: (callback) => callback(),
  useState: (initial) => [initial?.width === 0 ? { width: 1100, height: 800 } : initial, vi.fn()],
  useRef: (current) => ({ current }), useCallback: (callback) => callback,
  useEffect: vi.fn(), useLayoutEffect: vi.fn(), useImperativeHandle: vi.fn(),
  useReducer: () => [0, vi.fn()], useId: () => 'show-through',
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('react-konva', () => ({
  Group: 'group', Label: 'label', Layer: 'layer', Line: 'line', Rect: 'rect', Shape: 'shape',
  Stage: 'stage', Tag: 'tag', Text: 'text',
}));
vi.mock('../model/showThrough.js', async (original) => {
  const actual = await original();
  return { wallShowThrough: vi.fn(actual.wallShowThrough) };
});

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const transform = { scale: 8, offsetX: 20, offsetY: 30, wallHeight: 96 };
let state;
const leaf = () => gridLeaves(state.rooms[0].walls[0].runs[0].grid)[0];

function view(extra = {}) {
  const room = state.rooms[0];
  const wall = resolveWall(room, room.walls[0], 'front');
  const canvas = nodes(ElevationCanvas.render({ room, wall, settings: state.settings }, null));
  for (const Layer of [WallContentLayer, WallOverlayLayer]) {
    canvas.push(...nodes(Layer(canvas.find(({ type }) => type === Layer).props)));
  }
  const runNode = canvas.find(({ type }) => type === RunGroup);
  const tree = nodes(RunGroup.type({ ...runNode.props, transform, ...extra }));
  const layer = tree.find(({ type }) => type === ShowThroughInteriors);
  const shapes = layer ? nodes(ShowThroughInteriors(layer.props)) : [];
  return { canvas, tree, layer, shapes, entry: layer?.props.entries[0], room, wall };
}

beforeEach(() => {
  vi.clearAllMocks();
  state = stateWithRun(run({
    x: 24, z: 4, width: 24, height: 30.5, autoCount: false,
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    items: [{ id: 'a', kind: 'cabinet', width: 24, face: { type: 'open', size: null } }],
  }));
  state.doorsOff = false;
  useDispatch.mockReturnValue(vi.fn());
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
});

describe('IN14 step d show-through canvas', () => {
  it('GM2: passes plot settings to windows on single and combined faces', () => {
    state.settings.plotScale = 32;
    const room = state.rooms[0];
    room.walls[0].openings = [opening({ kind: 'window', offset: 72 })];
    const { canvas } = view();
    expect(canvas.find(({ type }) => type === OpeningShape).props.settings).toBe(state.settings);
    const second = { ...room.walls[0], id: 'wall-2', runs: [],
      openings: [opening({ id: 'window-2', kind: 'window' })] };
    room.walls.push(second);
    const combined = { faces: room.walls.map((wall, index) => ({
      key: wall.id, wallId: wall.id, side: 'front', length: 144, height: 96, dx: index * 144, depth: 0,
    })) };
    const shapes = nodes(CombinedFaces({ room, combined,
      faces: resolveCombinedFaces(room, combined, state.settings), activeKey: 'wall-1',
      settings: state.settings, diagnostics: {}, transform }));
    expect(shapes.find(({ type }) => type === OpeningShape).props.settings).toBe(state.settings);
  });

  it('anchor 1: clips four edges and one shelf to the open window, passing all clicks through', () => {
    const { entry, shapes, tree, layer } = view();
    expect(wallShowThrough).toHaveBeenCalledTimes(1);
    const clip = shapes.find(({ type, props }) => type === Group && props.clipFunc);
    const context = { rect: vi.fn() };
    clip.props.clipFunc(context);
    const rect = wallRectToScreen(entry.windows[0], transform);
    expect(context.rect.mock.calls).toEqual([[rect.x, rect.y, rect.width, rect.height]]);
    expect(nodes(clip).filter(({ type }) => type === Line)).toHaveLength(4);
    const shelves = nodes(clip).filter(({ type }) => type === Rect);
    expect(shelves).toHaveLength(1);
    expect(shelves[0].props).toMatchObject({ ...wallRectToScreen({
      x: 24.8125, z: 18.875, width: 22.375, height: 0.75,
    }, transform), stroke: '#94a3b8', strokeWidth: 0.75, fillEnabled: false });
    expect(shapes.filter(({ type }) => [Group, Rect, Line, Text].includes(type))
      .every(({ props }) => props.listening === false && !props.onClick)).toBe(true);
    expect(tree.indexOf(layer)).toBeGreaterThan(tree.findIndex(({ type }) => type === FrameOutline));
    expect(tree.indexOf(layer)).toBeLessThan(tree.findIndex(({ type }) => type === DoorDetails));
    expect(tree.indexOf(layer)).toBeLessThan(tree.findIndex(({ type }) => type === FaceOutlines));
  });

  it('anchor 2: doors-off skips show-through resolution and retains the existing interior layer', () => {
    state.doorsOff = true;
    const result = view();
    expect(result.layer).toBeUndefined();
    expect(wallShowThrough).not.toHaveBeenCalled();
    expect(result.tree.some(({ type }) => type === InteriorShapes)).toBe(true);
  });

  it('anchor 3: draws the glass opening and three marks outside the clipped group, even outlines-only', () => {
    state.settings.plotScale = 32;
    leaf().face = { type: 'door', panelMaterial: 'glass', size: null };
    state.rooms[0].doorDetails = false;
    const { entry, shapes, tree } = view();
    const clip = shapes.find(({ props }) => props.clipFunc);
    expect(nodes(clip).filter(({ type }) => type === Rect)).toHaveLength(1);
    const context = { rect: vi.fn() };
    clip.props.clipFunc(context);
    const opening = wallRectToScreen(entry.glass[0].openings[0], transform);
    expect(context.rect).toHaveBeenCalledWith(opening.x, opening.y, opening.width, opening.height);
    const glass = shapes.find(({ key }) => key === 'a:r');
    expect(glass.props.clipFunc).toBeUndefined();
    expect(nodes(glass).find(({ type }) => type === Rect).props)
      .toMatchObject({ ...opening, stroke: '#e2e8f0', strokeWidth: 1, fillEnabled: false });
    const marks = nodes(glass).filter(({ type }) => type === Line);
    expect(marks).toHaveLength(3);
    expect(marks[1].props.strokeWidth).toBeGreaterThan(marks[0].props.strokeWidth);
    expect(marks[0].props.strokeWidth).toBeGreaterThan(marks[2].props.strokeWidth);
    marks.forEach(({ props }, index) => {
      const mark = entry.glass[0].marks[index];
      const a = wallToScreen({ x: mark.x1, z: mark.z1 }, transform);
      const b = wallToScreen({ x: mark.x2, z: mark.z2 }, transform);
      expect(mark.weight).toBe([70, 100, 35][index]);
      expect(props).toMatchObject({ points: [a.x, a.y, b.x, b.y], stroke: '#e2e8f0',
        strokeWidth: [70, 100, 35][index] / 100 / 25.4 * state.settings.plotScale * transform.scale });
    });
    const details = tree.find(({ type }) => type === DoorDetails);
    expect(details.props.showDetails).toBe(false);
    expect(details.props.parts.find(({ key }) => key === 'a:r').openingsShown).toBe(false);
  });

  it('anchor 4: draws a 22 1/2 by 1 1/4 placed rod with its centered Fixed rod label', () => {
    state.settings.accessories = [{ ...newAccessory([], 'FR'), name: 'Fixed rod',
      size: { width: 'section', height: 1.25, depth: 1.25 }, lengthDeduction: 0.25 }];
    leaf().interior = { accessories: [{ accessoryId: 'FR', fromBottom: 20 }] };
    const { shapes } = view();
    const rod = shapes.find(({ key }) => key === 'accessory:r:0');
    const expected = wallRectToScreen({ x: 24.75, z: 24.125, width: 22.5, height: 1.25 }, transform);
    expect(nodes(rod).find(({ type }) => type === Rect).props)
      .toMatchObject({ ...expected, stroke: '#94a3b8', strokeWidth: 1 });
    expect(nodes(rod).find(({ type }) => type === Text).props)
      .toMatchObject({ ...expected, text: 'Fixed rod', fill: '#94a3b8', align: 'center', verticalAlign: 'middle' });
  });

  it('anchor 6: closed doors produce no show-through group or marks, with an empty default prop', () => {
    leaf().face = { type: 'door', size: null };
    const result = view();
    expect(result.layer).toBeUndefined();
    expect(result.shapes).toEqual([]);
    expect(view({ showThrough: undefined }).layer).toBeUndefined();
  });

  it('passes each combined face and preview run only its own entries, with a union clip for pair glass', () => {
    leaf().face = { type: 'pair_door', panelMaterial: 'glass', size: null };
    const room = state.rooms[0];
    const second = structuredClone(room.walls[0]);
    second.id = 'wall-2';
    second.runs[0].id = 'run-2';
    room.walls.push(second);
    const combined = { faces: room.walls.map((wall, index) => ({
      key: wall.id, wallId: wall.id, side: 'front', length: 144, height: 96, dx: index * 144, depth: 0,
    })) };
    const faces = resolveCombinedFaces(room, combined, state.settings);
    const shapes = nodes(CombinedFaces({ room, combined, faces, activeKey: 'wall-1',
      settings: state.settings, diagnostics: {}, transform }));
    expect(wallShowThrough).toHaveBeenCalledTimes(1);
    const runNode = shapes.find(({ type }) => type === RunGroup);
    expect(runNode.props.showThrough).toHaveLength(1);
    expect(runNode.props.showThrough[0].runId).toBe('run-2');
    const preview = nodes(ElevationPreviews({ stretchPreview: { room, wall: faces.get('wall-2').wall,
      runIds: ['run-2'] }, settings: state.settings, transform, showThrough: runNode.props.showThrough }));
    const previewRun = preview.find(({ type }) => type === RunGroup);
    const tree = nodes(RunGroup.type(previewRun.props));
    const layer = tree.find(({ type }) => type === ShowThroughInteriors);
    expect(layer.props.entries).toEqual(runNode.props.showThrough);
    const rendered = nodes(ShowThroughInteriors(layer.props));
    const context = { rect: vi.fn() };
    rendered.find(({ props }) => props.clipFunc).props.clipFunc(context);
    expect(context.rect).toHaveBeenCalledTimes(2);
    expect(rendered.filter(({ type }) => type === Line)).toHaveLength(6);
    wallShowThrough.mockClear();
    const doorsOff = nodes(CombinedFaces({ room, combined, faces, activeKey: 'wall-1',
      settings: state.settings, diagnostics: {}, transform, doorsOff: true }));
    expect(doorsOff.find(({ type }) => type === RunGroup).props.showThrough).toEqual([]);
    expect(wallShowThrough).not.toHaveBeenCalled();
  });

  it('keeps divider and shoe outlines, rollout labels and translucent spacers without warning colors', () => {
    const entries = [{ itemId: 'a', windows: [{ x: 24, z: 4, width: 24, height: 30.5 }], glass: [], items: [
      { key: 'divider:r:0', kind: 'divider', x: 24.75, z: 19, width: 22.5, height: 0.75 },
      { key: 'shoe:r:0', kind: 'shoe', x: 24.8125, z: 4.75, width: 22.375, height: 1.467221 },
      { key: 'rollout:r:0', kind: 'rollout', x: 26, z: 8, width: 20, height: 4.25 },
      { key: 'spacer:r:0:left', kind: 'spacer', x: 24.75, z: 4.75, width: 1.25, height: 20 },
    ] }];
    const shapes = nodes(ShowThroughInteriors({ entries, transform }));
    const rects = shapes.filter(({ type }) => type === Rect);
    expect(rects.map(({ props }) => props.stroke)).toEqual(['#94a3b8', '#94a3b8', '#e2e8f0', undefined]);
    expect(rects[0].props).toMatchObject({ strokeWidth: 0.75, fillEnabled: false });
    expect(rects[3].props).toMatchObject({ fill: '#cbd5e1', opacity: 0.5 });
    expect(shapes.filter(({ type }) => type === Text).map(({ props }) => props.text)).toEqual(['RO 4 1/4']);
    const tiny = nodes(ShowThroughInteriors({ entries, transform: { ...transform, scale: 0.1 } }));
    expect(tiny.some(({ type }) => type === Text)).toBe(false);
  });

  it('uses section bounds for beside-box and above-line accessory labels and hides cramped text', () => {
    state.settings.accessories = [
      { ...newAccessory([], 'HK'), name: 'Hook', size: { width: 3, height: 2, depth: 3 } },
      { ...newAccessory([], 'TR'), name: 'Tray' },
    ];
    leaf().interior = { accessories: [{ accessoryId: 'HK', fromBottom: 20 },
      { accessoryId: 'TR', fromBottom: 10, qty: 3 }] };
    const { shapes, layer } = view();
    const hook = nodes(shapes.find(({ key }) => key === 'accessory:r:0'));
    const box = hook.find(({ type }) => type === Rect).props;
    expect(hook.find(({ type }) => type === Text).props.x).toBe(box.x + box.width + 3);
    const tray = nodes(shapes.find(({ key }) => key === 'accessory:r:1'));
    expect(tray.find(({ type }) => type === Text).props).toMatchObject({
      text: '3 × Tray', y: tray.find(({ type }) => type === Line).props.points[1] - 13, fill: '#94a3b8',
    });
    const tiny = nodes(ShowThroughInteriors({ ...layer.props, transform: { ...transform, scale: 0.1 } }));
    expect(tiny.some(({ type }) => type === Text)).toBe(false);
  });
});
