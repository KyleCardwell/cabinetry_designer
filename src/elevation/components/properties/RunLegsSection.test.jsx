import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { room, run, wall } from '../../../test/builders.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { legPreset, runLegs } from '../../model/legs.js';
import { E, fourEndLegs, legShape, noEnds } from '../../model/__tests__/fixtures/legs.js';
import { formatProfileCoord } from '../../model/profileEditing.js';
import elevationReducer, { addRunLegs, createInitialElevationState, setRunEnd, updateRun } from '../../store/elevationSlice.js';
import CoordInput from '../../../library/profileEditor/CoordInput.jsx';
import AddLegsRow from './AddLegsRow.jsx';
import LegRow, { LegHeightFields, LegShapeSelect, LegSitsOnSelect } from './LegRow.jsx';
import RunLegsSection from './RunLegsSection.jsx';
import LegFields, { LegPanelFields } from './LegFields.jsx';

vi.mock('react', async (load) => ({ ...await load(), useMemo: vi.fn(), useState: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn() }));

const LEG = legShape();
const settings = { ...DEFAULT_SETTINGS, shapes: [LEG] };
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.actions),
    ...([LegFields, LegPanelFields, LegShapeSelect, LegHeightFields, LegSitsOnSelect].includes(tree.type) ? nodes(tree.type(tree.props)) : [])] : [];
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
  placement: runLegs(state.rooms[0], state.rooms[0].walls[0], currentRun(), settings).find(({ leg }) => leg.id === currentRun().legs[index].id),
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
  it('sets the corner ends with Proud and Back offset, replacing the named ends on further presets', () => {
    let tree = render(AddLegsRow);
    expect(field(tree, 'Add legs Shape').props.value).toBe(LEG.id);
    expect(field(tree, 'Add legs Height').props.value).toBe('full');
    field(tree, 'Add legs Proud').props.onCommit(0.5);
    tree = render(AddLegsRow);
    button(tree, 'Apply').props.onClick();
    expect(currentRun().endLegs).toEqual(fourEndLegs);
    expect(currentRun()).not.toHaveProperty('legs');
    change(field(tree, 'Add legs Preset'), 'three');
    tree = render(AddLegsRow);
    change(field(tree, 'Add legs Leave out'), 'LB');
    field(tree, 'Add legs Back offset').props.onCommit(1);
    tree = render(AddLegsRow);
    button(tree, 'Apply').props.onClick();
    expect(currentRun().endLegs).toEqual({
      left: { legs: 'front', front: E.front }, right: { ...E, back: { ...E.back, y: 1 } },
    });
    for (const preset of ['front', 'left', 'right']) {
      change(field(tree, 'Add legs Preset'), preset);
      tree = render(AddLegsRow);
      expect(field(tree, 'Add legs Leave out')).toBeUndefined();
      const before = currentRun().endLegs;
      button(tree, 'Apply').props.onClick();
      for (const side of ['left', 'right']) {
        if (preset === 'front') expect(currentRun().endLegs[side]).toEqual({ legs: 'front', front: E.front });
        else if (preset === side) expect(currentRun().endLegs[side]).toEqual({ ...E, back: { ...E.back, y: 1 } });
        else expect(currentRun().endLegs[side]).toEqual(before[side]);
      }
      expect(currentRun()).not.toHaveProperty('legs');
    }
  });

  it('anchors 2–3: switches X to Right -32 1/2 and Back to Front -21 3/8 without moving the leg', () => {
    addCorners();
    const placement = () => runLegs(state.rooms[0], state.rooms[0].walls[0], currentRun(), settings);
    const before = placement();
    button(renderLeg(), 'Right').props.onClick();
    expect(currentRun().legs[0]).toMatchObject({ from: 'right', x: -32.5 });
    expect(formatProfileCoord(field(renderLeg(), 'Leg 1 Along').props.value)).toBe('-32 1/2');
    expect(placement()[0].bounds).toEqual(before[0].bounds);
    button(renderLeg(1), 'Front').props.onClick();
    expect(currentRun().legs[1]).toMatchObject({ yFrom: 'front', y: -21.375 });
    expect(formatProfileCoord(field(renderLeg(1), 'Leg 2 In/out').props.value)).toBe('-21 3/8');
    expect(placement()[1].front).toBe(before[1].front);
    button(renderLeg(), 'Left').props.onClick();
    button(renderLeg(1), 'Back').props.onClick();
    expect(currentRun().legs.slice(0, 2).map(({ x, y }) => [x, y])).toEqual([[0, 0.5], [0, 0]]);
    // The same conversion uses resolved dimensions on an offset, back-side run.
    dispatch(updateRun({ wallId: 'wall-1', runId: 'run-1', changes: { wallSide: 'back', outset: 2, _plane: { offset: -1 } } }));
    const backBefore = placement();
    button(renderLeg(1), 'Front').props.onClick();
    expect(placement()[1].front).toBe(backBefore[1].front);
  });

  it('SH7.1 anchor 4: shows Legs on empty base, tall and upper runs', () => {
    const upper = { ...currentRun(), cabinetTypeId: CABINET_TYPE_IDS.UPPER };
    for (const type of [CABINET_TYPE_IDS.BASE, CABINET_TYPE_IDS.TALL, CABINET_TYPE_IDS.UPPER]) {
      expect(render(RunLegsSection, { ...props(), run: { ...upper, cabinetTypeId: type } })).not.toBeNull();
    }
    expect(render(RunLegsSection, { ...props(), run: { ...upper, cabinetTypeId: 'other' } })).toBeNull();
    addCorners();
    expect(render(RunLegsSection, { ...props(), run: { ...currentRun(), cabinetTypeId: 'other' } })).not.toBeNull();
  });

  it('sorts live shapes by name and preserves archived, other-kind, and missing current selections', () => {
    const library = { ...settings, shapes: [{ ...LEG, id: 'z', name: 'Zed' },
      { ...LEG, id: 'a', name: 'Alpha' }, { ...LEG, id: 'old', name: 'Old', archived: true },
      { ...LEG, id: 'other', name: 'Other', kind: 'other' }] };
    for (const [value, text] of [['old', 'Old (archived)'], ['other', 'Other (archived)'], ['missing', 'Missing shape (archived)']]) {
      const tree = LegShapeSelect({ settings: library, value, onChange: vi.fn(), label: 'Shape' });
      expect(nodes(tree).filter(({ type }) => type === 'option').map(({ props }) => props.value)).toEqual(['', 'a', 'z', value]);
      expect(nodes(tree).filter(({ type }) => type === 'option').at(-1).props.children.join('')).toBe(text);
    }
    expect(field(render(AddLegsRow, { ...props(), settings: library }), 'Add legs Shape').props.value).toBe('a');
  });

  it('edits shape, custom/Full/Feet height, signed coordinates, mirror and removal; shows all row warnings', () => {
    addCorners();
    const shape = nodes(renderLeg()).find(({ type }) => type === LegShapeSelect);
    shape.props.onChange({ shapeId: 'missing' });
    expect(nodes(renderLeg()).some(({ props }) => props.children === "Leg 1: its shape isn't in the library.")).toBe(true);
    expect(button(renderLeg(), 'Right').props.disabled).toBe(true);
    shape.props.onChange({ shapeId: LEG.id });
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
    field(renderLeg(), 'Leg 1 Along').props.onCommit(-2);
    field(renderLeg(), 'Leg 1 In/out').props.onCommit(-0.75);
    expect(field(renderLeg(), 'Leg 1 Along').props.onCommit(Infinity)).toBe(false);
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
    edit(() => field(renderLeg(), 'Leg 1 Along').props.onCommit(-1));
    edit(() => field(renderLeg(), 'Leg 1 In/out').props.onCommit(-1));
    edit(() => change(field(renderLeg(), 'Leg 1 Shape'), ''));
    edit(() => field(renderLeg(), 'Leg 1 Width').props.onCommit(2.5));
    edit(() => field(renderLeg(), 'Leg 1 Depth').props.onCommit(4));
    edit(() => field(renderLeg(), 'Leg 1 Width').props.onCommit(undefined));
    edit(() => field(renderLeg(), 'Leg 1 Depth').props.onCommit(undefined));
    edit(() => change(field(renderLeg(), 'Leg 1 Shape'), 'missing'));
    edit(() => nodes(renderLeg()).find(({ type }) => type === LegHeightFields).props.onChange('feet'));
    edit(() => field(renderLeg(), 'Leg 1 Mirror left–right').props.onChange({ target: { checked: false } }));
    edit(() => field(renderLeg(), 'Leg 1 Mirror front–back').props.onChange({ target: { checked: true } }));
    edit(() => field(renderLeg(), 'Leg 1 Takes room').props.onChange({ target: { checked: false } }));
    edit(() => field(renderLeg(), 'Leg 1 Takes room').props.onChange({ target: { checked: true } }));
    edit(() => change(field(renderLeg(), 'Leg 1 Sits on'), 'base'));
    edit(() => change(field(renderLeg(), 'Leg 1 Sits on'), 'countertop'));
    edit(() => change(field(renderLeg(), 'Leg 1 Sits on'), ''));
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
    field(renderLeg(), 'Leg 1 Along').props.onCommit(2);
    tree = render(RunLegsSection);
    expect(field(tree, 'Redo legs edit').props.disabled).toBe(true);
    tree = render(RunLegsSection, { ...props(), run: { ...currentRun(), id: 'different' } });
    expect(field(tree, 'Undo legs edit').props.disabled).toBe(true);
  });
});

describe('SH7.5 step b fill fixtures', () => {
  it.each([0, 1])('anchor 3: hand leg %s has no Fill select or panel inputs', (index) => {
    addCorners();
    const tree = renderLeg(index);
    for (const name of ['Fill', 'Reveal', 'Top clearance', 'Bottom clearance', 'Returns', 'Return depth', 'Full depth']) {
      expect(field(tree, `Leg ${index + 1} ${name}`)).toBeUndefined();
    }
    expect(nodes(tree).some(({ type }) => type === LegPanelFields)).toBe(false);
  });

  it('fits corner presets at the ends and clears Fit with Nothing', () => {
    let tree = render(AddLegsRow);
    for (const [value, fit] of [['panel', 'between'], ['filler', 'behind'], ['', undefined]]) {
      change(field(tree, 'Add legs Fit'), value);
      tree = render(AddLegsRow);
      button(tree, 'Apply').props.onClick();
      for (const end of Object.values(currentRun().endLegs)) {
        expect(end.fit).toBe(fit);
        expect(end.front).not.toHaveProperty('fill');
        expect(end.back).not.toHaveProperty('fill');
      }
      expect(currentRun()).not.toHaveProperty('legs');
    }
  });

  it('keeps hand-leg rows and warnings independent of derived end fills', () => {
    addCorners();
    const source = currentRun();
    state = { ...state, rooms: [room({ walls: [wall({ runs: [{ ...source, ends: noEnds,
      endLegs: { ...fourEndLegs, left: { ...E, fit: 'between', panel: { top: 40 } } },
    }] })] })] };
    const rows = nodes(render(RunLegsSection)).filter(({ type }) => type === LegRow);
    expect(rows.map(({ props }) => props.leg.id)).toEqual(source.legs.map(({ id }) => id));
    expect(rows.map(({ props }) => props.placement.index)).toEqual([1, 2, 3, 4]);
    expect(nodes(renderLeg()).some(({ props }) => props.children === 'Left front leg: its panel has no height.')).toBe(false);
  });
});

describe('SH7.4 step b square legs panel', () => {
  it('anchor 1: switches a library leg to Square and stores Width 2.5 without shapeId', () => {
    addCorners();
    expect(field(renderLeg(), 'Leg 1 Width')).toBeUndefined();
    expect(nodes(field(renderLeg(), 'Leg 1 Shape')).filter(({ type }) => type === 'option')
      .map(({ props }) => [props.value, props.children])).toEqual([['', 'Square'], [LEG.id, LEG.name]]);
    change(field(renderLeg(), 'Leg 1 Shape'), '');
    expect(currentRun().legs[0].square).toEqual({});
    expect(currentRun().legs[0]).not.toHaveProperty('shapeId');
    for (const [label, setting] of [['Width', 'squareLegWidth'], ['Depth', 'squareLegDepth']]) {
      const input = field(renderLeg(), `Leg 1 ${label}`);
      expect(input.type).toBe(CoordInput);
      expect(input.props.allowBlank).toBe(true);
      expect(input.props.value).toBeUndefined();
      expect(input.props.placeholder).toBe(formatProfileCoord(settings[setting]));
    }
    expect(field(renderLeg(0, { settings: { ...settings, squareLegWidth: 4, squareLegDepth: 5 } }), 'Leg 1 Width')
      .props.placeholder).toBe('4');
    expect(field(renderLeg(0, { settings: { ...settings, squareLegDepth: 5 } }), 'Leg 1 Depth')
      .props.placeholder).toBe('5');
    field(renderLeg(), 'Leg 1 Width').props.onCommit(2.5);
    expect(currentRun().legs[0].square).toEqual({ w: 2.5 });
    expect(field(renderLeg(), 'Leg 1 Width').props.value).toBe(2.5);
    expect(currentRun().legs[0]).not.toHaveProperty('shapeId');
    // Reference changes must use the square leg's resolved width and depth.
    field(renderLeg(), 'Leg 1 Depth').props.onCommit(4);
    const bounds = runLegs(state.rooms[0], state.rooms[0].walls[0], currentRun(), settings)[0].bounds;
    button(renderLeg(), 'Right').props.onClick();
    button(renderLeg(), 'Back').props.onClick();
    expect(currentRun().legs[0]).toMatchObject({ x: -33.5 });
    expect(runLegs(state.rooms[0], state.rooms[0].walls[0], currentRun(), settings)[0].bounds).toEqual(bounds);
  });

  it('anchor 2: clears Width to square {}, then switching to a library leg drops square', () => {
    addCorners();
    change(field(renderLeg(), 'Leg 1 Shape'), '');
    field(renderLeg(), 'Leg 1 Width').props.onCommit(2.5);
    field(renderLeg(), 'Leg 1 Width').props.onCommit(undefined);
    expect(currentRun().legs[0].square).toEqual({});
    expect(field(renderLeg(), 'Leg 1 Width').props.value).toBeUndefined();
    field(renderLeg(), 'Leg 1 Depth').props.onCommit(4);
    field(renderLeg(), 'Leg 1 Width').props.onCommit(2.5);
    field(renderLeg(), 'Leg 1 Width').props.onCommit(undefined);
    expect(currentRun().legs[0].square).toEqual({ d: 4 });
    field(renderLeg(), 'Leg 1 Depth').props.onCommit(undefined);
    expect(currentRun().legs[0].square).toEqual({});
    change(field(renderLeg(), 'Leg 1 Shape'), LEG.id);
    expect(currentRun().legs[0].shapeId).toBe(LEG.id);
    expect(currentRun().legs[0]).not.toHaveProperty('square');
    expect(field(renderLeg(), 'Leg 1 Width')).toBeUndefined();
    expect(field(renderLeg(), 'Leg 1 Depth')).toBeUndefined();
  });

  it('anchor 3: adds four square corners without live library legs and allows picking Square with a library', () => {
    for (const shapes of [[], [{ ...LEG, archived: true }, { ...LEG, id: 'other', kind: 'other' }], [LEG]]) {
      slots = [];
      const args = { ...props(), settings: { ...settings, shapes } };
      let tree = render(AddLegsRow, args);
      if (shapes[0] === LEG) {
        expect(field(tree, 'Add legs Shape').props.value).toBe(LEG.id);
        change(field(tree, 'Add legs Shape'), '');
        tree = render(AddLegsRow, args);
      }
      expect(field(tree, 'Add legs Shape').props.value).toBe('');
      expect(button(tree, 'Apply').props.disabled).toBeUndefined();
      expect(nodes(tree).some(({ props }) => props.children === 'Make a leg in Library → Shapes first.')).toBe(false);
      button(tree, 'Apply').props.onClick();
      expect(Object.keys(currentRun().endLegs)).toEqual(['left', 'right']);
      expect(currentRun()).not.toHaveProperty('legs');
      for (const leg of Object.values(currentRun().endLegs).flatMap(({ front, back }) => [front, back])) {
        expect(leg.square).toEqual({});
        expect(leg).not.toHaveProperty('shapeId');
      }
      if (shapes[0] === LEG) {
        change(field(tree, 'Add legs Shape'), LEG.id);
        tree = render(AddLegsRow, args);
        button(tree, 'Apply').props.onClick();
        for (const leg of Object.values(currentRun().endLegs).flatMap(({ front, back }) => [front, back])) {
          expect(leg.shapeId).toBe(LEG.id);
          expect(leg).not.toHaveProperty('square');
        }
      }
    }
  });

  it('anchor 4: refuses Width 0 and other nonpositive or nonfinite square dimensions without changing the leg', () => {
    addCorners();
    change(field(renderLeg(), 'Leg 1 Shape'), '');
    field(renderLeg(), 'Leg 1 Width').props.onCommit(2.5);
    field(renderLeg(), 'Leg 1 Depth').props.onCommit(4);
    const before = currentRun().legs[0];
    dispatch.mockClear();
    for (const label of ['Width', 'Depth']) {
      for (const value of [0, -1, Infinity, NaN]) {
        expect(field(renderLeg(), `Leg 1 ${label}`).props.onCommit(value)).toBe(false);
        expect(currentRun().legs[0]).toEqual(before);
      }
    }
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('SH7.1 step c leg support controls', () => {
  it('anchor 1: defaults Takes room to checked, stores false when unticked and drops the key when ticked again', () => {
    addCorners();
    expect(field(renderLeg(), 'Leg 1 Takes room').props.checked).toBe(true);
    field(renderLeg(), 'Leg 1 Takes room').props.onChange({ target: { checked: false } });
    expect(currentRun().legs[0].takesRoom).toBe(false);
    expect(field(renderLeg(), 'Leg 1 Takes room').props.checked).toBe(false);
    field(renderLeg(), 'Leg 1 Takes room').props.onChange({ target: { checked: true } });
    expect(currentRun().legs[0]).not.toHaveProperty('takesRoom');
    expect(field(renderLeg(), 'Leg 1 Takes room').props.checked).toBe(true);
  });

  it('anchor 2: shows Full 30 1/2 on a 4-inch base, clears Floor, and follows countertop support and fallbacks', () => {
    addCorners();
    dispatch(updateRun({ wallId: 'wall-1', runId: 'run-1',
      changes: { overrides: { baseKind: 'furniture_base', toeKickHeight: 4 } } }));
    expect(field(renderLeg(), 'Leg 1 Sits on').props.value).toBe('');
    change(field(renderLeg(), 'Leg 1 Sits on'), 'base');
    expect(currentRun().legs[0].sitsOn).toBe('base');
    const fullOption = () => nodes(renderLeg()).find(({ type, props }) => type === 'option' && props.value === 'full');
    expect(fullOption().props.children).toBe('Full (30 1/2")');
    const section = render(RunLegsSection);
    expect(nodes(section).find(({ type }) => type === LegRow).props.placement.bounds.z).toBe(4);
    // Feet has no placement here, but changing to Custom still starts at the supported Full height.
    change(field(renderLeg(), 'Leg 1 Height'), 'feet');
    expect(fullOption().props.children).toBe('Full (30 1/2")');
    change(field(renderLeg(), 'Leg 1 Height'), 'custom');
    expect(currentRun().legs[0].height).toBe(30.5);
    change(field(renderLeg(), 'Leg 1 Height'), 'full');
    change(field(renderLeg(), 'Leg 1 Sits on'), '');
    expect(currentRun().legs[0]).not.toHaveProperty('sitsOn');
    expect(fullOption().props.children).toBe('Full (34 1/2")');
    change(field(renderLeg(), 'Leg 1 Sits on'), 'countertop');
    expect(currentRun().legs[0].sitsOn).toBe('countertop');
    expect(fullOption().props.children).toBe('Full (34 1/2")');
    expect(nodes(renderLeg()).some(({ props }) => props.children === 'Leg 1: no countertop below it. Drawn from the floor.')).toBe(true);
    // A lower run's countertop is at 36; the supported run's top is 84.
    state = { ...state, rooms: [room({ walls: [wall({ runs: [
      { ...currentRun(), cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 30 },
      run({ id: 'lower', x: 10, width: 36 }),
    ] })] })] };
    expect(fullOption().props.children).toBe('Full (48")');
    change(field(renderLeg(), 'Leg 1 Sits on'), 'base');
    expect(fullOption().props.children).toBe('Full (84")');
    expect(nodes(renderLeg()).some(({ props }) => props.children === 'Leg 1: the run has no furniture base. Drawn from the floor.')).toBe(true);
  });

  it('anchor 3: adds four corners on Furniture base, offers Countertop below, and omits Floor on added legs', () => {
    let tree = render(AddLegsRow);
    expect(field(tree, 'Add legs Sits on').props.value).toBe('');
    expect(nodes(field(tree, 'Add legs Sits on')).filter(({ type }) => type === 'option')
      .map(({ props }) => props.children)).toEqual(['Floor', 'Furniture base', 'Countertop below']);
    change(field(tree, 'Add legs Sits on'), 'base');
    tree = render(AddLegsRow);
    button(tree, 'Apply').props.onClick();
    for (const end of Object.values(currentRun().endLegs)) {
      expect(end.front.sitsOn).toBe('base');
      expect(end.back.sitsOn).toBe('base');
    }
    change(field(tree, 'Add legs Sits on'), 'countertop');
    tree = render(AddLegsRow);
    button(tree, 'Apply').props.onClick();
    for (const end of Object.values(currentRun().endLegs)) {
      expect(end.front.sitsOn).toBe('countertop');
      expect(end.back.sitsOn).toBe('countertop');
    }
    change(field(tree, 'Add legs Sits on'), '');
    tree = render(AddLegsRow);
    button(tree, 'Apply').props.onClick();
    for (const end of Object.values(currentRun().endLegs)) {
      expect(end.front).not.toHaveProperty('sitsOn');
      expect(end.back).not.toHaveProperty('sitsOn');
    }
  });
});


describe('SH7.5 step e end presets in the Legs section', () => {
  it('anchor 1: applies Four corners, Panel and Proud 0.5 to both ends, with summaries and no hand legs', () => {
    let tree = render(AddLegsRow);
    expect(field(tree, 'Add legs Fill')).toBeUndefined();
    expect(nodes(field(tree, 'Add legs Fit')).filter(({ type }) => type === 'option')
      .map(({ props }) => [props.value, props.children])).toEqual([
      ['', 'Nothing'], ['panel', 'Panel between the legs'], ['filler', 'Filler behind the front leg'],
    ]);
    expect(nodes(tree).some(({ props }) => props.children ===
      "Corner presets set the run's ends (edit them under Ends). One leg adds a leg placed by hand.")).toBe(true);
    change(field(tree, 'Add legs Fit'), 'panel');
    field(tree, 'Add legs Proud').props.onCommit(0.5);
    tree = render(AddLegsRow);
    button(tree, 'Apply').props.onClick();
    const expected = { left: { ...E, fit: 'between' }, right: { ...E, fit: 'between' } };
    expect(dispatch.mock.calls.at(-1)[0]).toMatchObject({ type: 'elevation/applyRunLegPreset',
      payload: { endLegs: expected, legs: [] } });
    expect(currentRun().endLegs).toEqual(expected);
    expect(currentRun().ends).toEqual(noEnds);
    expect(currentRun()).not.toHaveProperty('legs');
    slots = [];
    const section = render(RunLegsSection);
    const lines = nodes(section).filter(({ type }) => type === 'p').map(({ props }) => props.children);
    expect(lines).toEqual([
      'Left end: front and back legs, panel between the legs (edit under Ends).',
      'Right end: front and back legs, panel between the legs (edit under Ends).',
    ]);
    expect(nodes(section).some(({ type }) => type === LegRow)).toBe(false);
  });

  it('anchor 2: One leg appends a unique hand-placed LF leg at Proud and shows Leg 1, keeping the ends', () => {
    let tree = render(AddLegsRow);
    button(tree, 'Apply').props.onClick();
    const ends = currentRun().endLegs;
    expect(nodes(field(tree, 'Add legs Preset')).some(({ type, props }) => type === 'option'
      && props.value === 'one' && props.children === 'One leg (placed by hand)')).toBe(true);
    change(field(tree, 'Add legs Preset'), 'one');
    change(field(tree, 'Add legs Fit'), 'panel');
    field(tree, 'Add legs Proud').props.onCommit(0.5);
    tree = render(AddLegsRow);
    button(tree, 'Apply').props.onClick();
    expect(currentRun().legs).toEqual([{ id: expect.any(String), shapeId: LEG.id, height: 'full',
      from: 'left', yFrom: 'front', x: 0, y: 0.5, mirror: true }]);
    expect(currentRun().endLegs).toEqual(ends);
    expect(field(renderLeg(), 'Leg 1')).toBeDefined();
    expect(formatProfileCoord(field(renderLeg(), 'Leg 1 In/out').props.value)).toBe('1/2');
    expect(button(renderLeg(), 'Front').props['aria-pressed']).toBe(true);
    expect(nodes(renderLeg()).some(({ props }) => props.children?.includes?.(' #12'))).toBe(true);
    button(tree, 'Apply').props.onClick();
    expect(currentRun().legs).toHaveLength(2);
    expect(new Set(currentRun().legs.map(({ id }) => id)).size).toBe(2);
    slots = [];
    expect(nodes(render(RunLegsSection)).filter(({ type }) => type === LegRow).map(({ props }) => props.index))
      .toEqual([0, 1]);
  });

  it('anchor 4: Undo removes the applied end legs and restores End panel; Redo restores the fitted ends', () => {
    // Keep span flex out of this check of restoring onto the stored, back-face run.
    state = createInitialElevationState({ settings: { ...settings, runFlex: 0 },
      rooms: [room({ walls: [wall({ runs: [run({ x: 10, width: 36,
        ends: { left: { type: 'end_panel' }, right: { type: 'end_panel' } } })] })] })],
      activeRoomId: 'room-1', activeWallId: 'wall-1' });
    render(RunLegsSection);
    const sectionSlots = slots;
    slots = [];
    let add = render(AddLegsRow);
    change(field(add, 'Add legs Fit'), 'panel');
    field(add, 'Add legs Proud').props.onCommit(0.5);
    add = render(AddLegsRow);
    button(add, 'Apply').props.onClick();
    const fitted = { legs: currentRun().legs, endLegs: currentRun().endLegs, ends: currentRun().ends };
    slots = sectionSlots;
    let tree = render(RunLegsSection);
    dispatch(updateRun({ wallId: 'wall-1', runId: 'run-1', changes: { width: 40, wallSide: 'back' } }));
    const storedX = currentRun().x;
    tree = render(RunLegsSection, { ...props(), run: { ...currentRun(), x: 999 } });
    field(tree, 'Undo legs edit').props.onClick();
    tree = render(RunLegsSection);
    expect(currentRun()).not.toHaveProperty('endLegs');
    expect(currentRun()).not.toHaveProperty('legs');
    expect(currentRun().ends).toEqual({ left: { type: 'end_panel', width: null }, right: { type: 'end_panel', width: null } });
    expect(currentRun()).toMatchObject({ x: storedX, width: 40, wallSide: 'back' });
    field(tree, 'Redo legs edit').props.onClick();
    render(RunLegsSection);
    expect(currentRun()).toMatchObject({ endLegs: fitted.endLegs, ends: fitted.ends, x: storedX, width: 40 });
    expect(currentRun()).not.toHaveProperty('legs');
  });

  it('snapshots end piece edits between leg edits and restores all three fields through Undo and Redo', () => {
    const originalEnds = currentRun().ends;
    let tree = render(RunLegsSection);
    addCorners();
    tree = render(RunLegsSection);
    dispatch(setRunEnd({ roomId: 'room-1', wallId: 'wall-1', runId: 'run-1', side: 'left',
      end: { type: 'filler', width: 2 } }));
    tree = render(RunLegsSection);
    const before = currentRun();
    const sectionSlots = slots;
    slots = [];
    let add = render(AddLegsRow);
    change(field(add, 'Add legs Fit'), 'panel');
    add = render(AddLegsRow);
    button(add, 'Apply').props.onClick();
    slots = sectionSlots;
    tree = render(RunLegsSection);
    const after = currentRun();
    expect(after.legs).toEqual(before.legs);
    field(tree, 'Undo legs edit').props.onClick();
    tree = render(RunLegsSection);
    expect(currentRun().legs).toEqual(before.legs);
    expect(currentRun().ends).toEqual(before.ends);
    expect(currentRun()).not.toHaveProperty('endLegs');
    field(tree, 'Undo legs edit').props.onClick();
    tree = render(RunLegsSection);
    expect(currentRun().ends).toEqual(originalEnds);
    expect(currentRun().legs).toEqual(before.legs);
    field(tree, 'Redo legs edit').props.onClick();
    tree = render(RunLegsSection);
    expect(currentRun().ends).toEqual(before.ends);
    field(tree, 'Redo legs edit').props.onClick();
    render(RunLegsSection);
    expect(currentRun()).toMatchObject({ legs: after.legs, endLegs: after.endLegs, ends: after.ends });
  });

  it('shows end-only runs of other types and summarizes front, back and only active fits above hand rows', () => {
    const source = currentRun();
    const r = { ...source, cabinetTypeId: 'other', ends: noEnds, endLegs: {
      left: { legs: 'front', front: E.front, fit: 'behind' }, right: { legs: 'back', back: E.back },
    } };
    let tree = render(RunLegsSection, { ...props(), run: r });
    expect(tree).not.toBeNull();
    const lines = (section) => nodes(section).filter(({ type }) => type === 'p').map(({ props }) => props.children);
    expect(lines(tree)).toEqual([
      'Left end: front leg, filler behind the front leg (edit under Ends).',
      'Right end: back leg (edit under Ends).',
    ]);
    tree = render(RunLegsSection, { ...props(), run: { ...r, ends: source.ends } });
    expect(lines(tree)[0]).toBe('Left end: front leg (edit under Ends).');
    addCorners();
    tree = render(RunLegsSection, { ...props(), run: { ...currentRun(), endLegs: r.endLegs } });
    expect(nodes(tree).filter(({ type }) => type === 'p' || type === LegRow).map(({ type }) => type))
      .toEqual(['p', 'p', LegRow, LegRow, LegRow, LegRow]);
  });
});
