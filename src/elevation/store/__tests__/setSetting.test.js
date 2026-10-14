import { describe, expect, it } from 'vitest';
import { runItems } from '../../model/grid.js';
import { cloneRoom } from '../../model/roomClone.js';
import elevationReducer, { createInitialElevationState, setSetting } from '../elevationSlice.js';
import { settingsFor } from '../slices/helpers.js';
import { run, stateWithRun } from './helpers/sliceFixtures.js';

describe('DB2 c shop-standard setting leaves', () => {
  it('changes one inset-frame leaf while preserving siblings (anchor 1)', () => {
    const initial = createInitialElevationState(null);
    const originalSettings = structuredClone(initial.settings);
    const state = elevationReducer(initial, setSetting({ key: 'insetFrame.stile', value: 1 }));
    expect(state.settings).toEqual({ ...initial.settings, insetFrame: {
      stile: 1, rail: 1.5, midRail: 1.5, mullion: 1.5, upperDrop: 0.75, thickness: 0.8125,
    } });
    expect(initial.settings).toEqual(originalSettings);
  });

  it('ignores invalid values, unknown keys, prefs and unsafe paths (anchor 2)', () => {
    const state = createInitialElevationState(null);
    for (const [key, value] of [
      ['roundTo', 'x'], ['bogus', 1], ['defaultEnds.left', 'bogus'],
      ['orthoWalls', false], ['roundTo', null], ['roundTo', undefined],
      ['roundTo', NaN], ['roundTo', Infinity], ['openingsHaveCasing', 1],
      ['defaultProfile.nosingProfileId', null], ['defaultProfile.nosingProfileId', undefined],
      ['insetFrame', { stile: 1 }], [undefined, 1],
      ['__proto__.polluted', true], ['insetFrame.prototype.polluted', true],
      ['constructor.prototype.polluted', true],
    ]) expect(elevationReducer(state, setSetting({ key, value }))).toBe(state);
    expect({}.polluted).toBeUndefined();
  });

  it('accepts soffit choices and strict booleans (anchor 3)', () => {
    let state = createInitialElevationState(null);
    state = elevationReducer(state, setSetting({ key: 'defaultSoffitMolding', value: 'topMold' }));
    expect(state.settings.defaultSoffitMolding).toBe('topMold');
    state = elevationReducer(state, setSetting({ key: 'openingsHaveCasing', value: false }));
    expect(state.settings.openingsHaveCasing).toBe(false);
  });

  it('keeps room A pinned at 2 while room B inherits stile 1 (anchor 4)', () => {
    const initial = createInitialElevationState(null);
    initial.rooms[0].settingsOverrides = { insetFrame: { stile: 2 } };
    initial.rooms.push({ ...cloneRoom(initial.rooms[0]), id: 'room-b' });
    delete initial.rooms[1].settingsOverrides;
    const state = elevationReducer(initial, setSetting({ key: 'insetFrame.stile', value: 1 }));
    expect(state.rooms.map((room) => settingsFor(state, room).insetFrame.stile)).toEqual([2, 1]);
    expect(state.rooms[0].settingsOverrides).toEqual({ insetFrame: { stile: 2 } });
  });

  it('accepts managed shop settings and re-syncs runs in every room (anchor 5)', () => {
    const initial = stateWithRun(run({ width: 120, ends: {
      left: { type: 'none' }, right: { type: 'none' },
    } }));
    initial.rooms.push({ ...cloneRoom(initial.rooms[0]), id: 'room-b' });
    const state = elevationReducer(initial, setSetting({ key: 'maxCabinetWidth', value: 30 }));
    expect(state.settings.maxCabinetWidth).toBe(30);
    for (const room of state.rooms) {
      expect(runItems(room.walls[0].runs[0])).toHaveLength(4);
    }
    const next = elevationReducer(state, setSetting({ key: 'defaultProfile.nosingProfileId', value: 'profile' }));
    expect(next.settings.defaultProfile).toEqual({ ...state.settings.defaultProfile, nosingProfileId: 'profile' });
  });

  it('creates missing parents and preserves siblings of deeply nested managed leaves', () => {
    const initial = createInitialElevationState(null);
    delete initial.settings.insetFrame;
    let state = elevationReducer(initial, setSetting({ key: 'insetFrame.stile', value: 1 }));
    expect(state.settings.insetFrame).toEqual({ stile: 1 });
    state = elevationReducer(state, setSetting({ key: 'faceReveals.1.top', value: 0.125 }));
    expect(state.settings.faceReveals).toEqual({ ...initial.settings.faceReveals,
      1: { ...initial.settings.faceReveals[1], top: 0.125 },
    });
  });
});
