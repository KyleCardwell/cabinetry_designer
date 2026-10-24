import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useEffect, useReducer, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { moveProfilePoint } from '../../elevation/model/profileEditing.js';
import { newShape } from '../../elevation/model/libraryShapes.js';
import elevationReducer, { addShape, createInitialElevationState } from '../../elevation/store/elevationSlice.js';
import ShapesPage from '../ShapesPage.jsx';
import ProfileThumbnail from '../ProfileThumbnail.jsx';
import LibraryLayout from '../LibraryLayout.jsx';
import WorkspaceSourceBar from '../WorkspaceSourceBar.jsx';
import ShapeEditor from '../shapeEditor/ShapeEditor.jsx';
import ShapeEditorPage from '../shapeEditor/ShapeEditorPage.jsx';
import ProfileCanvas from '../profileEditor/ProfileCanvas.jsx';
import PointsPanel from '../profileEditor/PointsPanel.jsx';
import CoordInput from '../profileEditor/CoordInput.jsx';
import BoxPanel from '../shapeEditor/BoxPanel.jsx';
import StretchPanel from '../shapeEditor/StretchPanel.jsx';
import ViewTabs from '../shapeEditor/ViewTabs.jsx';
import SegmentPanel from '../profileEditor/SegmentPanel.jsx';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useReducer: vi.fn(),
  useEffect: vi.fn(), useRef: (current) => ({ current }), useCallback: (callback) => callback }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('react-router-dom', async (original) => ({ ...await original(), useNavigate: vi.fn(), useParams: vi.fn() }));
vi.mock('../../sandbox.js', () => ({ SANDBOX_ENABLED: true }));

const ROD = {
  id: 'rod', name: 'Closet rod', kind: 'accessory', version: 1, archived: false,
  box: { x: 0, y: 0, z: 0, w: 30, h: 3, d: 2 }, stretch: {},
  views: { front: {
    units: 'in',
    points: {
      a: [0, 0], b: [3, 0], c: [3, 3], d: [0, 3],
      e: [27, 0], f: [30, 0], g: [30, 3], h: [27, 3],
      hl: [0.875, 1.5], hr: [2.125, 1.5], jl: [27.875, 1.5], jr: [29.125, 1.5],
      r1: [3, 2.03125], r2: [27, 2.03125], r3: [3, 0.96875], r4: [27, 0.96875],
    },
    loops: [
      { id: 'left', closed: true, segs: [
        { type: 'line', from: 'a', to: 'b' }, { type: 'line', from: 'b', to: 'c' },
        { type: 'line', from: 'c', to: 'd' }, { type: 'line', from: 'd', to: 'a' },
      ] },
      { id: 'right', closed: true, segs: [
        { type: 'line', from: 'e', to: 'f' }, { type: 'line', from: 'f', to: 'g' },
        { type: 'line', from: 'g', to: 'h' }, { type: 'line', from: 'h', to: 'e' },
      ] },
      { id: 'hole-left', closed: true, segs: [
        { type: 'arc', from: 'hl', to: 'hr', center: [1.5, 1.5], ccw: true },
        { type: 'arc', from: 'hr', to: 'hl', center: [1.5, 1.5], ccw: true },
      ] },
      { id: 'hole-right', closed: true, segs: [
        { type: 'arc', from: 'jl', to: 'jr', center: [28.5, 1.5], ccw: true },
        { type: 'arc', from: 'jr', to: 'jl', center: [28.5, 1.5], ccw: true },
      ] },
      { id: 'rod-top', closed: false, segs: [{ type: 'line', from: 'r1', to: 'r2' }] },
      { id: 'rod-bottom', closed: false, segs: [{ type: 'line', from: 'r3', to: 'r4' }] },
    ],
  } },
};

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join(' ')
  : tree && typeof tree === 'object' ? text(tree.props?.children)
    : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
const button = (tree, label) => nodes(tree).find((node) => node.type === 'button' && text(node) === label);
const component = (tree, type) => nodes(tree).find((node) => node.type === type);
const field = (tree, label) => nodes(tree).find((node) => node.props?.['aria-label'] === label);
let elevation;
let slots;
let histories;
let navigate;
let dispatch;
let onClose;

function render(Component, props = {}) {
  const state = slots.get(Component) ?? [];
  slots.set(Component, state);
  let index = 0;
  useState.mockImplementation((initial) => {
    const slot = index++;
    if (!(slot in state)) state[slot] = typeof initial === 'function' ? initial() : initial;
    return [state[slot], (next) => { state[slot] = typeof next === 'function' ? next(state[slot]) : next; }];
  });
  useReducer.mockImplementation((reducer, initial, init) => {
    if (!histories.has(Component)) histories.set(Component, init(initial));
    return [histories.get(Component), (action) => histories.set(Component, reducer(histories.get(Component), action))];
  });
  return Component(props);
}
const editor = () => render(ShapeEditor, { shapeId: elevation.settings.shapes[0]?.id, onClose });
const change = (label, value) => field(editor(), label).props.onChange({ target: { value } });
const add = () => button(render(ShapesPage), 'New shape').props.onClick();

beforeEach(() => {
  vi.clearAllMocks();
  slots = new Map();
  histories = new Map();
  elevation = createInitialElevationState(null);
  navigate = vi.fn();
  onClose = vi.fn();
  dispatch = vi.fn((action) => { elevation = elevationReducer(elevation, action); });
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation }));
  useNavigate.mockReturnValue(navigate);
  useParams.mockImplementation(() => ({ shapeId: elevation.settings.shapes[0]?.id }));
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

it('SH2 d anchor 1: new sandbox shape opens its editor and lists name, kind, size and front thumbnail', () => {
  add();
  const shape = elevation.settings.shapes[0];
  expect(navigate).toHaveBeenCalledWith(`/library/shapes/${shape.id}`);
  const tree = render(ShapesPage);
  expect(text(tree)).toContain('New shape');
  expect(text(tree)).toContain('Other · 12 × 12 × 12');
  expect(component(tree, ProfileThumbnail).props.profile.geometry).toEqual(shape.views.front);
  expect(nodes(tree).find((node) => node.props?.to === `/library/shapes/${shape.id}`).props.children).toBe('Edit');
  expect(field(editor(), 'Shape name').props.value).toBe('New shape');
  expect(component(render(ShapeEditorPage), ShapeEditor).props.shapeId).toBe(shape.id);
  expect(component(render(ShapeEditorPage), WorkspaceSourceBar).props.allowSwitch).toBe(false);
  const links = nodes(render(LibraryLayout)).filter((node) => node.props?.to);
  expect(links.slice(-2).map((node) => node.props.to)).toEqual(['accessories', 'shapes']);
});

it('SH2 d anchor 2: front point edit saves p3 [30, 3] at version 2 without creating plan or side', () => {
  add();
  const initial = structuredClone(elevation.settings.shapes[0]);
  let canvas = component(editor(), ProfileCanvas);
  expect(canvas.props.onApply(moveProfilePoint(canvas.props.profile, 'p3', [30, 3]))).toBe(true);
  expect(button(editor(), 'Save').props.disabled).toBe(false);
  button(editor(), 'Save').props.onClick();
  expect(elevation.settings.shapes[0]).toMatchObject({ version: 2, views: { front: { points: { p3: [30, 3] } } } });
  expect(Object.keys(elevation.settings.shapes[0].views)).toEqual(['front']);
  expect(elevation.settings.shapes[0].box).toEqual(initial.box);
  expect(button(editor(), 'Save').props.disabled).toBe(true);
  const pointsProps = component(editor(), PointsPanel).props;
  expect(pointsProps.onOrigin).toBeTypeOf('function');
  expect(button(render(PointsPanel, pointsProps), 'Set as 0,0')).toBeDefined();
  expect(button(render(PointsPanel, { ...pointsProps, onOrigin: undefined }), 'Origin')).toBeDefined();
  canvas = component(editor(), ProfileCanvas);
  expect(canvas.props.ghost.points).toEqual({ b1: [0, 0], b2: [12, 0], b3: [12, 12], b4: [0, 12] });
  expect(text(editor())).not.toMatch(/Rotate|Drawn points/);
  canvas.props.onSelect({ kind: 'segment', loopId: 'L1', index: 0 });
  expect(component(editor(), SegmentPanel).props.profile.geometry.points.p3).toEqual([30, 3]);
  const open = field(editor(), 'Open loop L1');
  open.props.onClick();
  expect(component(editor(), ProfileCanvas).props.profile.geometry.loops[0].closed).toBe(false);
});

it('SH2 d anchor 3: rename-only Save keeps version 1; metadata supports undo, redo and discard', () => {
  add();
  change('Shape name', '  Renamed  ');
  expect(button(editor(), 'Undo').props.disabled).toBe(false);
  button(editor(), 'Undo').props.onClick();
  expect(field(editor(), 'Shape name').props.value).toBe('New shape');
  button(editor(), 'Redo').props.onClick();
  button(editor(), 'Save').props.onClick();
  expect(elevation.settings.shapes[0]).toMatchObject({ name: 'Renamed', version: 1 });
  expect(button(editor(), 'Save').props.disabled).toBe(true);
  change('Shape kind', 'leg');
  change('Shape notes', '  Painted  ');
  button(editor(), 'Save').props.onClick();
  expect(elevation.settings.shapes[0]).toMatchObject({ kind: 'leg', notes: 'Painted', version: 1 });
  change('Shape name', 'Discard me');
  button(editor(), '← Shapes').props.onClick();
  expect(onClose).not.toHaveBeenCalled();
  button(editor(), 'Discard changes?').props.onClick();
  expect(onClose).toHaveBeenCalledWith({ saved: true });
  expect(elevation.settings.shapes[0].name).toBe('Renamed');
});

it('SH2 d anchor 4: shop Archive, Show archived and Restore; new names include archived entries', () => {
  elevation = { ...elevation, source: 'cloud', cloud: { permissions: { manage: true } } };
  add();
  button(render(ShapesPage), 'Archive').props.onClick();
  expect(text(render(ShapesPage))).toContain('Accessories that use it will still draw it.');
  button(render(ShapesPage), 'Confirm archive').props.onClick();
  expect(component(render(ShapesPage), ProfileThumbnail)).toBeUndefined();
  nodes(render(ShapesPage)).find((node) => node.props?.type === 'checkbox').props.onChange({ target: { checked: true } });
  expect(button(render(ShapesPage), 'Restore')).toBeDefined();
  expect(nodes(render(ShapesPage)).some((node) => node.props?.className?.includes('opacity-60'))).toBe(true);
  add();
  expect(elevation.settings.shapes[1].name).toBe('New shape 2');
  button(render(ShapesPage), 'Restore').props.onClick();
  expect(elevation.settings.shapes[0].archived).toBe(false);
  button(render(ShapesPage), 'Copy').props.onClick();
  expect(elevation.settings.shapes[2]).toMatchObject({ name: 'New shape copy', version: 1, archived: false });
  expect(elevation.settings.shapes[2].views).toEqual(elevation.settings.shapes[0].views);
  field(render(ShapesPage), 'Search shapes').props.onChange({ target: { value: '  COPY ' } });
  expect(nodes(render(ShapesPage)).filter((node) => node.type === ProfileThumbnail)).toHaveLength(1);
  button(render(ShapesPage), 'Appliance').props.onClick();
  expect(text(render(ShapesPage))).toContain('No shapes match.');
});

it('SH2 d validates names and stretch conflicts, confirms sandbox deletion, and guards read-only editing', () => {
  add();
  dispatch(addShape({ shape: { ...newShape(elevation.settings.shapes, 'other'), name: 'Taken' } }));
  change('Shape name', '  ');
  expect(button(editor(), 'Save').props.disabled).toBe(true);
  expect(component(editor(), ProfileCanvas).props.profile).toBeTruthy();
  change('Shape name', ' taken ');
  expect(text(editor())).toContain('A live shape already has that name.');
  expect(button(editor(), 'Save').props.disabled).toBe(true);
  change('Shape name', 'Unique');
  const history = histories.get(ShapeEditor);
  history.draft = { ...history.draft, stretch: { x: [[-1, 2]] } };
  expect(button(editor(), 'Save').props.disabled).toBe(true);
  expect(text(stretchPanel())).toContain('is outside the size box.');
  history.draft = { ...history.draft, stretch: {} };
  elevation = { ...elevation, source: 'cloud', cloud: { permissions: { manage: false } } };
  let tree = editor();
  expect(button(tree, 'Save').props.disabled).toBe(true);
  expect(button(tree, 'Undo').props.disabled).toBe(true);
  expect(component(render(ShapeEditorPage), 'fieldset').props.disabled).toBe(true);
  expect(button(render(ShapesPage), 'New shape').props.disabled).toBe(true);
  const before = structuredClone(histories.get(ShapeEditor).draft);
  const canvas = component(tree, ProfileCanvas);
  expect(canvas.props.onApply(moveProfilePoint(canvas.props.profile, 'p3', [30, 3]))).toBe(false);
  field(tree, 'Shape name').props.onChange({ target: { value: 'Forbidden' } });
  useEffect.mock.lastCall[0]();
  const listener = window.addEventListener.mock.lastCall[1];
  listener({ key: 'z', ctrlKey: true, target: {}, preventDefault: vi.fn() });
  expect(histories.get(ShapeEditor).draft).toEqual(before);
  elevation = { ...elevation, source: 'local' };
  tree = render(ShapesPage);
  button(tree, 'Delete').props.onClick();
  expect(elevation.settings.shapes).toHaveLength(2);
  button(render(ShapesPage), 'Confirm delete').props.onClick();
  expect(elevation.settings.shapes.map((shape) => shape.id)).toEqual(['other']);
});


const openRod = () => dispatch(addShape({ shape: structuredClone(ROD) }));
const draft = () => histories.get(ShapeEditor).draft;
const boxPanel = () => render(BoxPanel, component(editor(), BoxPanel).props);
const tabs = () => render(ViewTabs, component(editor(), ViewTabs).props);
const selectView = (view) => nodes(tabs()).find((node) => node.props?.id === `shape-tab-${view}`).props.onClick();

it('SH2 e anchor 1: plan starts as the box rectangle, draws explicitly, edits independently, and confirms removal', () => {
  openRod();
  expect(button(editor(), 'Draw this view')).toBeUndefined();
  expect(button(editor(), 'Remove view')).toBeUndefined();
  expect(text(tabs())).toContain('x → , z ↑');
  expect(text(tabs())).toContain('x → , y ↑ (back)');
  component(editor(), ProfileCanvas).props.onSelect({ kind: 'point', id: 'r3' });
  selectView('plan');
  let canvas = component(editor(), ProfileCanvas);
  const rectangle = { b1: [0, 0], b2: [30, 0], b3: [30, 2], b4: [0, 2] };
  expect(canvas.props.profile.geometry.points).toEqual(rectangle);
  expect(canvas.props.ghost.points).toEqual(rectangle);
  expect(canvas.props.selection).toBeNull();
  expect(component(editor(), PointsPanel)).toBeUndefined();
  expect(text(editor()).replace(/\s+/g, ' ')).toContain('No plan view yet: drawn as the W × D size-box rectangle.');
  expect(button(editor(), 'Line (L)').props.disabled).toBe(true);
  expect(canvas.props.onApply(moveProfilePoint(canvas.props.profile, 'b3', [28, 2]))).toBe(false);
  expect(draft().views.plan).toBeUndefined();
  button(editor(), 'Draw this view').props.onClick();
  expect(draft().views.plan.points).toEqual(rectangle);
  expect(draft().views.plan.loops[0].closed).toBe(true);
  canvas = component(editor(), ProfileCanvas);
  expect(canvas.props.onApply(moveProfilePoint(canvas.props.profile, 'b3', [28, 2]))).toBe(true);
  expect(draft().views.front).toEqual(ROD.views.front);
  button(editor(), 'Save').props.onClick();
  expect(elevation.settings.shapes[0].views.plan.points.b3).toEqual([28, 2]);
  button(editor(), 'Remove view').props.onClick();
  expect(draft().views.plan).toBeDefined();
  button(editor(), 'Confirm remove view').props.onClick();
  expect(draft().views).not.toHaveProperty('plan');
  expect(component(editor(), ProfileCanvas).props.profile.geometry.points).toEqual(rectangle);
  button(editor(), 'Undo').props.onClick();
  expect(draft().views.plan.points.b3).toEqual([28, 2]);
  button(editor(), 'Redo').props.onClick();
  button(editor(), 'Save').props.onClick();
  expect(elevation.settings.shapes[0].views).not.toHaveProperty('plan');
});

it('SH2 e anchor 2: W typed 24 updates the box and ghost; Fit restores 30 and keeps the undrawn depth', () => {
  openRod();
  const width = field(boxPanel(), 'W');
  expect(width.type).toBe(CoordInput);
  useState.mockReturnValueOnce(['24', vi.fn()]);
  CoordInput(width.props).props.onBlur();
  expect(draft().box.w).toBe(24);
  expect(field(boxPanel(), 'W').props.value).toBe(24);
  expect(component(editor(), ProfileCanvas).props.ghost.points.b3).toEqual([24, 3]);
  expect(draft().views.front).toEqual(ROD.views.front);
  button(boxPanel(), 'Fit to drawing').props.onClick();
  expect(draft().box).toEqual({ x: 0, y: 0, z: 0, w: 30, h: 3, d: 2 });
  expect(field(boxPanel(), 'W').props.value).toBe(30);
  for (const label of ['W', 'H', 'D']) {
    for (const value of [0, -1, Infinity, NaN]) {
      expect(field(boxPanel(), label).props.onCommit(value)).toBe(false);
    }
  }
  expect(field(boxPanel(), 'Front y').props.onCommit(-2.5)).toBe(true);
  expect(draft().box.y).toBe(-2.5);
  button(boxPanel(), 'Fit to drawing').props.onClick();
  expect(draft().box.y).toBe(-2.5);
  selectView('plan');
  expect(component(editor(), ProfileCanvas).props.ghost.points.b1).toEqual([0, -2.5]);
});

it('SH2 e anchor 3: Set as 0,0 on front r3 shifts every shared axis, box and zones across tabs and panels', () => {
  openRod();
  selectView('plan');
  button(editor(), 'Draw this view').props.onClick();
  selectView('side');
  button(editor(), 'Draw this view').props.onClick();
  selectView('front');
  histories.get(ShapeEditor).draft.stretch = { x: [[3, 27]] };
  const points = render(PointsPanel, component(editor(), PointsPanel).props);
  const row = nodes(points).find((node) => node.type === 'tr' && field(node, 'Name of r3'));
  button(row, 'Set as 0,0').props.onClick();
  expect(draft().box).toEqual({ x: -3, y: 0, z: -0.96875, w: 30, h: 3, d: 2 });
  expect(draft().stretch.x).toEqual([[0, 24]]);
  expect(draft().views.front.points.r3).toEqual([0, 0]);
  expect(draft().views.front.loops[2].segs[0].center).toEqual([-1.5, 0.53125]);
  expect(field(boxPanel(), 'Left x').props.value).toBe(-3);
  expect(field(boxPanel(), 'Bottom z').props.value).toBe(-0.96875);
  expect(field(render(PointsPanel, component(editor(), PointsPanel).props), 'x of r3').props.value).toBe(0);
  expect(field(render(PointsPanel, component(editor(), PointsPanel).props), 'y of r3').props.value).toBe(0);
  for (const [view, expected] of [['front', [-3, -0.96875]], ['plan', [-3, 0]], ['side', [0, -0.96875]]]) {
    selectView(view);
    const canvas = component(editor(), ProfileCanvas);
    expect(canvas.props.profile.geometry.points[view === 'front' ? 'a' : 'b1']).toEqual(expected);
    expect(canvas.props.ghost.points.b1).toEqual(expected);
    expect(nodes(tabs()).find((node) => node.props?.id === `shape-tab-${view}`).props['aria-selected']).toBe(true);
  }
  button(editor(), 'Save').props.onClick();
  expect(elevation.settings.shapes[0].box).toEqual(draft().box);
});

it('SH2 e anchor 4: two left–right flips restore the whole shape and retain two undo entries', () => {
  openRod();
  editor();
  const before = structuredClone(draft());
  button(editor(), '⇆ Flip left–right').props.onClick();
  expect(draft().box.x).toBe(-30);
  expect(draft().views.front.loops[2].segs[0]).toMatchObject({ center: [-1.5, 1.5], ccw: false });
  const flipped = structuredClone(draft());
  button(editor(), '⇆ Flip left–right').props.onClick();
  expect(draft()).toEqual(before);
  expect(histories.get(ShapeEditor).past).toHaveLength(2);
  button(editor(), 'Undo').props.onClick();
  expect(draft()).toEqual(flipped);
  expect(button(editor(), 'Undo').props.disabled).toBe(false);
  button(editor(), 'Undo').props.onClick();
  expect(draft()).toEqual(before);
  expect(button(editor(), 'Undo').props.disabled).toBe(true);
  button(editor(), 'Redo').props.onClick();
  button(editor(), 'Redo').props.onClick();
  expect(draft()).toEqual(before);
});

it('SH2 e supports side editing, y/z flips, and guards all new mutations in read-only mode', () => {
  openRod();
  selectView('plan');
  button(editor(), 'Draw this view').props.onClick();
  selectView('side');
  expect(text(tabs())).toContain('y → (back), z ↑');
  expect(text(editor()).replace(/\s+/g, ' ')).toContain('No side view yet: drawn as the D × H size-box rectangle.');
  expect(component(editor(), ProfileCanvas).props.profile.geometry.points.b3).toEqual([2, 3]);
  button(editor(), 'Draw this view').props.onClick();
  const canvas = component(editor(), ProfileCanvas);
  canvas.props.onApply(moveProfilePoint(canvas.props.profile, 'b3', [4, 6]));
  button(boxPanel(), 'Fit to drawing').props.onClick();
  expect(draft().box).toEqual({ x: 0, y: 0, z: 0, w: 30, h: 6, d: 4 });
  button(editor(), 'Flip front–back').props.onClick();
  expect(draft().box.y).toBe(-4);
  expect(draft().views.side.points.b3).toEqual([-4, 6]);
  expect(draft().views.plan.points.b3).toEqual([30, -2]);
  expect(draft().views.front).toEqual(ROD.views.front);
  button(editor(), '⇅ Flip up–down').props.onClick();
  expect(draft().box.z).toBe(-6);
  expect(draft().views.side.points.b3).toEqual([-4, -6]);
  expect(draft().views.front.loops[2].segs[0]).toMatchObject({ center: [1.5, -1.5], ccw: false });
  const before = structuredClone(draft());
  elevation = { ...elevation, source: 'cloud', cloud: { permissions: { manage: false } } };
  for (const label of ['⇆ Flip left–right', '⇅ Flip up–down', 'Flip front–back', 'Remove view']) {
    expect(button(editor(), label).props.disabled).toBe(true);
    button(editor(), label).props.onClick();
  }
  expect(component(editor(), BoxPanel).props.readOnly).toBe(true);
  expect(field(boxPanel(), 'W').props.disabled).toBe(true);
  expect(field(boxPanel(), 'W').props.onCommit(24)).toBe(false);
  button(boxPanel(), 'Fit to drawing').props.onClick();
  component(editor(), PointsPanel).props.onOrigin('b3');
  expect(draft()).toEqual(before);
  elevation = { ...elevation, source: 'local' };
  button(editor(), 'Remove view').props.onClick();
  button(editor(), 'Confirm remove view').props.onClick();
  elevation = { ...elevation, source: 'cloud', cloud: { permissions: { manage: false } } };
  expect(button(editor(), 'Draw this view').props.disabled).toBe(true);
  button(editor(), 'Draw this view').props.onClick();
  expect(draft().views).not.toHaveProperty('side');
});


const stretchPanel = () => render(StretchPanel, component(editor(), StretchPanel).props);
const addZone = (axis) => field(stretchPanel(), `Add ${axis} zone`).props.onClick();
const setZone = (axis, index, end, value) => field(stretchPanel(), `${axis} zone ${index} ${end}`).props.onCommit(value);

it('SH2 f anchor 1: adding the middle third on x shares a vertical band on Front and Plan only', () => {
  openRod();
  addZone('x');
  expect(draft().stretch).toEqual({ x: [[10, 20]] });
  expect(text(stretchPanel()).replace(/\s+/g, ' ')).toContain('x 10" – 20"');
  for (const view of ['front', 'plan', 'side']) {
    selectView(view);
    expect(component(editor(), ProfileCanvas).props.bands).toEqual(view === 'side' ? []
      : [{ dir: 'vertical', from: 10, to: 20, problem: false }]);
    expect(Boolean(field(stretchPanel(), 'Add x zone'))).toBe(view !== 'side');
  }
});

it('SH2 f anchor 2: typed 2–27 marks the band red and blocks Save with the first problem as its title', () => {
  openRod();
  addZone('x');
  for (const [end, value] of [['From', '2'], ['To', '27']]) {
    const input = field(stretchPanel(), `x zone 1 ${end}`);
    expect(input.type).toBe(CoordInput);
    useState.mockReturnValueOnce([value, vi.fn()]);
    CoordInput(input.props).props.onBlur();
  }
  const problem = 'Stretch zone x 2"–27" crosses an arc in the front view.';
  expect(text(stretchPanel())).toContain(problem);
  expect(button(editor(), 'Save').props).toMatchObject({ disabled: true, title: problem });
  expect(component(editor(), ProfileCanvas).props.bands).toEqual([
    { dir: 'vertical', from: 2, to: 27, problem: true },
  ]);
  selectView('plan');
  expect(component(editor(), ProfileCanvas).props.bands[0].problem).toBe(true);
  button(editor(), 'Save').props.onClick();
  expect(elevation.settings.shapes[0].stretch).toEqual({});
});

it('SH2 f anchor 3: From 3 clears the arc conflict and saves x 3–27 with one version bump', () => {
  openRod();
  addZone('x');
  setZone('x', 1, 'From', 2);
  setZone('x', 1, 'To', 27);
  setZone('x', 1, 'From', 3);
  expect(component(editor(), StretchPanel).props.problems).toEqual([]);
  expect(button(editor(), 'Save').props).toMatchObject({ disabled: false, title: undefined });
  expect(component(editor(), ProfileCanvas).props.bands[0].problem).toBe(false);
  button(editor(), 'Save').props.onClick();
  expect(elevation.settings.shapes[0]).toMatchObject({ stretch: { x: [[3, 27]] }, version: 2 });
  expect(button(editor(), 'Save').props.disabled).toBe(true);
});

it('SH2 f anchor 4: removing the last zone deletes its axis key and saves an empty stretch object', () => {
  openRod();
  addZone('x');
  button(editor(), 'Save').props.onClick();
  field(stretchPanel(), 'Remove x zone 1').props.onClick();
  expect(draft().stretch).toEqual({});
  expect(component(editor(), ProfileCanvas).props.bands).toEqual([]);
  button(editor(), 'Undo').props.onClick();
  expect(draft().stretch).toEqual({ x: [[10, 20]] });
  button(editor(), 'Redo').props.onClick();
  button(editor(), 'Save').props.onClick();
  expect(elevation.settings.shapes[0]).toMatchObject({ stretch: {}, version: 3 });
});

it('SH2 f sorts edited and added zones, snaps all axes, limits four zones, and guards read-only changes', () => {
  add();
  field(boxPanel(), 'Left x').props.onCommit(-1);
  field(boxPanel(), 'W').props.onCommit(10);
  addZone('x');
  expect(draft().stretch.x).toEqual([[2.3125, 5.6875]]);
  setZone('x', 1, 'From', 6);
  expect(draft().stretch.x).toEqual([[2.3125, 5.6875]]);
  expect(text(editor())).toContain('A stretch zone needs From less than To.');
  setZone('x', 1, 'To', 8);
  setZone('x', 1, 'From', 7);
  addZone('x');
  expect(draft().stretch.x).toEqual([[2.3125, 5.6875], [7, 8]]);
  setZone('x', 2, 'From', 1);
  expect(draft().stretch.x).toEqual([[1, 8], [2.3125, 5.6875]]);
  expect(text(stretchPanel())).toContain('overlaps the zone before it.');
  setZone('x', 1, 'From', -2);
  expect(text(stretchPanel())).toContain('is outside the size box.');
  for (let i = 0; i < 3; i += 1) addZone('x');
  expect(draft().stretch.x).toHaveLength(4);
  expect(field(stretchPanel(), 'Add x zone').props.disabled).toBe(true);
  addZone('z');
  expect(draft().stretch.z).toEqual([[4, 8]]);
  expect(component(editor(), ProfileCanvas).props.bands.at(-1)).toMatchObject({ dir: 'horizontal', from: 4, to: 8 });
  selectView('plan');
  addZone('y');
  expect(draft().stretch.y).toEqual([[4, 8]]);
  expect(component(editor(), ProfileCanvas).props.bands.at(-1)).toMatchObject({ dir: 'horizontal', from: 4, to: 8 });
  selectView('side');
  expect(component(editor(), ProfileCanvas).props.bands).toEqual([
    { dir: 'vertical', from: 4, to: 8, problem: false },
    { dir: 'horizontal', from: 4, to: 8, problem: false },
  ]);
  elevation = { ...elevation, source: 'cloud', cloud: { permissions: { manage: false } } };
  const before = structuredClone(draft());
  for (const label of ['Add y zone', 'Remove y zone 1', 'y zone 1 From', 'y zone 1 To']) {
    expect(field(stretchPanel(), label).props.disabled).toBe(true);
  }
  addZone('y');
  field(stretchPanel(), 'Remove y zone 1').props.onClick();
  expect(setZone('y', 1, 'From', 3)).toBe(false);
  expect(draft()).toEqual(before);
});
