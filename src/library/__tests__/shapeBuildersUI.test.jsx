import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useEffect, useReducer, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { moveProfilePoint } from '../../elevation/model/profileEditing.js';
import { newShape } from '../../elevation/model/libraryShapes.js';
import { buildShape } from '../../elevation/model/shapeBuilders.js';
import elevationReducer, { addShape, createInitialElevationState } from '../../elevation/store/elevationSlice.js';
import ShapesPage from '../ShapesPage.jsx';
import ShapeEditor from '../shapeEditor/ShapeEditor.jsx';
import ProfileCanvas from '../profileEditor/ProfileCanvas.jsx';
import ViewTabs from '../shapeEditor/ViewTabs.jsx';
import StretchPanel from '../shapeEditor/StretchPanel.jsx';
import OriginPanel from '../shapeEditor/OriginPanel.jsx';
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

it('SH5 c anchor 1: New extrusion opens on Side; Front is made and read-only; the list tags it', () => {
  create('New extrusion');
  const shape = elevation.settings.shapes[0];
  expect(navigate).toHaveBeenCalledWith(`/library/shapes/${shape.id}`);
  expect(component(editor(), ViewTabs).props.view).toBe('side');
  expect(button(editor(), 'Line (L)').props.disabled).toBe(false);
  expect(component(editor(), DrawnPanel)).toBeTruthy();
  selectView('front');
  expect(component(editor(), ProfileCanvas).props.profile.geometry).toEqual(shape.views.front);
  expect(button(editor(), 'Line (L)').props.disabled).toBe(true);
  expect(text(editor())).toContain('Made from the Side view by the extrusion builder.');
  expect(component(editor(), StretchPanel)).toBeUndefined();
  expect(component(editor(), OriginPanel)).toBeUndefined();
  expect(button(editor(), '⇆ Flip left–right')).toBeUndefined();
  expect(text(render(ShapesPage))).toContain('Accessory · Extrusion · 30 × 1 5/16 × 1 5/16');
});

it('SH5 c anchor 2: length 36 saves a 36 long front, x zone 0–36 and one version bump', () => {
  create('New extrusion');
  field(extrude(), 'Extrusion length').props.onCommit(36);
  save();
  expect(elevation.settings.shapes[0]).toMatchObject({ version: 2, stretch: { x: [[0, 36]] } });
  expect(elevation.settings.shapes[0].views.front.points.f2).toEqual([36, -0.65625]);
});

it('SH5 c anchor 3: Start from profile copies the geometry and drawn points into the Side view', () => {
  const profile = {
    id: 'cleat', name: 'Cleat', kind: 'other', version: 1, archived: false,
    geometry: {
      units: 'in',
      points: { k1: [0, 0], k2: [0.75, 0], k3: [0.75, 1.25], k4: [0.5, 1.5], k5: [0, 1.5] },
      loops: [{ id: 'L1', closed: true, segs: ['k1', 'k2', 'k3', 'k4', 'k5'].map((from, i, a) => ({
        type: 'line', from, to: a[(i + 1) % a.length] })) }],
    },
    drawnPoints: { elevation: ['k3'] },
  };
  elevation = { ...elevation, settings: { ...elevation.settings, sectionProfiles: [profile] } };
  create('New extrusion');
  pick(extrude(), 'cleat');
  expect(draft().views.side).toEqual(profile.geometry);
  expect(draft().builder.drawnPoints).toEqual({ elevation: ['k3'] });
  expect(render(DrawnPanel, component(editor(), DrawnPanel).props)).toBeTruthy();
  expect(field(render(DrawnPanel, component(editor(), DrawnPanel).props), 'k3 drawn in elevation').props.checked).toBe(true);
  expect(draft().views.front.points.l1a).toEqual([0, 1.25]);
});

it('SH5 c anchor 4: length 0 shows the problem and blocks Save; Front is unchanged', () => {
  create('New extrusion');
  editor();
  const front = draft().views.front;
  field(extrude(), 'Extrusion length').props.onCommit(0);
  expect(text(builderPanel())).toContain('The extrusion needs a length.');
  expect(button(editor(), 'Save').props).toMatchObject({ disabled: true, title: 'The extrusion needs a length.' });
  expect(draft().views.front).toEqual(front);
});

it('SH5 c anchor 5: Convert to drawn brings the drawing tools and panels back', () => {
  create('New extrusion');
  button(builderPanel(), 'Convert to drawn').props.onClick();
  expect(text(builderPanel())).toContain("can't come back");
  button(builderPanel(), 'Confirm convert to drawn').props.onClick();
  save();
  expect(Object.hasOwn(elevation.settings.shapes[0], 'builder')).toBe(false);
  expect(component(editor(), BuilderPanel)).toBeUndefined();
  selectView('front');
  expect(button(editor(), 'Line (L)').props.disabled).toBe(false);
  expect(component(editor(), StretchPanel)).toBeTruthy();
});

it('SH5 d anchor 1: Add turned goes to the bottom; ↑ moves it on top', () => {
  create('New leg / column');
  button(stack(), 'Add turned').props.onClick();
  expect(draft().builder.sections.map((s) => s.type)).toEqual(['square', 'turned']);
  expect(draft().views.front.points.s1p1).toEqual([-1.75, 2]);
  field(stack(), 'Move section 2 up').props.onClick();
  expect(draft().builder.sections.map((s) => s.type)).toEqual(['turned', 'square']);
  expect(draft().builder.stretch).toBe(1);
  expect(draft().views.front.points.s1r0).toEqual([1, 34.5]);
  expect(text(stack())).toContain('Total height 36 1/2');
});

it('SH5 d anchor 2/3: stretch radio only on square rows; the leg saves as built', () => {
  openLeg();
  const radios = nodes(stack()).filter((node) => node.type === 'input' && node.props.type === 'radio');
  expect(radios).toHaveLength(3); // two square rows + None
  expect(component(editor(), ProfileCanvas).props.bands).toEqual([
    { dir: 'horizontal', from: 26.5, to: 34.5, problem: false },
  ]);
  expect(component(editor(), OriginPanel)).toBeUndefined();
  expect(button(editor(), 'Flip front–back')).toBeUndefined();
  expect(text(editor())).toContain('Made by the leg / column builder.');
});

it('SH5 d anchor 4: editing the bead profile rebuilds the leg', () => {
  openLeg();
  button(stack(), 'Edit profile').props.onClick();
  const canvas = component(editor(), ProfileCanvas).props;
  expect(canvas.profile.geometry).toEqual(BEAD);
  expect(canvas.ghost.points.q4).toEqual([-1, 2]);
  expect(component(editor(), DrawnPanel).props.elevationOnly).toBe(true);
  canvas.onApply(moveProfilePoint(canvas.profile, 'q4', [1, 3]));
  expect(draft().box.h).toBe(35.5);
  expect(draft().stretch).toEqual({ z: [[27.5, 35.5]] });
});

it('SH5 d anchor 5: a broken turned profile blocks Save and keeps the views', () => {
  openLeg();
  button(stack(), 'Edit profile').props.onClick();
  const canvas = component(editor(), ProfileCanvas).props;
  const front = draft().views.front;
  const broken = structuredClone(canvas.profile);
  broken.geometry.loops = [
    { id: 'L1', closed: false, segs: [broken.geometry.loops[0].segs[0]] },
    { id: 'L2', closed: false, segs: [broken.geometry.loops[0].segs[2]] },
  ];
  canvas.onApply(broken);
  const problem = "Section 2's profile must be one open line from its bottom to its top.";
  expect(button(editor(), 'Save').props).toMatchObject({ disabled: true, title: problem });
  expect(draft().views.front).toEqual(front);
});
