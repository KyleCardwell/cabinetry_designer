import { beforeEach, expect, it, vi } from 'vitest';
import { useReducer, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { createInitialElevationState } from '../../../elevation/store/elevationSlice.js';
import { newSectionProfile } from '../../../elevation/model/sectionProfiles.js';
import { useShopReadOnly } from '../../WorkspaceSourceBar.jsx';
import ProfileEditor from '../ProfileEditor.jsx';
import ShapeEditor from '../../shapeEditor/ShapeEditor.jsx';
import ProfileCanvas from '../ProfileCanvas.jsx';
import CoordInput from '../CoordInput.jsx';
import MovePanel from '../MovePanel.jsx';
import OriginPanel from '../../shapeEditor/OriginPanel.jsx';
import ViewTabs from '../../shapeEditor/ViewTabs.jsx';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useReducer: vi.fn(),
  useEffect: vi.fn(), useRef: vi.fn(), useCallback: (callback) => callback }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('../../WorkspaceSourceBar.jsx', () => ({ useShopReadOnly: vi.fn() }));

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
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children)
    : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
const component = (tree, type) => nodes(tree).find((node) => node.type === type);
const button = (tree, label) => nodes(tree).find((node) => node.type === 'button' && text(node) === label);
let elevation;
let slots;
let histories;
let refs;

function render(Component, props = {}, key = Component) {
  const state = slots.get(key) ?? [];
  slots.set(key, state);
  const refState = refs.get(key) ?? [];
  refs.set(key, refState);
  let index = 0;
  let refIndex = 0;
  useRef.mockImplementation((initial) => refState[refIndex++] ??= { current: initial });
  useState.mockImplementation((initial) => {
    const slot = index++;
    if (!(slot in state)) state[slot] = typeof initial === 'function' ? initial() : initial;
    return [state[slot], (next) => { state[slot] = typeof next === 'function' ? next(state[slot]) : next; }];
  });
  useReducer.mockImplementation((reducer, initial, init) => {
    if (!histories.has(key)) histories.set(key, init(initial));
    return [histories.get(key), (action) => histories.set(key, reducer(histories.get(key), action))];
  });
  return Component(props);
}
const shapeEditor = () => render(ShapeEditor, { shapeId: 'rod', onClose: vi.fn() });
const profileEditor = () => render(ProfileEditor, { profileId: 'profile', backLabel: 'Back', onClose: vi.fn() });
const panel = (editor, type) => {
  const entry = component(editor(), type);
  return render(type, entry.props, `${type.name}:${entry.key}`);
};
const shapeMove = () => panel(shapeEditor, MovePanel);
const profileMove = () => panel(profileEditor, MovePanel);
const origin = () => panel(shapeEditor, OriginPanel);
const draft = () => histories.get(ShapeEditor).draft;
function typeCoord(panelTree, label, value) {
  const field = nodes(panelTree).find((node) => node.type === CoordInput && node.props['aria-label'] === label);
  const input = () => render(CoordInput, field.props, label);
  input().props.onChange({ target: { value } });
  input().props.onBlur();
}
const pick = (editor, selection) => component(editor(), ProfileCanvas).props.onSelect(selection);
const middle = () => nodes(origin()).find((node) => node.props?.title === "0,0 at the box's middle middle");

beforeEach(() => {
  vi.clearAllMocks();
  slots = new Map();
  histories = new Map();
  refs = new Map();
  elevation = createInitialElevationState(null);
  elevation.settings.shapes = [structuredClone({ ...ROD, stretch: { x: [[3, 27]] } })];
  elevation.settings.sectionProfiles = [{ ...newSectionProfile([], 'profile'), geometry: structuredClone(ROD.views.front) }];
  useDispatch.mockReturnValue(vi.fn());
  useSelector.mockImplementation((selector) => selector({ elevation }));
  useShopReadOnly.mockReturnValue(false);
});

it('anchor 1: moves the four left bracket corners by fractional X through the shape adapter, in one undo entry', () => {
  pick(shapeEditor, { kind: 'points', ids: ['a', 'b', 'c', 'd'] });
  expect(text(shapeMove())).toContain('Move selected (4 points)');
  expect(nodes(shapeMove()).filter((node) => node.type === CoordInput).map((node) => node.props['aria-label']))
    .toEqual(['Move selected X', 'Move selected Z']);
  typeCoord(shapeMove(), 'Move selected X', '1/2');
  typeCoord(shapeMove(), 'Move selected Z', '0');
  button(shapeMove(), 'Move').props.onClick();
  expect(draft().views.front.points).toEqual({ ...ROD.views.front.points, a: [0.5, 0], b: [3.5, 0], c: [3.5, 3], d: [0.5, 3] });
  expect(draft().box).toEqual(ROD.box);
  expect(Object.keys(draft().views)).toEqual(['front']);
  expect(histories.get(ShapeEditor).past).toHaveLength(1);
  button(shapeEditor(), 'Undo').props.onClick();
  expect(draft().views.front).toEqual(ROD.views.front);
});

it('anchor 2: middle-middle moves the rod centre to zero, with that spot current and the full shape transformed', () => {
  expect(middle().props['aria-pressed']).toBe(false);
  middle().props.onClick();
  expect(draft().box).toEqual({ x: -15, y: 0, z: -1.5, w: 30, h: 3, d: 2 });
  expect(draft().stretch.x).toEqual([[-12, 12]]);
  expect(draft().views.front.loops[2].segs.map((seg) => seg.center)).toEqual([[-13.5, 0], [-13.5, 0]]);
  expect(draft().views.front.points).toMatchObject({ hl: [-14.125, 0], hr: [-12.875, 0],
    r1: [-12, 0.53125], r2: [12, 0.53125], r3: [-12, -0.53125], r4: [12, -0.53125] });
  expect(middle().props['aria-pressed']).toBe(true);
  expect(middle().props.className).toContain('bg-blue-600');
  middle().props.onClick();
  expect(histories.get(ShapeEditor).past).toHaveLength(1);
});

it('anchor 3: typed X 15, Z 1 1/2 gives the same origin and the undrawn Plan starts at x -15', () => {
  typeCoord(origin(), 'Set 0,0 at X', '15');
  typeCoord(origin(), 'Set 0,0 at Z', '1 1/2');
  button(origin(), 'Set').props.onClick();
  expect(draft().box).toEqual({ x: -15, y: 0, z: -1.5, w: 30, h: 3, d: 2 });
  expect(draft().stretch.x).toEqual([[-12, 12]]);
  expect(draft().views.front.points.r1).toEqual([-12, 0.53125]);
  expect(middle().props['aria-pressed']).toBe(true);
  component(shapeEditor(), ViewTabs).props.onChange('plan');
  const tree = shapeEditor();
  expect(component(tree, ProfileCanvas).props.profile.geometry.points.b1).toEqual([-15, 0]);
  expect(draft().views.plan).toBeUndefined();
  expect(text(tree)).toContain('No plan view yet');
  expect(nodes(origin()).filter((node) => node.type === CoordInput).map((node) => node.props['aria-label']))
    .toEqual(['Set 0,0 at X', 'Set 0,0 at Y']);
});

it('anchor 4: neither editor header shows v1 or v2 and internal versions are retained', () => {
  for (const version of [1, 2]) {
    elevation.settings.shapes[0].version = version;
    elevation.settings.sectionProfiles[0].version = version;
    for (const editor of [shapeEditor, profileEditor]) {
      const header = component(editor(), 'header');
      expect(text(header)).not.toMatch(/v[12]/);
    }
    expect(elevation.settings.shapes[0].version).toBe(version);
    expect(elevation.settings.sectionProfiles[0].version).toBe(version);
  }
});

it('supports a single profile point, skips zero moves, and hides the panel for segment or empty selection', () => {
  expect(profileMove()).toBeNull();
  pick(profileEditor, { kind: 'segment', loopId: 'left', index: 0 });
  expect(profileMove()).toBeNull();
  pick(profileEditor, { kind: 'point', id: 'a' });
  expect(text(profileMove())).toContain('Move selected (1 points)');
  button(profileMove(), 'Move').props.onClick();
  expect(histories.get(ProfileEditor).past).toHaveLength(0);
  typeCoord(profileMove(), 'Move selected Y', '-1/2');
  button(profileMove(), 'Move').props.onClick();
  expect(histories.get(ProfileEditor).draft.geometry.points.a).toEqual([0, -0.5]);
  expect(histories.get(ProfileEditor).past).toHaveLength(1);
});

it('reports an impossible arc move without applying it or adding undo history', () => {
  pick(shapeEditor, { kind: 'point', id: 'hl' });
  typeCoord(shapeMove(), 'Move selected X', '1 1/4');
  button(shapeMove(), 'Move').props.onClick();
  expect(draft().views.front).toEqual(ROD.views.front);
  expect(histories.get(ShapeEditor).past).toHaveLength(0);
  expect(text(shapeEditor())).toContain('That move would make an arc impossible.');
});

it('uses side Y/Z axes and disables all panel controls in a read-only workspace', () => {
  component(shapeEditor(), ViewTabs).props.onChange('side');
  expect(nodes(origin()).filter((node) => node.type === CoordInput).map((node) => node.props['aria-label']))
    .toEqual(['Set 0,0 at Y', 'Set 0,0 at Z']);
  expect(nodes(origin()).filter((node) => node.type === 'button' && node.props.title)).toHaveLength(9);
  component(shapeEditor(), ViewTabs).props.onChange('front');
  pick(shapeEditor, { kind: 'point', id: 'a' });
  typeCoord(shapeMove(), 'Move selected X', '1/2');
  typeCoord(origin(), 'Set 0,0 at X', '15');
  useShopReadOnly.mockReturnValue(true);
  for (const tree of [origin(), shapeMove()]) {
    expect(nodes(tree).filter((node) => node.type === 'button' || node.type === CoordInput)
      .every((node) => node.props.disabled)).toBe(true);
  }
  button(origin(), 'Set').props.onClick();
  middle().props.onClick();
  button(shapeMove(), 'Move').props.onClick();
  expect(histories.get(ShapeEditor).past).toHaveLength(0);
});
