import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatch } from 'react-redux';
import elevationReducer, { setRunEnd } from '../../store/elevationSlice.js';
import { run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import RunFaceOptions from '../properties/RunFaceOptions.jsx';

vi.mock('react-redux', () => ({ useDispatch: vi.fn() }));

const sides = ['left', 'right'];
let state;
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
const room = () => state.rooms[0];
const wall = () => room().walls[0];
const run = () => wall().runs[0];
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const render = () => RunFaceOptions({ room: room(), wall: wall(), run: run(), settings: state.settings });
const field = (label) => nodes(render()).find(({ props }) => props['aria-label'] === label);
const waterfall = (side) => field(`Run ${side} waterfall`);
const baseToLeg = (side) => field(`Run ${side} base runs to the waterfall`);
const check = (input, checked) => input.props.onChange({ target: { checked } });
const overhang = (side, value) => field(`Run ${side} overhang`).props.onCommit(value);
const pickTop = (value) => field('Run top').props.onChange({ target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  state = stateWithRun(makeRun({
    x: 30, width: 36, top: 'stone',
    ends: { left: { type: 'end_panel', width: null }, right: { type: 'end_panel', width: null } },
  }));
  useDispatch.mockReturnValue(dispatch);
});

describe('SPEC-50.10 step 509 Waterfall controls', () => {
  for (const side of sides) {
    const other = side === 'left' ? 'right' : 'left';

    it(`${side}: checking removes its end panel; unchecking removes only its waterfall and leaves the end none`, () => {
      expect(waterfall(side).props.checked).toBe(false);
      check(waterfall(side), true);
      expect(run().waterfall).toEqual({ [side]: {} });
      expect(run().ends[side].type).toBe('none');
      expect(run().ends[other].type).toBe('end_panel');
      expect(waterfall(side).props.checked).toBe(true);
      expect(field(`Run ${side} overhang`).props.placeholder).toBe('0');
      expect(baseToLeg(side)).toBeUndefined();
      check(waterfall(other), true);
      check(waterfall(side), false);
      expect(run().waterfall).toEqual({ [other]: {} });
      expect(run().ends[side].type).toBe('none');
      expect(waterfall(side).props.checked).toBe(false);
      check(waterfall(other), false);
      expect(run()).not.toHaveProperty('waterfall');
      expect(run().ends[other].type).toBe('none');
    });

    it(`${side}: offers and persists baseToLeg only under a checked side with positive resolved overhang`, () => {
      overhang(side, 2);
      expect(baseToLeg(side)).toBeUndefined();
      check(waterfall(side), true);
      expect(baseToLeg(side).props.checked).toBe(false);
      expect(baseToLeg(other)).toBeUndefined();
      check(baseToLeg(side), true);
      expect(run().waterfall[side]).toEqual({ baseToLeg: true });
      expect(baseToLeg(side).props.checked).toBe(true);
      overhang(side, 0);
      expect(baseToLeg(side)).toBeUndefined();
      expect(run().waterfall[side]).toEqual({ baseToLeg: true });
      overhang(side, null);
      expect(baseToLeg(side)).toBeUndefined();
      overhang(side, 1.5);
      expect(baseToLeg(side).props.checked).toBe(true);
      check(baseToLeg(side), false);
      expect(run().waterfall[side]).toEqual({});
      check(waterfall(side), false);
      expect(baseToLeg(side)).toBeUndefined();
    });

    it(`${side}: associates a blocked-end warning with that checkbox, keeping the pick editable`, () => {
      run().anchors[side] = { to: 'wall' };
      expect(nodes(render()).filter(({ props }) => props.role === 'alert')).toHaveLength(0);
      check(waterfall(side), true);
      expect(run().waterfall[side]).toEqual({});
      const input = waterfall(side);
      const warnings = nodes(render()).filter(({ props }) => props.role === 'alert');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].props).toMatchObject({
        id: input.props['aria-describedby'], children: 'Blocked: waterfall requires a free end.',
      });
      expect(waterfall(other).props['aria-describedby']).toBeUndefined();
      // A blocked pick inherits the normal side overhang, rather than the free-leg default of zero.
      expect(baseToLeg(side).props.checked).toBe(false);
      check(waterfall(side), false);
      expect(nodes(render()).filter(({ props }) => props.role === 'alert')).toHaveLength(0);
      expect(run()).not.toHaveProperty('waterfall');
    });
  }

  it('shows controls for stone, wood and inherited stone, hiding other tops while retaining picks', () => {
    check(waterfall('left'), true);
    overhang('left', 2);
    check(baseToLeg('left'), true);
    for (const top of ['wood', 'stone', '']) {
      pickTop(top);
      expect(waterfall('left').props.checked).toBe(true);
      expect(waterfall('right').props.checked).toBe(false);
      expect(baseToLeg('left').props.checked).toBe(true);
    }
    for (const top of ['crown', 'topMold', 'none']) {
      pickTop(top);
      for (const side of sides) {
        expect(waterfall(side)).toBeUndefined();
        expect(baseToLeg(side)).toBeUndefined();
      }
      expect(run().waterfall).toEqual({ left: { baseToLeg: true } });
    }
    pickTop('wood');
    expect(waterfall('left').props.checked).toBe(true);
    expect(baseToLeg('left').props.checked).toBe(true);
  });

  it('preserves other end types when enabling a wood waterfall', () => {
    pickTop('wood');
    for (const type of ['none', 'filler', 'blind']) {
      dispatch(setRunEnd({ wallId: wall().id, runId: run().id, side: 'left', end: { type, width: 3 } }));
      const before = structuredClone(run().ends.left);
      check(waterfall('left'), true);
      expect(run().ends.left).toEqual(before);
      check(waterfall('left'), false);
      expect(run().ends.left).toEqual(before);
    }
  });

  it('allows restoring an end panel after enabling a waterfall and keeps it when unchecking', () => {
    check(waterfall('left'), true);
    dispatch(setRunEnd({ wallId: wall().id, runId: run().id, side: 'left', end: { type: 'end_panel', width: null } }));
    expect(waterfall('left').props.checked).toBe(true);
    expect(waterfall('left').props['aria-describedby']).toBeUndefined();
    check(waterfall('left'), false);
    expect(run().ends.left.type).toBe('end_panel');
  });

  it('updates the warning when a touching neighbor blocks or frees the selected end', () => {
    check(waterfall('left'), true);
    state = structuredClone(state);
    // SPEC-RF1: the run may have flexed off x 30, so the neighbour is placed against where it is.
    const neighbor = makeRun({ id: 'neighbor', x: run().x - 30, width: 30, top: 'stone' });
    wall().runs.push(neighbor);
    expect(waterfall('left').props['aria-describedby']).toBeDefined();
    wall().runs = [run()];
    expect(waterfall('left').props['aria-describedby']).toBeUndefined();
    expect(waterfall('left').props.checked).toBe(true);
  });
});
