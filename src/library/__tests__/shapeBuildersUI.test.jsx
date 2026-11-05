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

it('SH5.1 c anchor 2: a bottom detail at 4 has beads on both faces, end lines and hidden bases', () => {
  create('New leg / column');
  button(stack(), 'Add tapered').props.onClick();
  field(stack(), 'Add detail to section 2').props.onClick();
  expect(draft().builder.sections[1].details[0].at).toBe(5.75);
  field(stack(), 'Section 2 detail 1 from').props.onChange({ target: { value: 'bottom' } });
  field(stack(), 'Section 2 detail 1 at').props.onCommit(4);
  const front = draft().views.front;
  const outline = front.loops.find((l) => l.id === 's2');
  expect(outline.segs.filter((s) => s.type === 'arc').map((s) => [front.points[s.from][1], front.points[s.to][1]]))
    .toEqual([[4, 4.5], [4.5, 4]]);
  const lines = front.loops.filter((l) => !l.closed);
  expect(lines.map((l) => [front.points[l.segs[0].from][1], front.points[l.segs[0].to][1]]))
    .toEqual([[4, 4], [4.5, 4.5]]);
  for (const view of ['front', 'side']) {
    selectView(view);
    const canvas = component(editor(), ProfileCanvas).props;
    const hidden = stackHiddenBase(draft(), view);
    expect(hidden.loops).toHaveLength(2);
    expect(canvas.ghost.loops).toEqual(expect.arrayContaining(hidden.loops));
    expect(canvas.ghost.points).toMatchObject(hidden.points);
    expect(canvas.ghostDashed).toBe(true);
  }
  selectView('plan');
  expect(component(editor(), ProfileCanvas).props.ghost.loops).toHaveLength(1); // size box only
});

it('SH5.1 c anchor 3: editing b2 to 0,0.75 grows the detail, with tools, surface guide and undo/redo', () => {
  create('New leg / column');
  button(stack(), 'Add tapered').props.onClick();
  field(stack(), 'Add detail to section 2').props.onClick();
  field(stack(), 'Section 2 detail 1 at').props.onCommit(4);
  button(stack(), 'Edit detail').props.onClick();
  const canvas = component(editor(), ProfileCanvas).props;
  expect(text(editor())).toContain('Section 2 · detail 1');
  expect(text(editor())).toContain("x = out from the leg's surface (− cuts in), y = height");
  expect(Object.values(canvas.ghost.points).every(([x]) => x === 0)).toBe(true);
  for (const tool of ['Line (L)', 'Rectangle (R)', 'Circle (C)']) expect(button(editor(), tool).props.disabled).toBe(false);
  expect(component(editor(), ViewTabs).props.view).toBe(null);
  const drawn = render(DrawnPanel, component(editor(), DrawnPanel).props);
  expect(field(drawn, 'b2 drawn in plan')).toBeUndefined();
  canvas.onApply(moveProfilePoint(canvas.profile, 'b2', [0, 0.75]));
  expect(text(stack()).replace(/\s+/g, ' ')).toContain('Detail 1 · Height 3/4');
  expect(draft().views.front.points.s2r2[1]).toBe(4.75);
  button(editor(), 'Undo').props.onClick();
  expect(text(stack()).replace(/\s+/g, ' ')).toContain('Detail 1 · Height 1/2');
  button(editor(), 'Redo').props.onClick();
  expect(text(stack()).replace(/\s+/g, ' ')).toContain('Detail 1 · Height 3/4');
  button(editor(), 'Back to views').props.onClick();
  expect(component(editor(), ViewTabs).props.view).toBe('front');
  expect(button(editor(), 'Line (L)').props.disabled).toBe(true);
  button(stack(), 'Edit detail').props.onClick();
  selectView('side');
  expect(component(editor(), ViewTabs).props.view).toBe('side');
  expect(button(editor(), 'Back to views')).toBeUndefined();
});

it('SH5.1 c anchor 4: detail at 20 on a 12 inch section blocks Save and preserves made views', () => {
  create('New leg / column');
  button(stack(), 'Add tapered').props.onClick();
  field(stack(), 'Add detail to section 2').props.onClick();
  const views = draft().views;
  field(stack(), 'Section 2 detail 1 at').props.onCommit(20);
  const problem = "Section 2, detail 1 doesn't fit in its section.";
  expect(text(builderPanel())).toContain(problem);
  expect(button(editor(), 'Save').props).toMatchObject({ disabled: true, title: problem });
  expect(draft().views).toEqual(views);
  button(editor(), 'Undo').props.onClick();
  expect(button(editor(), 'Save').props.disabled).toBe(false);
});

it('SH5.1 c anchor 5: square and tapered rows offer Stretches; turned rows do not; None clears it', () => {
  create('New leg / column');
  button(stack(), 'Add tapered').props.onClick();
  button(stack(), 'Add turned').props.onClick();
  const radios = () => nodes(stack()).filter((n) => n.type === 'input' && n.props.type === 'radio');
  expect(radios()).toHaveLength(3);
  radios()[1].props.onChange();
  expect(draft().builder.stretch).toBe(1);
  expect(draft().stretch).toEqual({ z: [[2, 14]] });
  radios()[2].props.onChange();
  expect(draft().builder.stretch).toBeUndefined();
  expect(draft().stretch).toEqual({});
});

it('SH5.1 c: detail order, anchoring and removal are undoable; every section type supports details', () => {
  create('New leg / column');
  button(stack(), 'Add tapered').props.onClick();
  button(stack(), 'Add turned').props.onClick();
  for (const n of [1, 2, 3]) field(stack(), `Add detail to section ${n}`).props.onClick();
  field(stack(), 'Section 2 detail 1 at').props.onCommit(1);
  field(stack(), 'Add detail to section 2').props.onClick();
  field(stack(), 'Section 2 detail 2 from').props.onChange({ target: { value: 'top' } });
  field(stack(), 'Section 2 detail 2 at').props.onCommit(2);
  const details = structuredClone(draft().builder.sections[1].details);
  const views = draft().views;
  field(stack(), 'Move section 2 detail 2 up').props.onClick();
  expect(draft().builder.sections[1].details).toEqual([details[1], details[0]]);
  expect(draft().views).toEqual(views);
  field(stack(), 'Move section 2 detail 1 down').props.onClick();
  expect(draft().builder.sections[1].details).toEqual(details);
  button(stack(), 'Edit detail').props.onClick();
  field(stack(), 'Remove section 1 detail 1').props.onClick();
  expect(button(editor(), 'Back to views')).toBeUndefined();
  expect(draft().builder.sections[0].details).toEqual([]);
  button(editor(), 'Undo').props.onClick();
  expect(draft().builder.sections[0].details).toHaveLength(1);
  for (let i = 2; i < 8; i += 1) field(stack(), 'Add detail to section 2').props.onClick();
  expect(field(stack(), 'Add detail to section 2').props.disabled).toBe(true);
  const locked = render(StackFields, { ...component(builderPanel(), StackFields).props, readOnly: true });
  expect(field(locked, 'Section 2 top').props.disabled).toBe(true);
  expect(field(locked, 'Section 2 detail 1 at').props.disabled).toBe(true);
  expect(field(locked, 'Remove section 2 detail 1').props.disabled).toBe(true);
});

it('SH5.1 c: detail profile errors block Save; copying a turned profile retains its details', () => {
  create('New leg / column');
  button(stack(), 'Add turned').props.onClick();
  field(stack(), 'Add detail to section 2').props.onClick();
  button(stack(), 'Edit detail').props.onClick();
  const canvas = component(editor(), ProfileCanvas).props;
  const views = draft().views;
  canvas.onApply(moveProfilePoint(canvas.profile, 'b2', [0.25, 0.5]));
  expect(button(editor(), 'Save').props.title).toBe('Section 2, detail 1 must be one open line from its bottom to its top, with both ends at 0.');
  expect(draft().views).toEqual(views);
  button(editor(), 'Undo').props.onClick();
  const before = structuredClone(draft().builder.sections[1].details);
  const profile = { id: 'bead', name: 'Bead', geometry: BEAD, drawnPoints: { elevation: ['q2'] } };
  elevation = { ...elevation, settings: { ...elevation.settings, sectionProfiles: [profile] } };
  pick(stack(), 'bead');
  expect(draft().builder.sections[1].details).toEqual(before);
  expect(draft().builder.sections[1].profile).toEqual(BEAD);
});

it('SH5.1 c: hidden bases render dimmed and dashed below the made outline without catching clicks', () => {
  create('New leg / column');
  field(stack(), 'Add detail to section 1').props.onClick();
  const props = component(editor(), ProfileCanvas).props;
  // Supply a fitted viewport, as the browser layout effect normally would.
  slots.set(ProfileCanvas.render, [{ width: 800, height: 600 }, { cx: 0, cy: 17, scale: 15 }]);
  const tree = render(ProfileCanvas.render, props);
  const paths = nodes(tree).filter((n) => n.type === 'path');
  const ghosts = paths.filter((n) => n.props.strokeDasharray === '4 3');
  expect(ghosts).toHaveLength(3); // box and the two hidden base pieces
  expect(ghosts.every((n) => n.props.strokeOpacity === 0.4)).toBe(true);
  const group = nodes(tree).find((n) => n.type === 'g' && n.props.children?.includes?.(ghosts[0]));
  expect(group.props.pointerEvents).toBe('none');
  expect(paths.indexOf(ghosts.at(-1))).toBeLessThan(paths.findIndex((n) => n.props.stroke === '#e5e7eb'));
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

it('SH5.1 f anchor 1: ticking S makes a read-only mirrored Side and tags its saved list row', () => {
  openS();
  tickMirror(true);
  expect(field(editor(), 'Side = mirrored Front').props.checked).toBe(true);
  const canvas = component(editor(), ProfileCanvas).props;
  expect(canvas.profile.geometry.points).toEqual({
    a: [1, 0], b: [-2, 0], c: [-2, 10], d: [-2, 12], e: [-2, 30], f: [1, 30],
  });
  expect(canvas.profile.geometry.loops[0].segs[2]).toMatchObject({ center: [-2, 11], ccw: false });
  expect(text(editor())).toContain('Made from the Front view, mirrored.');
  expect(button(editor(), 'Line (L)').props.disabled).toBe(true);
  expect(button(editor(), 'Draw this view')).toBeUndefined();
  expect(button(editor(), 'Remove view')).toBeUndefined();
  expect(component(editor(), BuilderPanel)).toBeUndefined();
  expect(canvas.onApply(canvas.profile)).toBe(false);
  expect(field(zones(), 'y zone 1 From').props.disabled).toBe(true);
  expect(field(zones(), 'Add y zone').props.disabled).toBe(true);
  expect(field(zones(), 'z zone 1 From').props.disabled).toBe(false);
  expect(field(origin(), 'Set 0,0 at Y').props.disabled).toBe(true);
  expect(field(origin(), 'Set 0,0 at Z').props.disabled).toBe(false);
  expect(button(editor(), 'Flip front–back')).toBeUndefined();
  save();
  expect(text(render(ShapesPage))).toContain('Leg / column · Side mirrored');
});

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

it('SH5.1 f anchor 3: unticking and saving preserves Side and restores editing and removes the tag', () => {
  openS();
  tickMirror(true);
  save();
  const side = structuredClone(draft().views.side);
  tickMirror(false);
  expect(draft().builder).toBeUndefined();
  expect(draft().views.side).toEqual(side);
  expect(button(editor(), 'Line (L)').props.disabled).toBe(false);
  expect(button(editor(), 'Remove view')).toBeTruthy();
  expect(text(editor())).not.toContain('Made from the Front view, mirrored.');
  expect(field(sizeBox(), 'D').props.disabled).toBe(false);
  expect(field(zones(), 'y zone 1 From').props.disabled).toBe(false);
  const canvas = component(editor(), ProfileCanvas).props;
  canvas.onApply(moveProfilePoint(canvas.profile, 'b', [-2.5, 0]));
  expect(draft().views.side.points.b).toEqual([-2.5, 0]);
  save();
  expect(elevation.settings.shapes[0].builder).toBeUndefined();
  expect(elevation.settings.shapes[0].views.side.points.b).toEqual([-2.5, 0]);
  expect(text(render(ShapesPage))).not.toContain('Side mirrored');
});

it('SH5.1 f: replacing an existing Side confirms, can cancel, and respects shop read-only access', () => {
  dispatch(addShape({ shape: { ...structuredClone(S), views: { ...structuredClone(S.views), side: structuredClone(S.views.front) } } }));
  selectView('side');
  const before = structuredClone(draft());
  tickMirror(true);
  expect(draft()).toEqual(before);
  expect(text(editor())).toContain('Replace the Side view with the mirrored Front?');
  button(editor(), 'Cancel').props.onClick();
  expect(text(editor())).not.toContain('Replace the Side view with the mirrored Front?');
  expect(draft()).toEqual(before);
  tickMirror(true);
  button(editor(), 'Replace Side view').props.onClick();
  expect(draft().views.side.points.b).toEqual([-2, 0]);
  button(editor(), 'Undo').props.onClick();
  expect(draft()).toEqual(before);
  elevation = { ...elevation, source: 'cloud', cloud: { ...elevation.cloud, permissions: { manage: false } } };
  expect(field(editor(), 'Side = mirrored Front').props.disabled).toBe(true);
  tickMirror(true);
  expect(draft()).toEqual(before);
  expect(text(editor())).not.toContain('Replace the Side view with the mirrored Front?');
});
