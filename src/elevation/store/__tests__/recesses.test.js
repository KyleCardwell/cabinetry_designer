import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { gridFromItems } from '../../model/grid.js';
import elevationReducer, {
  addOpening,
  addRecess,
  clearSelection,
  createInitialElevationState,
  deleteRecess,
  resizeRecess,
  setRunAnchor,
  setRunRecess,
  setSelection,
  setTool,
  updateOpening,
  updateRecess,
} from '../elevationSlice.js';

const R = {
  id: 'R', kind: 'recess', label: 'R1', wallSide: 'front', offsetFrom: 'left', offsetAnchor: 'edge',
  offset: 60, width: 48, bottom: 0, height: null, depth: 24, molding: 'crown',
};

function makeRun(overrides = {}) {
  return {
    id: 'run-1', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 60, width: 48, z: 4, height: 30.5, depth: 24,
    ends: { left: { type: 'filler', width: null }, right: { type: 'filler', width: null } },
    autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
    anchors: { left: false, right: false },
    grid: gridFromItems('run-1', [{ id: 'run-1-c', kind: 'cabinet', width: null }]),
    ...overrides,
  };
}

function stateWith(runs = [], wallExtra = {}) {
  return {
    schemaVersion: 4,
    settings: {
      ...DEFAULT_SETTINGS,
      defaultProfile: { ...DEFAULT_SETTINGS.defaultProfile },
      defaultEnds: { ...DEFAULT_SETTINGS.defaultEnds },
    },
    rooms: [{
      id: 'room-1',
      name: 'Room 1',
      profile: { ...DEFAULT_SETTINGS.defaultProfile },
      walls: [{
        id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 240, y2: 0, height: 108, thickness: 4.5,
        flipped: false, connections: { start: null, end: null }, profile: {}, runs, openings: [],
        ...wallExtra,
      }],
    }],
    activeRoomId: 'room-1',
    activeWallId: 'wall-1',
    activeWallSide: 'front',
    view: 'elevation',
    selection: {
      runId: null, pieceId: null, openingId: null, soffitId: null, recessId: null, wallId: 'wall-1',
    },
    tool: 'select',
    message: null,
  };
}

const wallOf = (state) => state.rooms[0].walls[0];

describe('SPEC-38 recesses in the store', () => {
  it('selects a recess and nothing else', () => {
    expect(createInitialElevationState(null).selection.recessId).toBeNull();
    let state = elevationReducer(stateWith(), setSelection({ runId: 'run-1', recessId: 'R' }));
    expect(state.selection).toMatchObject({ recessId: 'R', runId: null, openingId: null, soffitId: null });
    state = elevationReducer(state, setSelection({ openingId: 'D', recessId: 'R' }));
    expect(state.selection).toMatchObject({ openingId: 'D', recessId: null });
    state = elevationReducer(state, setSelection({ recessId: 'R' }));
    state = elevationReducer(state, clearSelection());
    expect(state.selection.recessId).toBeNull();
  });

  const DOOR = {
    id: 'door-1', kind: 'door', label: 'D1', measureMode: 'jamb', width: 24, height: 80, sillZ: 0,
    offset: 72, offsetFrom: 'left', offsetAnchor: 'edge', casing: { width: 3, thickness: 0.75 },
  };
  const base = { wallId: 'wall-1' };

  /** A base on R, its left end anchored to R's side, and a door set in R. */
  function furnished() {
    let state = elevationReducer(stateWith([makeRun()]), addRecess({ ...base, recess: R }));
    state = elevationReducer(state, setRunRecess({ ...base, runId: 'run-1', recessId: 'R' }));
    state = elevationReducer(state, setRunAnchor({
      ...base, runId: 'run-1', side: 'left', anchor: { to: 'recess', recessId: 'R', edge: 'left', offset: null },
    }));
    state = elevationReducer(state, addOpening({ ...base, opening: DOOR }));
    return elevationReducer(state, updateOpening({ ...base, openingId: 'door-1', changes: { recessId: 'R' } }));
  }

  it('adds a recess and selects it; rejects an overlapping one', () => {
    let state = elevationReducer(stateWith(), addRecess({ ...base, recess: R }));
    expect(wallOf(state).recesses).toEqual([R]);
    expect(state.selection.recessId).toBe('R');
    expect(state.activeWallSide).toBe('front');
    state = elevationReducer(state, addRecess({ ...base, recess: { ...R, id: 'X', offset: 80, width: 20 } }));
    expect(wallOf(state).recesses).toHaveLength(1);
    expect(state.message).toBe('recess-overlap');
    state = elevationReducer(state, addRecess({ ...base, recess: { ...R, id: 'B', wallSide: 'back', offset: 0, width: 20 } }));
    expect(wallOf(state).recesses).toHaveLength(2);
    expect(state.activeWallSide).toBe('back');
  });

  it('updates, relabels on a kind change, rejects bad sizes, and resizes', () => {
    let state = elevationReducer(stateWith(), addRecess({ ...base, recess: R }));
    state = elevationReducer(state, updateRecess({ ...base, recessId: 'R', changes: { depth: 12, height: 84 } }));
    expect(wallOf(state).recesses[0]).toMatchObject({ depth: 12, height: 84 });
    state = elevationReducer(state, updateRecess({ ...base, recessId: 'R', changes: { width: 300 } }));
    expect(wallOf(state).recesses[0].width).toBe(48);
    expect(state.message).toBe('recess-out-of-bounds');
    state = elevationReducer(state, updateRecess({ ...base, recessId: 'R', changes: { kind: 'projection' } }));
    expect(wallOf(state).recesses[0]).toMatchObject({ kind: 'projection', label: 'P1' });
    state = elevationReducer(state, resizeRecess({ ...base, recessId: 'R', width: 60, grow: 'both' }));
    expect(wallOf(state).recesses[0]).toMatchObject({ width: 60, offset: 54 });
  });

  it('sets a run on a recess, anchors it to a side, and sets a door in it', () => {
    let state = furnished();
    expect(wallOf(state).runs[0].recessId).toBe('R');
    expect(wallOf(state).runs[0].anchors.left).toEqual({ to: 'recess', recessId: 'R', edge: 'left', offset: 0 });
    expect(wallOf(state).runs[0].ends.left).toEqual({ type: 'filler', width: null });
    expect(wallOf(state).openings[0].recessId).toBe('R');

    state = elevationReducer(state, setRunRecess({ ...base, runId: 'run-1', recessId: null }));
    expect(wallOf(state).runs[0].recessId).toBeUndefined();
    expect(wallOf(state).runs[0].ends.left).toEqual({ type: 'end_panel', width: null });
    state = elevationReducer(state, setRunRecess({ ...base, runId: 'run-1', recessId: 'nope' }));
    expect(wallOf(state).runs[0].recessId).toBeUndefined();

    state = elevationReducer(state, updateOpening({ ...base, openingId: 'door-1', changes: { recessId: null } }));
    expect(wallOf(state).openings[0].recessId).toBeUndefined();
    expect(elevationReducer(state, setTool('recess')).tool).toBe('recess');
  });

  it('deletes a recess and lets go of everything that used it', () => {
    let state = elevationReducer(furnished(), setSelection({ recessId: 'R' }));
    state = elevationReducer(state, deleteRecess({ ...base, recessId: 'R' }));
    expect(wallOf(state).recesses).toEqual([]);
    expect(wallOf(state).runs[0].recessId).toBeUndefined();
    expect(wallOf(state).runs[0].anchors.left).toBe(false);
    expect(wallOf(state).openings[0].recessId).toBeUndefined();
    expect(state.selection.recessId).toBeNull();
  });
});
