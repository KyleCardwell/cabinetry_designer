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
import SegmentPanel from '../profileEditor/SegmentPanel.jsx';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useReducer: vi.fn(),
  useEffect: vi.fn(), useRef: (current) => ({ current }), useCallback: (callback) => callback }));
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
  expect(pointsProps.showOrigin).toBe(false);
  expect(button(render(PointsPanel, pointsProps), 'Origin')).toBeUndefined();
  expect(button(render(PointsPanel, { ...pointsProps, showOrigin: undefined }), 'Origin')).toBeDefined();
  canvas = component(editor(), ProfileCanvas);
  expect(canvas.props.ghost).toBeUndefined();
  expect(text(editor())).not.toMatch(/Rotate|Flip|Drawn points/);
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
  expect(text(editor())).toContain('is outside the size box.');
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
