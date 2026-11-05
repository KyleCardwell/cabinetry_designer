import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { room, run, wall } from '../../../test/builders.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { legPreset, runLegs } from '../../model/legs.js';
import { legShape } from '../../model/__tests__/fixtures/legs.js';
import { formatProfileCoord } from '../../model/profileEditing.js';
import elevationReducer, { addRunLegs, createInitialElevationState, updateRun } from '../../store/elevationSlice.js';
import CoordInput from '../../../library/profileEditor/CoordInput.jsx';
import AddLegsRow from './AddLegsRow.jsx';
import LegRow, { LegHeightFields, LegShapeSelect } from './LegRow.jsx';
import RunLegsSection from './RunLegsSection.jsx';

vi.mock('react', async (load) => ({ ...await load(), useMemo: vi.fn(), useState: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn() }));

const LEG = legShape();
const settings = { ...DEFAULT_SETTINGS, shapes: [LEG] };
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.actions),
    ...([LegShapeSelect, LegHeightFields].includes(tree.type) ? nodes(tree.type(tree.props)) : [])] : [];
const field = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const button = (tree, text) => nodes(tree).find(({ type, props }) => type === 'button' && props.children === text);
const change = (node, value) => node.props.onChange({ target: { value } });
let state;
let dispatch;
let slots;
let cursor;
let dirty;
const currentRun = () => state.rooms[0].walls[0].runs[0];
const props = () => ({ room: state.rooms[0], wall: state.rooms[0].walls[0], run: currentRun(), settings });
// Follow React's hook order and render-time state adjustment without a browser dependency.
const render = (component, args = props()) => {
  let tree;
  do {
    cursor = 0;
    dirty = false;
    tree = component(args);
  } while (dirty);
  return tree;
};
const renderLeg = (index = 0, overrides = {}) => LegRow({ ...props(), leg: currentRun().legs[index], index,
  numbers: { byKey: new Map([[currentRun().legs[index].id, 12]]) },
  warnings: runLegs(state.rooms[0], state.rooms[0].walls[0], currentRun(), settings).warnings, ...overrides });
const addCorners = () => dispatch(addRunLegs({
  roomId: 'room-1', wallId: 'wall-1', runId: 'run-1',
  legs: legPreset('four', { shapeId: LEG.id, proud: 0.5 }, (() => { let i = 0; return () => `lg-${++i}`; })()),
}));

beforeEach(() => {
  vi.clearAllMocks();
  slots = [];
  cursor = 0;
  state = { ...createInitialElevationState(null), settings,
    rooms: [room({ walls: [wall({ runs: [run({ x: 10, width: 36 })] })] })],
    activeRoomId: 'room-1', activeWallId: 'wall-1' };
  dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
  useDispatch.mockReturnValue(dispatch);
  useMemo.mockImplementation((fn) => fn());
  useState.mockImplementation((initial) => {
    const slot = cursor++;
    if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
    return [slots[slot], (next) => {
      slots[slot] = typeof next === 'function' ? next(slots[slot]) : next;
      dirty = true;
    }];
  });
});

describe('SH7 step b Legs panel', () => {
  it('anchor 1: adds four corners with Full height and Proud 1/2, in list order, and appends further presets', () => {
    let tree = render(AddLegsRow);
    expect(field(tree, 'Add legs Shape').props.value).toBe(LEG.id);
    expect(field(tree, 'Add legs Height').props.value).toBe('full');
    field(tree, 'Add legs Proud').props.onCommit(0.5);
    tree = render(AddLegsRow);
    button(tree, 'Add').props.onClick();
    expect(currentRun().legs.map(({ from, yFrom, y }) => [from, yFrom, y])).toEqual([
      ['left', 'front', -0.5], ['left', 'back', 0], ['right', 'front', -0.5], ['right', 'back', 0],
    ]);
    expect(currentRun().legs.every(({ height }) => height === 'full')).toBe(true);
    slots = [];
    const section = render(RunLegsSection);
    expect(nodes(section).filter(({ type }) => type === LegRow).map(({ props }) => props.index)).toEqual([0, 1, 2, 3]);
    const lf = renderLeg();
    expect(formatProfileCoord(field(lf, 'Leg 1 Y').props.value)).toBe('-1/2');
    expect(button(lf, 'Front').props['aria-pressed']).toBe(true);
    expect(nodes(lf).some(({ props }) => props.children?.includes?.(' #12'))).toBe(true);
    // Use independent hook slots for the Add legs row.
    slots = [];
    tree = render(AddLegsRow);
    change(field(tree, 'Add legs Preset'), 'three');
    tree = render(AddLegsRow);
    change(field(tree, 'Add legs Leave out'), 'LB');
    field(tree, 'Add legs Back offset').props.onCommit(1);
    tree = render(AddLegsRow);
    button(tree, 'Add').props.onClick();
    expect(currentRun().legs).toHaveLength(7);
    expect(currentRun().legs.slice(4).map(({ from, yFrom, y }) => [from, yFrom, y]))
      .toEqual([['left', 'front', 0], ['right', 'front', 0], ['right', 'back', 1]]);
    expect(new Set(currentRun().legs.map(({ id }) => id)).size).toBe(7);
    for (const preset of ['front', 'left', 'right']) {
      change(field(tree, 'Add legs Preset'), preset);
      tree = render(AddLegsRow);
      expect(field(tree, 'Add legs Leave out')).toBeUndefined();
      button(tree, 'Add').props.onClick();
    }
    expect(currentRun().legs).toHaveLength(13);
  });

  it('anchors 2–3: switches X to Right 32 1/2 and Back to Front 21 3/8 without moving the leg', () => {
    addCorners();
    const placement = () => runLegs(state.rooms[0], state.rooms[0].walls[0], currentRun(), settings);
    const before = placement();
    button(renderLeg(), 'Right').props.onClick();
    expect(currentRun().legs[0]).toMatchObject({ from: 'right', x: 32.5 });
    expect(formatProfileCoord(field(renderLeg(), 'Leg 1 X').props.value)).toBe('32 1/2');
    expect(placement()[0].bounds).toEqual(before[0].bounds);
    button(renderLeg(1), 'Front').props.onClick();
    expect(currentRun().legs[1]).toMatchObject({ yFrom: 'front', y: 21.375 });
    expect(formatProfileCoord(field(renderLeg(1), 'Leg 2 Y').props.value)).toBe('21 3/8');
    expect(placement()[1].front).toBe(before[1].front);
    button(renderLeg(), 'Left').props.onClick();
    button(renderLeg(1), 'Back').props.onClick();
    expect(currentRun().legs.slice(0, 2).map(({ x, y }) => [x, y])).toEqual([[0, -0.5], [0, 0]]);
    // The same conversion uses resolved dimensions on an offset, back-side run.
    dispatch(updateRun({ wallId: 'wall-1', runId: 'run-1', changes: { wallSide: 'back', outset: 2, _plane: { offset: -1 } } }));
    const backBefore = placement();
    button(renderLeg(1), 'Front').props.onClick();
    expect(placement()[1].front).toBe(backBefore[1].front);
  });

  it('anchor 4: disables Add without live leg shapes, hides on upper runs, and retains existing upper legs', () => {
    const emptySettings = { ...settings, shapes: [{ ...LEG, archived: true }, { ...LEG, id: 'other', kind: 'other' }] };
    const tree = render(AddLegsRow, { ...props(), settings: emptySettings });
    expect(button(tree, 'Add').props.disabled).toBe(true);
    expect(nodes(tree).some(({ props }) => props.children === 'Make a leg in Library → Shapes first.')).toBe(true);
    button(tree, 'Add').props.onClick();
    expect(dispatch).not.toHaveBeenCalled();
    slots = [];
    const upper = { ...currentRun(), cabinetTypeId: CABINET_TYPE_IDS.UPPER };
    expect(render(RunLegsSection, { ...props(), run: upper, settings: emptySettings })).toBeNull();
    for (const type of [CABINET_TYPE_IDS.BASE, CABINET_TYPE_IDS.TALL]) {
      expect(render(RunLegsSection, { ...props(), run: { ...upper, cabinetTypeId: type } })).not.toBeNull();
    }
    addCorners();
    expect(render(RunLegsSection, { ...props(), run: { ...currentRun(), cabinetTypeId: CABINET_TYPE_IDS.UPPER } })).not.toBeNull();
  });

  it('sorts live shapes by name and preserves archived, other-kind, and missing current selections', () => {
    const library = { ...settings, shapes: [{ ...LEG, id: 'z', name: 'Zed' },
      { ...LEG, id: 'a', name: 'Alpha' }, { ...LEG, id: 'old', name: 'Old', archived: true },
      { ...LEG, id: 'other', name: 'Other', kind: 'other' }] };
    for (const [value, text] of [['old', 'Old (archived)'], ['other', 'Other (archived)'], ['missing', 'Missing shape (archived)']]) {
      const tree = LegShapeSelect({ settings: library, value, onChange: vi.fn(), label: 'Shape' });
      expect(nodes(tree).filter(({ type }) => type === 'option').map(({ props }) => props.value)).toEqual(['a', 'z', value]);
      expect(nodes(tree).filter(({ type }) => type === 'option').at(-1).props.children.join('')).toBe(text);
    }
    expect(field(render(AddLegsRow, { ...props(), settings: library }), 'Add legs Shape').props.value).toBe('a');
  });

  it('edits shape, custom/Full/Feet height, signed coordinates, mirror and removal; shows all row warnings', () => {
    addCorners();
    const shape = nodes(renderLeg()).find(({ type }) => type === LegShapeSelect);
    shape.props.onChange('missing');
    expect(nodes(renderLeg()).some(({ props }) => props.children === "Leg 1: its shape isn't in the library.")).toBe(true);
    expect(button(renderLeg(), 'Right').props.disabled).toBe(true);
    shape.props.onChange(LEG.id);
    let height = nodes(renderLeg()).find(({ type }) => type === LegHeightFields);
    change(field(LegHeightFields(height.props), 'Leg 1 Height'), 'custom');
    height = nodes(renderLeg()).find(({ type }) => type === LegHeightFields);
    const input = nodes(LegHeightFields(height.props)).find(({ type }) => type === CoordInput);
    expect(input.props.onCommit(0)).toBe(false);
    input.props.onCommit(30);
    expect(currentRun().legs[0].height).toBe(30);
    height.props.onChange('feet');
    expect(nodes(renderLeg()).some(({ props }) => props.children === "Leg 1 can't be 4\" tall: its fixed parts are 26 1/2\". Drawn at 34 1/2\".")).toBe(true);
    height.props.onChange('full');
    expect(currentRun().legs[0].height).toBe('full');
    expect(nodes(LegHeightFields({ ...height.props, value: 'full' })).some(({ type }) => type === CoordInput)).toBe(false);
    field(renderLeg(), 'Leg 1 X').props.onCommit(-2);
    field(renderLeg(), 'Leg 1 Y').props.onCommit(-0.75);
    expect(field(renderLeg(), 'Leg 1 X').props.onCommit(Infinity)).toBe(false);
    field(renderLeg(), 'Leg 1 Mirror left–right').props.onChange({ target: { checked: true } });
    expect(currentRun().legs[0]).toMatchObject({ x: -2, y: -0.75, mirror: true });
    field(renderLeg(), 'Leg 1 Mirror left–right').props.onChange({ target: { checked: false } });
    expect(currentRun().legs[0]).not.toHaveProperty('mirror');
    const fixed = { ...LEG, stretch: {} };
    expect(nodes(renderLeg(0, { settings: { ...settings, shapes: [fixed] },
      warnings: [{ code: 'leg-fixed-height', index: 1, legId: currentRun().legs[0].id, height: 4 }] }))
      .some(({ props }) => props.children === "Leg 1 doesn't stretch: drawn at its own height, 4\".")).toBe(true);
    expect(nodes(renderLeg(0, { warnings: [{ code: 'leg-no-height', index: 1, legId: currentRun().legs[0].id }] }))
      .some(({ props }) => props.children === 'Leg 1 has no height (the run sits on the floor).')).toBe(true);
    field(renderLeg(), 'Remove leg 1').props.onClick();
    expect(currentRun().legs).toHaveLength(3);
  });

  it('toggles both labelled mirrors independently and clears unchecked keys', () => {
    addCorners();
    expect(field(renderLeg(), 'Leg 1 Mirror left–right').props.checked).toBe(true);
    expect(field(renderLeg(), 'Leg 1 Mirror front–back').props.checked).toBe(false);
    field(renderLeg(), 'Leg 1 Mirror front–back').props.onChange({ target: { checked: true } });
    expect(currentRun().legs[0]).toMatchObject({ mirror: true, mirrorDepth: true });
    expect(field(renderLeg(), 'Leg 1 Mirror front–back').props.checked).toBe(true);
    field(renderLeg(), 'Leg 1 Mirror left–right').props.onChange({ target: { checked: false } });
    expect(currentRun().legs[0]).not.toHaveProperty('mirror');
    expect(currentRun().legs[0].mirrorDepth).toBe(true);
    field(renderLeg(), 'Leg 1 Mirror front–back').props.onChange({ target: { checked: false } });
    expect(currentRun().legs[0]).not.toHaveProperty('mirrorDepth');
    expect(field(renderLeg(), 'Leg 1 Mirror front–back').props.checked).toBe(false);
    expect(currentRun().legs[1]).toMatchObject({ mirror: true, mirrorDepth: true });
  });

  it('undoes/redoes every leg edit, preserves later run dimensions, clears redo on new edits, and resets on another run', () => {
    let tree = render(RunLegsSection);
    expect(field(tree, 'Undo legs edit').props.disabled).toBe(true);
    addCorners();
    tree = render(RunLegsSection);
    const added = currentRun().legs;
    const edit = (work) => {
      const before = currentRun().legs;
      work();
      tree = render(RunLegsSection);
      const after = currentRun().legs;
      field(tree, 'Undo legs edit').props.onClick();
      tree = render(RunLegsSection);
      expect(currentRun().legs).toEqual(before);
      field(tree, 'Redo legs edit').props.onClick();
      tree = render(RunLegsSection);
      expect(currentRun().legs).toEqual(after);
    };
    edit(() => button(renderLeg(), 'Right').props.onClick());
    edit(() => button(renderLeg(1), 'Front').props.onClick());
    edit(() => field(renderLeg(), 'Leg 1 X').props.onCommit(-1));
    edit(() => field(renderLeg(), 'Leg 1 Y').props.onCommit(-1));
    edit(() => nodes(renderLeg()).find(({ type }) => type === LegShapeSelect).props.onChange('missing'));
    edit(() => nodes(renderLeg()).find(({ type }) => type === LegHeightFields).props.onChange('feet'));
    edit(() => field(renderLeg(), 'Leg 1 Mirror left–right').props.onChange({ target: { checked: false } }));
    edit(() => field(renderLeg(), 'Leg 1 Mirror front–back').props.onChange({ target: { checked: true } }));
    edit(() => field(renderLeg(), 'Remove leg 1').props.onClick());
    dispatch(updateRun({ wallId: 'wall-1', runId: 'run-1', changes: { width: 40 } }));
    const storedX = currentRun().x;
    tree = render(RunLegsSection, { ...props(), run: { ...currentRun(), x: 999 } });
    field(tree, 'Undo legs edit').props.onClick();
    expect(currentRun().x).toBe(storedX);
    tree = render(RunLegsSection);
    while (!field(tree, 'Undo legs edit').props.disabled) {
      field(tree, 'Undo legs edit').props.onClick();
      tree = render(RunLegsSection);
    }
    expect(currentRun()).not.toHaveProperty('legs');
    expect(currentRun().width).toBe(40);
    field(tree, 'Redo legs edit').props.onClick();
    tree = render(RunLegsSection);
    expect(currentRun().legs).toEqual(added);
    field(renderLeg(), 'Leg 1 X').props.onCommit(2);
    tree = render(RunLegsSection);
    expect(field(tree, 'Redo legs edit').props.disabled).toBe(true);
    tree = render(RunLegsSection, { ...props(), run: { ...currentRun(), id: 'different' } });
    expect(field(tree, 'Undo legs edit').props.disabled).toBe(true);
  });
});
