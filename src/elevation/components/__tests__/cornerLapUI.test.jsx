import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatch } from 'react-redux';
import { syncRoom } from '../../model/room.js';
import elevationReducer, { setRunEndFiller } from '../../store/elevationSlice.js';
import { fixed, run, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import EndFields from '../properties/EndFields.jsx';

vi.mock('react-redux', () => ({ useDispatch: vi.fn() }));

function fixture() {
  const a = run({ id: 'a', anchors: { left: true, right: true }, autoCount: false, items: [fixed('a-cab', 45)] });
  const b = run({ id: 'b', anchors: { left: true, right: true }, autoCount: false, items: [fixed('b-cab', 45)] });
  const state = stateWithRun(a);
  const room = state.rooms[0];
  const wallA = room.walls[0];
  Object.assign(wallA, {
    x2: 84.875, connections: { end: { wallId: 'wall-2', endpoint: 'start' } },
  });
  room.walls.push({
    ...wallA, id: 'wall-2', x1: 84.875, y1: 0, x2: 84.875, y2: 120.875,
    connections: { start: { wallId: wallA.id, endpoint: 'end' } }, runs: [b],
  });
  state.rooms[0] = syncRoom(room, state.settings);
  return state;
}

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}

function render(state, wallIndex, side) {
  const room = state.rooms[0];
  const wall = room.walls[wallIndex];
  const run = wall.runs[0];
  const tree = EndFields({
    room, wall, run, side, settings: state.settings,
    actionBase: { roomId: room.id, wallId: wall.id, runId: run.id },
  });
  return nodes(tree);
}

const picker = (state, wallIndex, side) => render(state, wallIndex, side)
  .find(({ props }) => props['aria-label'] === `${side} end filler corner`);
const options = (select) => nodes(select).filter(({ type }) => type === 'option')
  .map(({ props }) => [props.value, props.children]);

beforeEach(() => {
  useDispatch.mockReturnValue(vi.fn());
});

describe('FL2 step b corner picker', () => {
  it('B1/B2: shows each C2 Auto decision immediately after Return', () => {
    const state = fixture();
    for (const [wallIndex, side, label] of [[0, 'right', 'Auto (laps over)'], [1, 'left', 'Auto (dies in)']]) {
      const fields = render(state, wallIndex, side).filter(({ props }) => props.label);
      expect(fields.findIndex(({ props }) => props.label === 'Corner'))
        .toBe(fields.findIndex(({ props }) => props.label === 'Return') + 1);
      const select = picker(state, wallIndex, side);
      expect(select.props.value).toBe('auto');
      expect(options(select)).toEqual([
        ['auto', label], ['over', 'Laps over'], ['into', 'Dies in'],
      ]);
    }
  });

  it('B3/B4: stores B Laps over, updates A Auto and both spans, then removes the key on Auto', () => {
    let state = fixture();
    const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
    useDispatch.mockReturnValue(dispatch);
    picker(state, 1, 'left').props.onChange({ target: { value: 'over' } });
    expect(dispatch).toHaveBeenLastCalledWith(setRunEndFiller({
      roomId: 'room-1', wallId: 'wall-2', runId: 'b', side: 'left', key: 'cornerLap', value: 'over',
    }));
    expect(state.rooms[0].walls[1].runs[0].endFiller.left.cornerLap).toBe('over');
    expect(picker(state, 1, 'left').props.value).toBe('over');
    expect(options(picker(state, 0, 'right'))[0][1]).toBe('Auto (dies in)');
    // B's own manual choice must be ignored for the Auto option.
    expect(options(picker(state, 1, 'left'))[0][1]).toBe('Auto (dies in)');
    expect(state.rooms[0].walls.map(({ runs }) => runs[0].width)).toEqual([60, 96.8125]);

    picker(state, 1, 'left').props.onChange({ target: { value: 'auto' } });
    expect(state.rooms[0].walls[1].runs[0].endFiller.left?.cornerLap).toBeUndefined();
    expect(picker(state, 1, 'left').props.value).toBe('auto');
    expect(options(picker(state, 0, 'right'))[0][1]).toBe('Auto (laps over)');
    expect(options(picker(state, 1, 'left'))[0][1]).toBe('Auto (dies in)');
    expect(state.rooms[0].walls.map(({ runs }) => runs[0].width)).toEqual([60.8125, 96]);
  });

  it('B5: hides Corner for blind, panel, none, typed and non-corner filler ends', () => {
    for (const type of ['blind', 'end_panel', 'none']) {
      const state = fixture();
      state.rooms[0].walls[0].runs[0].ends.right.type = type;
      expect(picker(state, 0, 'right')).toBeUndefined();
    }
    const state = fixture();
    expect(picker(state, 0, 'left')).toBeUndefined();
    state.rooms[0].walls[0].runs[0].ends.right.width = 3;
    expect(picker(state, 0, 'right')).toBeUndefined();
  });

  it('stores Dies in, preserves independent filler fields, and rejects invalid lap values', () => {
    let state = fixture();
    useDispatch.mockReturnValue((action) => { state = elevationReducer(state, action); });
    picker(state, 0, 'right').props.onChange({ target: { value: 'into' } });
    const current = () => state.rooms[0].walls[0].runs[0].endFiller.right;
    expect(current().cornerLap).toBe('into');
    expect(picker(state, 0, 'right').props.value).toBe('into');
    expect(options(picker(state, 0, 'right'))[0][1]).toBe('Auto (laps over)');
    const base = { roomId: 'room-1', wallId: 'wall-1', runId: 'a', side: 'right' };
    for (const value of ['auto', 'invalid', '', true, 1, undefined]) {
      expect(elevationReducer(state, setRunEndFiller({ ...base, key: 'cornerLap', value }))).toBe(state);
    }
    const set = (key, value) => { state = elevationReducer(state, setRunEndFiller({ ...base, key, value })); };
    set('width', 6);
    set('width', null);
    expect(current().cornerLap).toBe('into');
    set('width', 6);
    set('returnDepth', 3);
    set('tFiller', false);
    picker(state, 0, 'right').props.onChange({ target: { value: 'auto' } });
    expect(current()).toEqual({ width: 6, returnDepth: 3, tFiller: false });
    set('cornerLap', 'over');
    for (const key of ['width', 'returnDepth', 'tFiller']) set(key, null);
    expect(current().cornerLap).toBe('over');
    set('cornerLap', null);
    expect(current()).toBeNull();
  });
});
