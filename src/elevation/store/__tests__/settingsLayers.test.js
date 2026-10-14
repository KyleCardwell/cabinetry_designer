import { describe, expect, it } from 'vitest';
import { runItems } from '../../model/grid.js';
import { cleanOverrides, resolveSetting } from '../../model/settingsResolve.js';
import elevationReducer, { addItemAfter, createInitialElevationState, setLayerSetting } from '../elevationSlice.js';
import { inheritedChain, selectSettings } from '../selectors.js';
import { settingsFor } from '../slices/helpers.js';
import { run, stateWithRun } from './helpers/sliceFixtures.js';

function withLayers(project = {}, phase = {}) {
  const state = stateWithRun(run({ autoCount: false }));
  state.settings.roundTo = 0.5;
  state.settings.defaultInteriorFillerWidth = 3;
  state.layers = { project: { id: 123, values: project }, phase: { id: 'ph-1', values: phase } };
  return state;
}

describe('DB4 d project and phase layers', () => {
  it('leaves local rooms exactly as before when no layers are loaded', () => {
    expect(createInitialElevationState(null).layers).toEqual({ project: null, phase: null });
    const state = stateWithRun(run({ autoCount: false }));
    expect(settingsFor(state, state.rooms[0]).roundTo).toBe(state.settings.roundTo);
    expect(settingsFor(state, state.rooms[0])).toBe(settingsFor(state, state.rooms[0]));
  });

  it('resolves team → project → phase → room, deepest wins', () => {
    let state = withLayers({ roundTo: 0.25 });
    expect(settingsFor(state, state.rooms[0]).roundTo).toBe(0.25);
    expect(resolveSetting('roundTo', inheritedChain(state, 'room')))
      .toEqual({ value: 0.25, source: { level: 'project', id: 123 } });

    state = withLayers({ roundTo: 0.25 }, { roundTo: 0.125 });
    state.rooms[0].settingsOverrides = { roundTo: 1 };
    expect(settingsFor(state, state.rooms[0]).roundTo).toBe(1);
    expect(resolveSetting('roundTo', inheritedChain(state, 'room')))
      .toEqual({ value: 0.125, source: { level: 'phase', id: 'ph-1' } });
    expect(resolveSetting('roundTo', inheritedChain(state, 'phase')).source.level).toBe('project');
    expect(selectSettings({ elevation: state }).roundTo).toBe(1);
  });

  it('uses a project value when adding a filler', () => {
    let state = withLayers({ defaultInteriorFillerWidth: 2 });
    state = elevationReducer(state, addItemAfter({
      roomId: state.rooms[0].id, wallId: 'wall-1', runId: 'run-1', kind: 'filler', itemId: null,
    }));
    expect(runItems(state.rooms[0].walls[0].runs[0])[0].width).toBe(2);
  });

  it('sets and clears layer overrides, refusing team-only and ill-typed values', () => {
    let state = withLayers();
    state.rooms[0].profile = {};
    state = elevationReducer(state, setLayerSetting({ level: 'project', key: 'roundTo', value: 0.25 }));
    expect(state.layers.project.values).toEqual({ roundTo: 0.25 });
    state = elevationReducer(state, setLayerSetting({ level: 'phase', key: 'defaultProfile.wallHeight', value: 108 }));
    expect(state.layers.phase.values).toEqual({ defaultProfile: { wallHeight: 108 } });
    expect(settingsFor(state, state.rooms[0]).defaultProfile.wallHeight).toBe(108);
    const before = state;
    for (const [level, key, value] of [
      ['project', 'doorPanelDefault', 0.75], ['project', 'roundTo', 'x'], ['room', 'roundTo', 1], ['project', 'bogus', 1],
    ]) {
      expect(elevationReducer(before, setLayerSetting({ level, key, value }))).toBe(before);
    }
    state = elevationReducer(state, setLayerSetting({ level: 'project', key: 'roundTo', value: null }));
    expect(state.layers.project.values).toEqual({});
  });

  it('ignores a layer edit when that layer is not loaded', () => {
    const state = stateWithRun(run({ autoCount: false }));
    expect(elevationReducer(state, setLayerSetting({ level: 'project', key: 'roundTo', value: 1 }))).toBe(state);
  });

  it('keeps managed keys above room and refuses them at room', () => {
    expect(cleanOverrides({ defaultProfile: { wallHeight: 100 }, roundTo: 1 }, 'project'))
      .toEqual({ defaultProfile: { wallHeight: 100 }, roundTo: 1 });
    expect(cleanOverrides({ defaultProfile: { wallHeight: 100 }, roundTo: 1 }, 'room')).toEqual({ roundTo: 1 });
  });
});
