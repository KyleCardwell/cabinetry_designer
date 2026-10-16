import { describe, expect, it } from 'vitest';
import { missingPulls, roomPullUses } from '../../model/pulls.js';
import { gridFromItems, gridLeaves } from '../../model/grid.js';
import elevationReducer, { moveMissingPull } from '../elevationSlice.js';
import { auto, run, stateWithRun } from './helpers/sliceFixtures.js';

function base() {
  const state = stateWithRun(run({ autoCount: false, drawerPullId: 'gone', items: [
    { ...auto('c1'), face: { type: 'door', size: null, pullId: 'gone' } },
  ] }));
  state.rooms[0].settingsOverrides = { doorPullId: 'gone' };
  state.layers = { project: { id: 1, values: { doorPullId: 'old' } }, phase: null };
  return state;
}
const missing = (state) => missingPulls(state.rooms[0], state.settings, state.layers);

describe('HP3c step c missing pulls', () => {
  it('anchor 1: counts three stored room uses and a project setting, sorted by id', () => {
    expect(missing(base())).toEqual([
      { pullId: 'gone', roomUses: 3, setIn: [] },
      { pullId: 'old', roomUses: 0, setIn: ['project'] },
    ]);
    expect(missingPulls({}, base().settings)).toEqual([]);
    const state = base();
    state.settings.doorPullId = 'aaa';
    state.settings.drawerPullId = 'none';
    state.layers.phase = { values: { drawerPullId: 'aaa' } };
    state.rooms[0].settingsOverrides.drawerPullId = null;
    expect(missing(state)).toEqual([
      { pullId: 'aaa', roomUses: 0, setIn: ['team', 'phase'] },
      { pullId: 'gone', roomUses: 3, setIn: [] },
      { pullId: 'old', roomUses: 0, setIn: ['project'] },
    ]);
  });

  it('anchor 2: moves all three room uses to the knob and ignores unknown replacements', () => {
    const state = base();
    const moved = elevationReducer(state, moveMissingPull({ roomId: 'room-1', pullId: 'gone', reassignTo: 'knob-1-25' }));
    const room = moved.rooms[0];
    const run = room.walls[0].runs[0];
    expect([room.settingsOverrides.doorPullId, run.drawerPullId, gridLeaves(run.grid)[0].face.pullId])
      .toEqual(['knob-1-25', 'knob-1-25', 'knob-1-25']);
    expect(missing(moved)).toEqual([{ pullId: 'old', roomUses: 0, setIn: ['project'] }]);
    expect(elevationReducer(state, moveMissingPull({ roomId: 'room-1', pullId: 'gone', reassignTo: 'zzz' }))).toBe(state);
  });

  it('counts and moves nested picks on both wall sides, preserves higher settings and other rooms, and locks read-only edits', () => {
    const state = base();
    const room = state.rooms[0];
    room.settingsOverrides.drawerPullId = 'gone';
    const wall = room.walls[0];
    wall.doorPullId = 'gone';
    wall.drawerPullId = 'gone';
    const front = wall.runs[0];
    front.doorPullId = 'gone';
    const cabinet = gridLeaves(front.grid)[0];
    cabinet.doorPullId = 'gone';
    cabinet.drawerPullId = 'gone';
    cabinet.face = { direction: 'vertical', size: null, children: [
      { type: 'pair_door', size: null, pullId: 'gone' },
      { direction: 'horizontal', size: null, children: [
        { type: 'drawer_front', size: null, pullId: 'gone' },
        { type: 'false_front', size: null, pullId: 'gone' },
        { type: 'door', size: null, pullId: 'none' },
        { type: 'false_front', size: null },
      ] },
    ] };
    front.grid = gridFromItems('outer', [{ ...auto('nested'), grid: front.grid }]);
    wall.runs.push(run({ id: 'back', wallSide: 'back', autoCount: false, drawerPullId: 'gone', items: [auto('back-c')] }));
    state.settings.doorPullId = 'gone';
    state.layers.project.values = { doorPullId: 'gone', drawerPullId: 'gone' };
    state.layers.phase = { id: 2, values: { drawerPullId: 'gone' } };
    state.rooms.push({ ...structuredClone(room), id: 'other' });
    expect(missing(state)).toEqual([{ pullId: 'gone', roomUses: 12, setIn: ['team', 'project', 'phase'] }]);
    const action = moveMissingPull({ roomId: room.id, pullId: 'gone', reassignTo: 'none' });
    const moved = elevationReducer(state, action);
    expect(missing(moved)).toEqual([{ pullId: 'gone', roomUses: 0, setIn: ['team', 'project', 'phase'] }]);
    expect([...roomPullUses(moved.rooms[0])].map(({ node, key }) => node[key])).toEqual(Array(13).fill('none'));
    expect(moved.settings).toBe(state.settings);
    expect(moved.layers).toBe(state.layers);
    expect(moved.rooms[1]).toBe(state.rooms[1]);
    for (const payload of [
      { roomId: 'absent' }, { pullId: 'pull-4' }, { pullId: 'none' }, { pullId: 'unused' }, { reassignTo: null },
    ]) expect(elevationReducer(state, moveMissingPull({ ...action.payload, ...payload }))).toBe(state);
    const readOnly = { ...state, cloud: { room: { readOnly: true } } };
    expect(elevationReducer(readOnly, action)).toBe(readOnly);
    const version = { ...state, source: 'version' };
    expect(elevationReducer(version, action)).toBe(version);
  });
});
