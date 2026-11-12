import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { legPreset, runLegs } from '../../model/legs.js';
import { legShape } from '../../model/__tests__/fixtures/legs.js';
import { formatProfileCoord } from '../../model/profileEditing.js';
import elevationReducer, { addRunLegs, createInitialElevationState, updateRun } from '../../store/elevationSlice.js';
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

