import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useEffect, useReducer, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { moveProfilePoint } from '../../elevation/model/profileEditing.js';
import { newShape } from '../../elevation/model/libraryShapes.js';
import { buildShape, stackHiddenBase } from '../../elevation/model/shapeBuilders.js';
import elevationReducer, { addShape, createInitialElevationState } from '../../elevation/store/elevationSlice.js';
import ShapesPage from '../ShapesPage.jsx';
import ShapeEditor from '../shapeEditor/ShapeEditor.jsx';
import ProfileCanvas from '../profileEditor/ProfileCanvas.jsx';
import ViewTabs from '../shapeEditor/ViewTabs.jsx';
import StretchPanel from '../shapeEditor/StretchPanel.jsx';
import OriginPanel from '../shapeEditor/OriginPanel.jsx';
import BoxPanel from '../shapeEditor/BoxPanel.jsx';
import DrawnPanel from '../profileEditor/DrawnPanel.jsx';
import BuilderPanel, { ExtrudeFields, ProfileSelect, StackFields } from '../shapeEditor/BuilderPanel.jsx';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useReducer: vi.fn(),
  useEffect: vi.fn(), useImperativeHandle: vi.fn(), useRef: vi.fn(), useCallback: (callback) => callback }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('react-router-dom', async (original) => ({ ...await original(), useNavigate: vi.fn(), useParams: vi.fn() }));
vi.mock('../../sandbox.js', () => ({ SANDBOX_ENABLED: true }));

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

const editor = () => render(ShapeEditor, { shapeId: elevation.settings.shapes[0]?.id, onClose });
const draft = () => histories.get(ShapeEditor).draft;
const tabs = () => render(ViewTabs, component(editor(), ViewTabs).props);
const selectView = (view) => nodes(tabs()).find((node) => node.props?.id === `shape-tab-${view}`).props.onClick();
const builderPanel = () => render(BuilderPanel, component(editor(), BuilderPanel).props);
const extrude = () => render(ExtrudeFields, component(builderPanel(), ExtrudeFields).props);
const stack = () => render(StackFields, component(builderPanel(), StackFields).props);
const save = () => button(editor(), 'Save').props.onClick();
const create = (label) => button(render(ShapesPage), label).props.onClick();
const pick = (tree, profileId) => {
  const select = render(ProfileSelect, component(tree, ProfileSelect).props);
  nodes(select).find((node) => node.type === 'select').props.onChange({ target: { value: profileId } });
  button(render(ProfileSelect, component(tree, ProfileSelect).props), 'Copy').props.onClick();
};

const BEAD = {
  units: 'in',
  points: { q1: [1, 0], q2: [1, 0.5], q3: [1, 1.5], q4: [1, 2] },
  loops: [{ id: 'L1', closed: false, segs: [
    { type: 'line', from: 'q1', to: 'q2' },
    { type: 'arc', from: 'q2', to: 'q3', center: [1, 1], ccw: true },
    { type: 'line', from: 'q3', to: 'q4' },
  ] }],
};
const openLeg = () => {
  const base = newShape([], 'leg', 'stack');
  dispatch(addShape({ shape: buildShape({ ...base, builder: { type: 'stack', stretch: 0, sections: [
    { type: 'square', width: 3.5, height: 8 },
    { type: 'turned', profile: BEAD, drawnPoints: { elevation: ['q1', 'q2', 'q3', 'q4'] } },
    { type: 'square', width: 2, height: 24.5 },
  ] } }) }));
};

it('SH5 c anchor 2: length 36 saves a 36 long front, x zone 0–36 and one version bump', () => {
  create('New extrusion');
  field(extrude(), 'Extrusion length').props.onCommit(36);
  save();
  expect(elevation.settings.shapes[0]).toMatchObject({ version: 2, stretch: { x: [[0, 36]] } });
  expect(elevation.settings.shapes[0].views.front.points.f2).toEqual([36, -0.65625]);
});

it('SH5.1 c anchor 1: inside taper keeps the outside faces plumb and adds 12 to 34.5', () => {
  create('New leg / column');
  button(stack(), 'Add tapered').props.onClick();
  field(stack(), 'Section 2 taper').props.onChange({ target: { value: 'inside' } });
  expect(draft().views.front.points).toMatchObject({ s2p1: [-0.5, 0], s2p2: [1, 0], s2p3: [1, 12], s2p4: [-1, 12] });
  expect(draft().views.side.points).toMatchObject({ s2p1: [-1, 0], s2p2: [0.5, 0], s2p3: [1, 12], s2p4: [-1, 12] });
  expect(draft().box.h).toBe(46.5);
  expect(text(stack())).toContain('Total height 46 1/2');
  expect(text(stack())).toContain('Draw the right-front leg: the right and front faces stay plumb.');
  field(stack(), 'Section 2 top').props.onCommit(3);
  field(stack(), 'Section 2 bottom').props.onCommit(2);
  field(stack(), 'Section 2 height').props.onCommit(13);
  expect(draft().builder.sections[1]).toMatchObject({ top: 3, bottom: 2, height: 13 });
  field(stack(), 'Section 2 shape').props.onChange({ target: { value: 'round' } });
  expect(draft().builder.sections[1]).toMatchObject({ shape: 'round', taper: 'all' });
  expect(field(stack(), 'Section 2 taper')).toBeUndefined();
});

const S = {
  id: 's-leg', name: 'S leg', kind: 'leg', version: 1, archived: false,
  box: { x: -1, y: 0, z: 0, w: 4, h: 30, d: 1 },
  stretch: { x: [[-0.5, 0.5]], z: [[14, 28]] },
  views: { front: {
    units: 'in',
    points: { a: [-1, 0], b: [2, 0], c: [2, 10], d: [2, 12], e: [2, 30], f: [-1, 30] },
    loops: [{ id: 'outline', closed: true, segs: [
      { type: 'line', from: 'a', to: 'b' },
      { type: 'line', from: 'b', to: 'c' },
      { type: 'arc', from: 'c', to: 'd', center: [2, 11], ccw: true },
      { type: 'line', from: 'd', to: 'e' },
      { type: 'line', from: 'e', to: 'f' },
      { type: 'line', from: 'f', to: 'a' },
    ] }],
  } },
};

const openS = () => {
  dispatch(addShape({ shape: structuredClone(S) }));
  selectView('side');
};
const tickMirror = (checked) => field(editor(), 'Side = mirrored Front').props.onChange({ target: { checked } });
const sizeBox = () => render(BoxPanel, component(editor(), BoxPanel).props);
const zones = () => render(StretchPanel, component(editor(), StretchPanel).props);
const origin = () => render(OriginPanel, component(editor(), OriginPanel).props);

afterEach(() => vi.unstubAllGlobals());

it('SH5.1 f anchor 2: width 5 derives read-only depth 5, with Front/Plan editing and x/z fitting', () => {
  openS();
  tickMirror(true);
  field(sizeBox(), 'W').props.onCommit(5);
  expect(draft().box).toMatchObject({ w: 5, d: 5, y: -4 });
  expect(field(sizeBox(), 'D').props).toMatchObject({ value: 5, disabled: true });
  expect(field(sizeBox(), 'Front y').props.disabled).toBe(true);
  for (const label of ['W', 'H', 'Left x', 'Bottom z']) expect(field(sizeBox(), label).props.disabled).toBe(false);
  selectView('front');
  const front = component(editor(), ProfileCanvas).props;
  expect(button(editor(), 'Line (L)').props.disabled).toBe(false);
  front.onApply(moveProfilePoint(front.profile, 'b', [2.5, 0]));
  expect(draft().views.side.points.b).toEqual([-2.5, 0]);
  field(zones(), 'x zone 1 From').props.onCommit(-0.75);
  expect(draft().stretch.y).toEqual([[-0.5, 0.75]]);
  const beforeMove = structuredClone(draft());
  field(origin(), 'Set 0,0 at X').props.onCommit(1);
  button(origin(), 'Set').props.onClick();
  expect(draft().views.front.points.b).toEqual([1.5, 0]);
  expect(draft().views.side.points.b).toEqual([-1.5, 0]);
  expect(draft().box.x).toBe(beforeMove.box.x - 1);
  button(editor(), '⇆ Flip left–right').props.onClick();
  expect(draft().views.side.points.b).toEqual([1.5, 0]);
  button(editor(), '⇆ Flip left–right').props.onClick();
  selectView('plan');
  expect(button(editor(), 'Draw this view')).toBeTruthy();
  button(editor(), 'Draw this view').props.onClick();
  const plan = component(editor(), ProfileCanvas).props;
  expect(button(editor(), 'Line (L)').props.disabled).toBe(false);
  const side = structuredClone(draft().views.side);
  plan.onApply(moveProfilePoint(plan.profile, 'b1', [-20, -20]));
  expect(draft().views.plan.points.b1).toEqual([-20, -20]);
  expect(draft().views.side).toEqual(side);
  const planGeometry = structuredClone(draft().views.plan);
  button(sizeBox(), 'Fit to drawing').props.onClick();
  // Front includes the knee arc's full extent; the hand-drawn Plan stays unchanged.
  expect(draft().box).toEqual({ x: -2, y: -2, z: 0, w: 4, h: 30, d: 4 });
  expect(draft().views.plan).toEqual(planGeometry);
  expect(draft().views.side).toEqual(side);
});

