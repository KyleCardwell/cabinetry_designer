import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useEffect, useReducer, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { moveProfilePoint } from '../../elevation/model/profileEditing.js';
import { newSectionProfile } from '../../elevation/model/sectionProfiles.js';
import ProfileEditor from '../profileEditor/ProfileEditor.jsx';
import { toScreen } from '../profileEditor/profileView.js';
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
  useEffect: vi.fn(), useImperativeHandle: vi.fn(), useRef: vi.fn(), useCallback: (callback) => callback }));
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
let refSlots;
let navigate;
let dispatch;
let onClose;

function render(Component, props = {}) {
  const state = slots.get(Component) ?? [];
  slots.set(Component, state);
  const refs = refSlots.get(Component) ?? [];
  refSlots.set(Component, refs);
  let refIndex = 0;
  useRef.mockImplementation((initial) => refs[refIndex++] ??= { current: initial });
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
  refSlots = new Map();
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

it('front point edit saves p3 [30, 3] at version 2 without creating plan or side (SH2)', () => {
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

const openRod = () => dispatch(addShape({ shape: structuredClone(ROD) }));
const draft = () => histories.get(ShapeEditor).draft;
const boxPanel = () => render(BoxPanel, component(editor(), BoxPanel).props);
const tabs = () => render(ViewTabs, component(editor(), ViewTabs).props);
const selectView = (view) => nodes(tabs()).find((node) => node.props?.id === `shape-tab-${view}`).props.onClick();

const canvasSize = { width: 1000, height: 600 };
const canvasView = { cx: 15, cy: 1.5, scale: 25 };
function rodCanvas() {
  const props = component(editor(), ProfileCanvas).props;
  if (!slots.has(ProfileCanvas.render)) {
    slots.set(ProfileCanvas.render, [canvasSize, canvasView]);
    refSlots.set(ProfileCanvas.render, [{ current: { getBoundingClientRect: () => ({ left: 0, top: 0 }) } }]);
  }
  return render(ProfileCanvas.render, props);
}
const svgProps = () => component(rodCanvas(), 'svg').props;
function pointer(xy, id = null, options = {}) {
  const [clientX, clientY] = toScreen(slots.get(ProfileCanvas.render)[1], canvasSize, xy);
  return { clientX, clientY, pointerId: 1, button: 0, preventDefault: vi.fn(),
    target: { closest: () => id ? { dataset: { pointId: id } } : null },
    currentTarget: { setPointerCapture: vi.fn(), hasPointerCapture: () => false }, ...options };
}
function clickPoint(id, shiftKey = false) {
  const xy = component(editor(), ProfileCanvas).props.profile.geometry.points[id];
  const svg = svgProps();
  svg.onPointerDown(pointer(xy, id, { shiftKey }));
  svg.onPointerUp(pointer(xy, id, { shiftKey }));
}
function shapeKey(key, options = {}) {
  editor();
  useEffect.mock.lastCall[0]();
  const event = { key, target: {}, preventDefault: vi.fn(), ...options };
  window.addEventListener.mock.lastCall[1](event);
  return event;
}

it('Set as 0,0 on front r3 shifts every shared axis, box and zones across tabs and panels (SH2)', () => {
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

const stretchPanel = () => render(StretchPanel, component(editor(), StretchPanel).props);
const addZone = (axis) => field(stretchPanel(), `Add ${axis} zone`).props.onClick();
const setZone = (axis, index, end, value) => field(stretchPanel(), `${axis} zone ${index} ${end}`).props.onCommit(value);

it('From 3 clears the arc conflict and saves x 3–27 with one version bump (SH2)', () => {
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

