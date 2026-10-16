import { describe, expect, it } from 'vitest';
import { BUILT_IN_PULLS, isPullList } from '../../model/pulls.js';
import { isUuid } from '../../model/cloudRows.js';
import elevationReducer, { addPull, updatePull, deletePull } from '../elevationSlice.js';
import { stateWithRun } from './helpers/sliceFixtures.js';

describe('HP3b step b pull reducers', () => {
  it('copies the first or chosen pull with unique names, fresh UUIDs and no estimator link, without touching rooms', () => {
    const initial = stateWithRun();
    const linked = { ...initial, settings: { ...initial.settings, pulls: BUILT_IN_PULLS.map((pull) => ({ ...pull, hardwarePullId: 42 })) } };
    const first = addPull();
    const second = addPull({ baseId: 'knob-1-25' });
    expect(isUuid(first.payload.id)).toBe(true);
    expect(isUuid(second.payload.id)).toBe(true);
    expect(first.payload.id).not.toBe(second.payload.id);
    let state = elevationReducer(linked, first);
    expect(state.settings.pulls).toHaveLength(3);
    expect(state.settings.pulls[2]).toEqual({ ...BUILT_IN_PULLS[0], id: first.payload.id, name: '4" pull copy', hardwarePullId: null });
    state = elevationReducer(state, second);
    expect(state.settings.pulls[3]).toEqual({ ...BUILT_IN_PULLS[1], id: second.payload.id, name: '1 1/4" knob copy', hardwarePullId: null });
    state = elevationReducer(state, addPull({ baseId: 'missing' }));
    expect(state.settings.pulls[4].name).toBe('4" pull copy 2');
    expect(state.rooms).toBe(linked.rooms);
    expect(isPullList(state.settings.pulls)).toBe(true);
  });

  it('edits sizes and names while retaining ids, built-in kinds and room identity; rejects invalid lists', () => {
    const initial = stateWithRun();
    const resized = elevationReducer(initial, updatePull({ pullId: 'pull-4', pull: { ...BUILT_IN_PULLS[0], id: 'ignored', length: 5, name: 'Shop pull', hardwarePullId: 42 } }));
    expect(resized.settings.pulls[0]).toEqual({ ...BUILT_IN_PULLS[0], length: 5, name: 'Shop pull', hardwarePullId: 42 });
    expect(resized.rooms).toBe(initial.rooms);
    const copyAction = addPull();
    const state = elevationReducer(resized, copyAction);
    const custom = state.settings.pulls[2];
    const tab = { id: custom.id, name: custom.name, kind: 'tab', length: 3, height: 0.5, projection: 1.25, hardwarePullId: 42 };
    const changed = elevationReducer(state, updatePull({ pullId: custom.id, pull: tab }));
    expect(changed.settings.pulls[2]).toEqual(tab);
    expect(changed.rooms).toBe(initial.rooms);
    for (const [pullId, pull] of [
      ['missing', tab],
      ['pull-4', { ...tab, name: 'Shop pull' }],
      [custom.id, { ...custom, name: '1 1/4" KNOB' }],
      [custom.id, { ...custom, name: ' ' }],
      [custom.id, { ...custom, centers: 6 }],
      [custom.id, { ...tab, width: 0.375 }],
      [custom.id, { ...custom, length: 0 }],
      [custom.id, { ...custom, projection: Infinity }],
    ]) expect(elevationReducer(state, updatePull({ pullId, pull }))).toBe(state);
  });

  it('removes only custom pulls, leaves rooms alone, and locks pull edits in issued versions', () => {
    const initial = stateWithRun();
    const action = addPull();
    const state = elevationReducer(initial, action);
    for (const pullId of ['pull-4', 'knob-1-25', 'missing']) {
      expect(elevationReducer(state, deletePull({ pullId }))).toBe(state);
    }
    for (const source of ['local', 'cloud']) {
      const deleted = elevationReducer({ ...state, source }, deletePull({ pullId: action.payload.id }));
      expect(deleted.settings.pulls).toEqual(BUILT_IN_PULLS);
      expect(deleted.rooms).toBe(initial.rooms);
    }
    const version = { ...state, source: 'version' };
    for (const action of [addPull(), updatePull({ pullId: 'pull-4', pull: { ...BUILT_IN_PULLS[0], length: 5 } }), deletePull({ pullId: state.settings.pulls[2].id })]) {
      expect(elevationReducer(version, action)).toBe(version);
    }
  });
});
