import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { room, run, wall } from '../../../test/builders.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { S, legShape } from '../../model/__tests__/fixtures/legs.js';
import { partNumbers } from '../../model/partNumbers.js';
import elevationReducer, { createInitialElevationState, setRunEnd, updateRun } from '../../store/elevationSlice.js';
import EndFields from './EndFields.jsx';
import EndLegsFields from './EndLegsFields.jsx';
import LegFields, { LegHeightFields, LegPanelFields, LegShapeSelect, LegSitsOnSelect } from './LegFields.jsx';
import LegRow from './LegRow.jsx';
import RunEndsSection from './RunEndsSection.jsx';
import ExtendFields from './ExtendFields.jsx';
import PartStyleFields from './PartStyleFields.jsx';

vi.mock('react', async (load) => ({ ...await load(), useMemo: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn() }));

const settings = { ...DEFAULT_SETTINGS, shapes: [legShape()] };
const at = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1' };
const expanded = [EndFields, EndLegsFields, LegFields, LegPanelFields, LegShapeSelect, LegHeightFields, LegSitsOnSelect];
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object'
    ? [tree, ...nodes(expanded.includes(tree.type) ? tree.type(tree.props) : tree.props?.children)] : [];
const field = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const change = (node, value) => node.props.onChange({ target: { value } });
const tick = (node, checked) => node.props.onChange({ target: { checked } });
let state;
let dispatch;
const currentRun = () => state.rooms[0].walls[0].runs[0];
const props = (side = 'left') => ({ room: state.rooms[0], wall: state.rooms[0].walls[0], run: currentRun(),
  settings: state.settings, actionBase: at, side });
const legs = (side) => EndLegsFields(props(side));
const endFields = (side) => EndFields(props(side));
const selectLegs = (value, side = 'left') => change(field(legs(side), `${side === 'left' ? 'Left' : 'Right'} end Legs`), value);
const selectFit = (value, side = 'left') => change(field(legs(side), `${side === 'left' ? 'Left' : 'Right'} end Fit`), value);
const setEnd = (type, side = 'left') => change(field(endFields(side), `${side} end type`), type);

beforeEach(() => {
  vi.clearAllMocks();
  state = createInitialElevationState({ settings, rooms: [room({ walls: [wall({ runs: [run({ x: 10, width: 36,
    ends: { left: { type: 'end_panel' }, right: { type: 'end_panel' } },
  })] })] })], activeRoomId: at.roomId, activeWallId: at.wallId });
  dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
  useDispatch.mockReturnValue(dispatch);
  useMemo.mockImplementation((fn) => fn());
});

describe('SH7.5 step d run end legs', () => {
  it('anchor 1: adds Both with the first live shape and shows Inside the legs after each EndFields', () => {
    selectLegs('both');
    expect(currentRun().endLegs).toEqual({ left: { legs: 'both', front: S, back: S } });
    expect(field(legs(), 'Left end Fit').props.value).toBe('');
    expect(nodes(field(legs(), 'Left end Fit')).filter(({ type }) => type === 'option')
      .map(({ props }) => props.children)).toEqual(['Inside the legs', 'Between the legs']);
    const section = nodes(RunEndsSection(props())).filter(({ type }) => [EndFields, EndLegsFields].includes(type));
    expect(section.map(({ type, props }) => [type, props.side]))
      .toEqual([[EndFields, 'left'], [EndLegsFields, 'left'], [EndFields, 'right'], [EndLegsFields, 'right']]);
    for (const edge of ['front', 'back']) {
      const number = partNumbers(props().room, state.settings).byKey.get(`run-1:endleg:left-${edge}`);
      expect(number).toBeDefined();
      expect(nodes(legs()).some(({ props }) => props.children?.join?.('') === `${edge === 'front' ? 'Front' : 'Back'} leg #${number}`)).toBe(true);
    }
    state = { ...state, settings: { ...state.settings, shapes: [
      { ...legShape(), id: 'old', archived: true }, { ...legShape(), id: 'z', name: 'Zed' },
      { ...legShape(), id: 'a', name: 'Alpha' },
    ] } };
    selectLegs('front', 'right');
    expect(currentRun().endLegs.right.front).toEqual({ ...S, shapeId: 'a' });
  });

  it('anchor 2: Between retains the End panel selection and replaces all piece fields with the fitted note', () => {
    selectLegs('both');
    selectFit('between');
    expect(currentRun().endLegs.left.fit).toBe('between');
    expect(field(endFields(), 'left end type').props.value).toBe('end_panel');
    const fields = nodes(endFields());
    for (const name of ['width', 'height', 'panel L-shape', 'filler ordered width', 'filler return depth', 'filler corner', 'filler T-filler', 'blind box width']) {
      expect(field(endFields(), `left end ${name}`)).toBeUndefined();
    }
    expect(fields.some(({ type }) => [ExtendFields, PartStyleFields].includes(type))).toBe(false);
    expect(fields.some(({ props }) => props.children === 'Fitted to the legs (set under Legs below).')).toBe(true);
    for (const name of ['Reveal', 'Top clearance', 'Bottom clearance', 'Returns', 'Full depth']) {
      expect(field(legs(), `Left end ${name}`)).toBeDefined();
    }
    selectFit('');
    expect(currentRun().endLegs.left).not.toHaveProperty('fit');
    expect(field(endFields(), 'left end width')).toBeDefined();
    expect(field(legs(), 'Left end Reveal')).toBeUndefined();
  });

  it('anchor 3: writes Returns Both and depth 4, with blanks following settings and invalid numbers refused', () => {
    selectLegs('both');
    selectFit('between');
    change(field(legs(), 'Left end Returns'), 'both');
    field(legs(), 'Left end Return depth').props.onCommit(4);
    expect(currentRun().endLegs.left.panel).toEqual({ returns: 'both', returnDepth: 4 });
    for (const [name, key, placeholder] of [['Reveal', 'inset', 'legPanelReveal'],
      ['Top clearance', 'top', 'legPanelTopClearance'], ['Bottom clearance', 'bottom', 'legPanelBottomClearance'],
      ['Return depth', 'returnDepth', 'legPanelReturnDepth']]) {
      const input = () => field(legs(), `Left end ${name}`);
      expect(input().props.allowBlank).toBe(true);
      const setting = input().props.placeholder;
      expect(setting).toBeDefined();
      const customSettings = { ...state.settings, [placeholder]: 7 };
      expect(field(EndLegsFields({ ...props(), settings: customSettings }), `Left end ${name}`).props.placeholder).toBe('7');
      const before = currentRun().endLegs.left.panel;
      for (const value of [NaN, Infinity, -1, ...(key === 'returnDepth' ? [0] : [])]) {
        expect(input().props.onCommit(value)).toBe(false);
        expect(currentRun().endLegs.left.panel).toEqual(before);
      }
      input().props.onCommit(key === 'returnDepth' ? 4 : 0);
      expect(currentRun().endLegs.left.panel[key]).toBe(key === 'returnDepth' ? 4 : 0);
      input().props.onCommit(undefined);
      expect(currentRun().endLegs.left.panel).not.toHaveProperty(key);
      expect(input().props.placeholder).toBe(setting);
    }
    field(legs(), 'Left end Return depth').props.onCommit(4);
    change(field(legs(), 'Left end Returns'), '');
    expect(currentRun().endLegs.left).not.toHaveProperty('panel');
    expect(field(legs(), 'Left end Return depth')).toBeUndefined();
    tick(field(legs(), 'Left end Full depth'), true);
    expect(currentRun().endLegs.left.panel).toEqual({ past: true });
    tick(field(legs(), 'Left end Full depth'), false);
    expect(currentRun().endLegs.left).not.toHaveProperty('panel');
  });

  it('anchor 4: Front drops Between and restores End panel fields, preserving the kept spec and other end', () => {
    selectLegs('both');
    selectLegs('back', 'right');
    field(legs(), 'Left front leg In/out').props.onCommit(0.5);
    selectFit('between');
    change(field(legs(), 'Left end Returns'), 'both');
    const otherEnd = currentRun().endLegs.right;
    selectLegs('front');
    expect(currentRun().endLegs.left).toEqual({ legs: 'front', front: { ...S, y: 0.5 } });
    expect(currentRun().endLegs.right).toEqual(otherEnd);
    expect(field(endFields(), 'left end type').props.value).toBe('end_panel');
    for (const name of ['width', 'height', 'panel L-shape']) expect(field(endFields(), `left end ${name}`)).toBeDefined();
    expect(field(legs(), 'Left end Fit')).toBeUndefined();
    selectLegs('both');
    expect(currentRun().endLegs.left).toEqual({ legs: 'both', front: { ...S, y: 0.5 }, back: S });
    selectLegs('');
    expect(currentRun().endLegs).toEqual({ right: otherEnd });
    selectLegs('', 'right');
    expect(currentRun()).not.toHaveProperty('endLegs');
  });

  it('anchor 5: fits a Filler behind the front leg and keeps the Filler selection for Front or Both', () => {
    for (const count of ['front', 'both']) {
      setEnd('filler');
      selectLegs(count);
      expect(nodes(field(legs(), 'Left end Fit')).filter(({ type }) => type === 'option')
        .map(({ props }) => props.children)).toEqual(['Inside the legs', 'Behind the front leg']);
      selectFit('behind');
      expect(currentRun().endLegs.left.fit).toBe('behind');
      expect(field(endFields(), 'left end type').props.value).toBe('filler');
      expect(field(endFields(), 'left end width')).toBeUndefined();
      expect(field(legs(), 'Left end Reveal')).toBeUndefined();
      selectFit('');
      expect(field(endFields(), 'left end width')).toBeDefined();
    }
    selectLegs('back');
    expect(field(legs(), 'Left end Fit')).toBeUndefined();
    setEnd('none');
    selectLegs('both');
    expect(field(legs(), 'Left end Fit')).toBeUndefined();
  });

  it('anchor 6: stores In/out 0.5 and the mirror flip while showing effective ticks and fixed references', () => {
    selectLegs('both');
    expect(field(legs(), 'Left front leg Mirror left–right').props.checked).toBe(true);
    field(legs(), 'Left front leg In/out').props.onCommit(0.5);
    tick(field(legs(), 'Left front leg Mirror left–right'), false);
    expect(currentRun().endLegs.left.front).toEqual({ ...S, y: 0.5, mirror: true });
    expect(field(legs(), 'Left front leg Mirror left–right').props.checked).toBe(false);
    tick(field(legs(), 'Left front leg Mirror left–right'), true);
    expect(currentRun().endLegs.left.front).not.toHaveProperty('mirror');
    expect(field(legs(), 'Left back leg Mirror front–back').props.checked).toBe(true);
    tick(field(legs(), 'Left back leg Mirror front–back'), false);
    expect(currentRun().endLegs.left.back.mirrorDepth).toBe(true);
    expect(field(legs(), 'Left back leg Mirror front–back').props.checked).toBe(false);
    tick(field(legs(), 'Left back leg Mirror front–back'), true);
    expect(currentRun().endLegs.left.back).not.toHaveProperty('mirrorDepth');
    selectLegs('front', 'right');
    expect(field(legs('right'), 'Right front leg Mirror left–right').props.checked).toBe(false);
    tick(field(legs('right'), 'Right front leg Mirror left–right'), true);
    expect(currentRun().endLegs.right.front.mirror).toBe(true);
    expect(field(legs(), 'Left front leg Along reference')).toBeUndefined();
    expect(field(legs(), 'Left back leg In/out reference')).toBeUndefined();
    expect(nodes(legs()).some(({ props }) => typeof props.children === 'string'
      && props.children.includes("the front leg's front face from the doors, the back leg's back face from the run back"))).toBe(true);
  });

  it('anchor 7: hides Legs for Blind corner; otherwise follows Legs run types and preserves existing end legs', () => {
    selectLegs('both');
    setEnd('blind');
    expect(legs()).toBeNull();
    expect(field(legs(), 'Left end Legs')).toBeUndefined();
    setEnd('end_panel');
    selectLegs('both');
    for (const type of [CABINET_TYPE_IDS.BASE, CABINET_TYPE_IDS.TALL, CABINET_TYPE_IDS.UPPER]) {
      expect(EndLegsFields({ ...props('right'), run: { ...currentRun(), cabinetTypeId: type } })).not.toBeNull();
    }
    const other = { ...currentRun(), cabinetTypeId: CABINET_TYPE_IDS.END_PANEL };
    expect(EndLegsFields({ ...props('right'), run: other })).toBeNull();
    expect(EndLegsFields({ ...props(), run: other })).not.toBeNull();
    expect(EndLegsFields({ ...props('right'), run: { ...other, legs: [{ ...S, id: 'hand', from: 'left', yFrom: 'front' }] } })).not.toBeNull();
  });

  it('keeps shared hand-leg fields and reference buttons after Fill moves to the end', () => {
    const leg = { ...S, id: 'hand', from: 'left', yFrom: 'front' };
    const tree = LegRow({ ...props(), leg, index: 0, numbers: { byKey: new Map([['hand', 12]]) }, warnings: [] });
    for (const name of ['Shape', 'Height', 'Sits on', 'Along', 'In/out', 'Takes room', 'Mirror left–right', 'Mirror front–back',
      'Along reference', 'In/out reference']) {
      expect(field(tree, `Leg 1 ${name}`)).toBeDefined();
    }
    for (const name of ['Fill', 'Reveal', 'Top clearance', 'Bottom clearance', 'Returns', 'Return depth', 'Full depth']) {
      expect(field(tree, `Leg 1 ${name}`)).toBeUndefined();
    }
    expect(nodes(tree).some(({ type }) => type === LegFields)).toBe(true);
    expect(nodes(tree).filter(({ type }) => type === 'button').map(({ props }) => props.children))
      .toEqual(['Remove', 'Left', 'Right', 'Front', 'Back']);
  });

  it('falls back to Square, edits shared fields and shows named leg/fill warnings without reactivating suppressed fits', () => {
    state = { ...state, settings: { ...state.settings, shapes: [{ ...legShape(), archived: true }] } };
    selectLegs('both');
    expect(currentRun().endLegs.left).toEqual({ legs: 'both', front: { square: {}, height: 'full', x: 0, y: 0 },
      back: { square: {}, height: 'full', x: 0, y: 0 } });
    field(legs(), 'Left front leg Width').props.onCommit(4);
    field(legs(), 'Left front leg Depth').props.onCommit(5);
    expect(currentRun().endLegs.left.front.square).toEqual({ w: 4, d: 5 });
    field(legs(), 'Left front leg Width').props.onCommit(undefined);
    expect(currentRun().endLegs.left.front.square).toEqual({ d: 5 });
    expect(field(legs(), 'Left front leg Depth').props.onCommit(0)).toBe(false);
    tick(field(legs(), 'Left front leg Takes room'), false);
    expect(currentRun().endLegs.left.front.takesRoom).toBe(false);
    tick(field(legs(), 'Left front leg Takes room'), true);
    expect(currentRun().endLegs.left.front).not.toHaveProperty('takesRoom');
    change(field(legs(), 'Left front leg Sits on'), 'base');
    expect(currentRun().endLegs.left.front.sitsOn).toBe('base');
    change(field(legs(), 'Left front leg Sits on'), '');
    expect(currentRun().endLegs.left.front).not.toHaveProperty('sitsOn');
    change(field(legs(), 'Left front leg Height'), 'custom');
    field(legs(), 'Left front leg Height inches').props.onCommit(30);
    expect(currentRun().endLegs.left.front.height).toBe(30);
    change(field(legs(), 'Left front leg Height'), 'full');
    change(field(legs(), 'Left front leg Shape'), 'missing');
    expect(currentRun().endLegs.left.front).not.toHaveProperty('square');
    const warnings = nodes(legs()).filter(({ type }) => type === 'p').map(({ props }) => props.children);
    expect(warnings).toContain("Left front leg: its shape isn't in the library.");
    change(field(legs(), 'Left front leg Shape'), '');
    selectFit('between');
    field(legs(), 'Left end Top clearance').props.onCommit(100);
    const front = field(legs(), 'Left front leg');
    expect(nodes(front).some(({ type, props }) => type === 'p' && props.children.startsWith('Left front leg')
      && props.children.includes('panel'))).toBe(true);
    dispatch(setRunEnd({ ...at, side: 'left', end: { type: 'end_panel', width: null } }));
    expect(field(legs(), 'Left end Fit').props.value).toBe('');
    field(legs(), 'Left front leg Along').props.onCommit(1);
    expect(currentRun().ends.left.type).toBe('end_panel');
    expect(currentRun().endLegs.left).not.toHaveProperty('fit');
    dispatch(updateRun({ ...at, changes: { cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 0 } }));
    change(field(legs(), 'Left back leg Height'), 'feet');
    expect(nodes(legs()).some(({ props }) => props.children === 'Left back leg has no height (the run sits on the floor).')).toBe(true);
  });
});
