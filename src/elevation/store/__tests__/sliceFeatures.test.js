import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  CABINET_TYPE_IDS,
} from '../../model/constants.js';
import {
  runItems,
} from '../../model/grid.js';
import {
  openingGeometry,
} from '../../model/openings.js';
import elevationReducer, {
  addOpening,
  addSoffit,
  resizeOpening,
  addWallSegment,
  createInitialElevationState,
  deleteOpening,
  deleteSoffit,
  moveOpening,
  setOpeningMeasureMode,
  setOpeningOffsetAnchor,
  setOpeningOffsetSide,
  setRunAnchor,
  setSelection,
  setSoffitAnchor,
  setTool,
  updateOpening,
  updateSoffit,
} from '../elevationSlice.js';
import {
  auto,
  run,
  opening,
  stateWithRun,
  currentOpening,
  currentRun,
  pin,
} from './helpers/sliceFixtures.js';

describe('elevation opening reducers', () => {
  it('accepts door and window placement tools', () => {
    const doorTool = elevationReducer(stateWithRun(), setTool('door'));
    expect(doorTool.tool).toBe('door');
    expect(elevationReducer(doorTool, setTool('window')).tool).toBe('window');
  });

  it('normalizes run and opening selection as mutually exclusive', () => {
    const initial = stateWithRun(run());
    const selectedOpening = elevationReducer(initial, setSelection({
      runId: 'run-1',
      pieceId: 'piece-1',
      openingId: 'door-1',
    }));
    expect(selectedOpening.selection).toEqual({
      runId: null,
      pieceId: null,
      openingId: 'door-1',
      soffitId: null,
      recessId: null,
      wallId: 'wall-1',
    });

    const selectedRun = elevationReducer(selectedOpening, setSelection({
      runId: 'run-1',
      pieceId: 'piece-1',
    }));
    expect(selectedRun.selection).toEqual({
      runId: 'run-1',
      pieceId: 'piece-1',
      openingId: null,
      soffitId: null,
      recessId: null,
      wallId: 'wall-1',
    });
  });

  it('adds, updates, and rejects invalid opening changes without moving the opening', () => {
    const added = elevationReducer(stateWithRun(), addOpening({
      wallId: 'wall-1',
      opening: { ...opening(), id: undefined },
    }));
    expect(currentOpening(added).id).toEqual(expect.any(String));

    const renamed = elevationReducer(added, updateOpening({
      wallId: 'wall-1',
      openingId: currentOpening(added).id,
      changes: { label: 'Entry', measureMode: 'rough' },
    }));
    expect(currentOpening(renamed)).toMatchObject({ label: 'Entry', measureMode: 'jamb' });

    const rejected = elevationReducer(renamed, updateOpening({
      wallId: 'wall-1',
      openingId: currentOpening(renamed).id,
      changes: { width: 4 },
    }));
    expect(currentOpening(rejected)).toEqual(currentOpening(renamed));
    expect(rejected.message).toBe('opening-too-small');
  });

  it('converts, moves, clamps, and deletes openings through their reducers', () => {
    const initial = stateWithRun(run({
      items: [{
        ...auto('a'),
        pin: pin(0, {
          from: 'opening',
          openingId: 'door-1',
          openingAnchor: 'center',
        }),
      }],
    }));
    initial.rooms[0].walls[0].openings = [opening()];
    const before = openingGeometry(currentOpening(initial), 144, initial.settings);

    const casingMode = elevationReducer(initial, setOpeningMeasureMode({
      wallId: 'wall-1',
      openingId: 'door-1',
      mode: 'casing',
    }));
    expect(openingGeometry(currentOpening(casingMode), 144, casingMode.settings)).toEqual(before);

    const fromRight = elevationReducer(casingMode, setOpeningOffsetSide({
      wallId: 'wall-1',
      openingId: 'door-1',
      side: 'right',
    }));
    expect(openingGeometry(currentOpening(fromRight), 144, fromRight.settings)).toEqual(before);

    const fromCenter = elevationReducer(fromRight, setOpeningOffsetAnchor({
      wallId: 'wall-1',
      openingId: 'door-1',
      anchor: 'center',
    }));
    expect(currentOpening(fromCenter)).toMatchObject({
      offsetFrom: 'right',
      offsetAnchor: 'center',
      offset: 102,
    });
    expect(openingGeometry(currentOpening(fromCenter), 144, fromCenter.settings)).toEqual(before);

    const moved = elevationReducer(fromCenter, moveOpening({
      wallId: 'wall-1',
      openingId: 'door-1',
      x: 140,
    }));
    expect(currentOpening(moved)).toMatchObject({ offsetAnchor: 'center', offset: 21 });
    expect(openingGeometry(currentOpening(moved), 144, moved.settings).casing)
      .toMatchObject({ x: 102, width: 42 });

    const selected = elevationReducer(moved, setSelection({ openingId: 'door-1' }));
    const deleted = elevationReducer(selected, deleteOpening({
      wallId: 'wall-1',
      openingId: 'door-1',
    }));
    expect(deleted.rooms[0].walls[0].openings).toEqual([]);
    expect(runItems(currentRun(deleted))[0].pin).toBeNull();
    expect(deleted.selection).toEqual({
      runId: null, pieceId: null, openingId: null, soffitId: null, recessId: null, wallId: 'wall-1',
    });
  });

  it('30. clears a deleted opening anchor without moving the resolved run', () => {
    const anchoredRun = run({
      x: 29,
      width: 40,
      anchors: {
        left: false,
        right: {
          to: 'opening', openingId: 'door-1', edge: 'casing', clearance: null,
        },
      },
    });
    const state = stateWithRun(anchoredRun);
    state.rooms[0].walls[0].x2 = 120;
    state.rooms[0].walls[0].openings = [opening({
      kind: 'window', label: 'W1', offset: 12, offsetFrom: 'right',
      width: 36, height: 48, sillZ: 36,
    })];

    const deleted = elevationReducer(state, deleteOpening({
      wallId: 'wall-1', openingId: 'door-1',
    }));

    expect(currentRun(deleted)).toMatchObject({
      x: 29,
      width: 40,
      anchors: { left: false, right: false },
    });
  });
});

describe('resizeOpening', () => {
  it('59. grows about the center and rejects a size that leaves the wall', () => {
    const initial = stateWithRun();
    initial.rooms[0].walls[0].openings = [opening()];
    const grown = elevationReducer(initial, resizeOpening({
      wallId: 'wall-1', openingId: 'door-1', width: 40, grow: 'both',
    }));
    expect(currentOpening(grown)).toMatchObject({ width: 40, offset: 22 });

    const tight = stateWithRun();
    tight.rooms[0].walls[0].openings = [opening({ offset: 4 })];
    const rejected = elevationReducer(tight, resizeOpening({
      wallId: 'wall-1', openingId: 'door-1', width: 44, grow: 'left',
    }));
    expect(currentOpening(rejected)).toMatchObject({ width: 36, offset: 4 });
    expect(rejected.message).toBeTruthy();
  });
});

describe('SPEC-19 soffit store shape', () => {
  it('165. initializes wall soffits and soffit selection', () => {
    const initial = createInitialElevationState();
    const state = elevationReducer(initial, addWallSegment({
      x1: 0, y1: 0, x2: 96, y2: 0,
    }));

    expect(state.rooms[0].walls[0].soffits).toEqual([]);
    expect(initial.selection.soffitId).toBeNull();
  });
});

describe('SPEC-19 soffit store', () => {
  const SF = {
    id: 'SF',
    wallSide: 'front',
    x: 40,
    width: 60,
    bottom: 84,
    depth: 14,
    molding: 'crown',
    anchors: { left: false, right: false },
  };

  it('171. adds valid soffits, rejects overlaps, and selects their wall side', () => {
    let state = elevationReducer(stateWithRun(), addSoffit({
      wallId: 'wall-1', soffit: SF,
    }));
    expect(state.rooms[0].walls[0].soffits).toHaveLength(1);
    expect(state.selection.soffitId).toBe('SF');

    state = elevationReducer(state, addSoffit({
      wallId: 'wall-1', soffit: { ...SF, id: 'SG', x: 90, width: 20 },
    }));
    expect(state.rooms[0].walls[0].soffits).toHaveLength(1);

    state = elevationReducer(state, addSoffit({
      wallId: 'wall-1',
      soffit: { ...SF, id: 'SB', x: 0, width: 20, wallSide: 'back' },
    }));
    state = elevationReducer(state, setSelection({ soffitId: 'SB' }));
    expect(state.activeWallSide).toBe('back');
  });

  it('172. updates, anchors, and deletes soffits', () => {
    const initial = stateWithRun(run({
      cabinetTypeId: CABINET_TYPE_IDS.UPPER,
      anchors: {
        left: { to: 'soffit', soffitId: 'SF', offset: 0 },
        right: false,
      },
    }));
    let state = elevationReducer(initial, addSoffit({
      wallId: 'wall-1', soffit: SF,
    }));
    state = elevationReducer(state, updateSoffit({
      wallId: 'wall-1', soffitId: 'SF', changes: { bottom: 80 },
    }));
    expect(state.rooms[0].walls[0].soffits[0].bottom).toBe(80);

    state = elevationReducer(state, updateSoffit({
      wallId: 'wall-1', soffitId: 'SF', changes: { bottom: 96 },
    }));
    expect(state.rooms[0].walls[0].soffits[0].bottom).toBe(80);

    state = elevationReducer(state, setSoffitAnchor({
      wallId: 'wall-1',
      soffitId: 'SF',
      side: 'left',
      anchor: { to: 'end', offset: 20 },
    }));
    expect(state.rooms[0].walls[0].soffits[0]).toMatchObject({ x: 20, width: 60 });

    state = elevationReducer(state, setSelection({ soffitId: 'SF' }));
    state = elevationReducer(state, deleteSoffit({
      wallId: 'wall-1', soffitId: 'SF',
    }));
    expect(state.rooms[0].walls[0].soffits).toEqual([]);
    expect(state.rooms[0].walls[0].runs[0].anchors.left).toBe(false);
    expect(state.selection.soffitId).toBeNull();
  });

  it('173. anchors an upper to a soffit and enables the soffit tool', () => {
    let state = stateWithRun(run({
      cabinetTypeId: CABINET_TYPE_IDS.UPPER,
      z: 54,
      height: 36,
      x: 110,
      width: 30,
    }));
    state = elevationReducer(state, addSoffit({ wallId: 'wall-1', soffit: SF }));
    state = elevationReducer(state, setRunAnchor({
      wallId: 'wall-1',
      runId: 'run-1',
      side: 'left',
      anchor: { to: 'soffit', soffitId: 'SF', offset: 0 },
    }));
    expect(state.rooms[0].walls[0].runs[0].anchors.left)
      .toEqual({ to: 'soffit', soffitId: 'SF', offset: 0 });
    expect(state.rooms[0].walls[0].runs[0].ends.left)
      .toEqual({ type: 'end_panel', width: null });

    state = elevationReducer(state, setTool('soffit'));
    expect(state.tool).toBe('soffit');
  });
});

