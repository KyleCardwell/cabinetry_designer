import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { runFootprint } from '../../model/footprints.js';
import { wallFrame } from '../../model/geometry.js';
import {
  gridFromItems,
  gridLeaves,
  runBlind,
  runItems,
} from '../../model/grid.js';
import { openingGeometry } from '../../model/openings.js';
import elevationReducer, {
  addPanel,
  addOpening,
  addSoffit,
  resizeOpening,
  addRoom,
  addItemAfter,
  addRun,
  addWall,
  addWallSegment,
  centerRoomOnOrigin,
  clearSelection,
  connectWalls,
  createInitialElevationState,
  detachWallLanding,
  deleteOpening,
  deleteRun,
  deleteSoffit,
  deleteWall,
  dissolveJoint,
  equalizeCells,
  lockItem,
  joinRunEdges,
  moveOpening,
  moveWallEndpoint,
  moveWallPerpendicular,
  removeCell,
  removeItem,
  replaceRun,
  resizeRun,
  setCellBlind,
  setCellDepth,
  setCellKind,
  setCellShelves,
  setOpeningMeasureMode,
  setOpeningOffsetAnchor,
  setOpeningOffsetSide,
  setPanelType,
  setPanelDoors,
  setPartNumberOverride,
  setItemAbsorb,
  setItemPin,
  setActiveRoom,
  setFacePath,
  setItemFace,
  setItemReveals,
  setItemStyle,
  setRoomStyle,
  setRoomPartNumberStart,
  setRunFaceOptions,
  setRunBottom,
  setRunStyle,
  setActiveWall,
  setActiveWallSide,
  setRunBlind,
  setRunEndFiller,
  setRunCornerClearance,
  setRunAnchor,
  setRunJointOffset,
  setRunEnd,
  setSelection,
  setSoffitAnchor,
  setTool,
  setTrackSize,
  setView,
  setWallEndPanel,
  setWallLanding,
  setWallLength,
  splitCell,
  splitItem,
  updateOpening,
  updateRun,
  updateSoffit,
  updateRoomProfile,
  updateWall,
  unlockItem,
  unsplitCell,
  useAutoHeightsForRoom,
  wrapCell,
} from '../elevationSlice.js';

function auto(id) {
  return { id, kind: 'cabinet', width: null };
}

function fixed(id, width) {
  return { id, kind: 'cabinet', width };
}

function run(overrides = {}) {
  const { items, blind, ...rest } = {
    id: 'run-1',
    cabinetTypeId: CABINET_TYPE_IDS.BASE,
    x: 0,
    width: 120,
    z: 4,
    height: 30.5,
    depth: 24,
    ends: {
      left: { type: 'filler', width: null },
      right: { type: 'filler', width: null },
    },
    autoCount: true,
    maxCabinetWidth: null,
    items: [],
    heightMode: 'manual',
    overrides: {},
    anchors: { left: false, right: false },
    ...overrides,
  };
  return { ...rest, grid: gridFromItems(rest.id, items, blind) };
}

function opening(overrides = {}) {
  return {
    id: 'door-1',
    kind: 'door',
    label: 'D1',
    measureMode: 'jamb',
    width: 36,
    height: 80,
    sillZ: 0,
    offset: 24,
    offsetFrom: 'left',
    offsetAnchor: 'edge',
    casing: { width: 3, thickness: 0.75 },
    ...overrides,
  };
}

function stateWithRun(existingRun = null) {
  return {
    schemaVersion: 3,
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
        id: 'wall-1',
        name: 'Wall 1',
        x1: 0,
        y1: 0,
        x2: 144,
        y2: 0,
        height: 96,
        thickness: 4.5,
        flipped: false,
        connections: { start: null, end: null },
        profile: {},
        runs: existingRun ? [existingRun] : [],
        openings: [],
      }],
    }],
    activeRoomId: 'room-1',
    activeWallId: 'wall-1',
    view: 'elevation',
    selection: {
      runId: null,
      pieceId: null,
      openingId: null,
      wallId: 'wall-1',
    },
    tool: 'select',
    message: null,
  };
}

function currentOpening(state) {
  return state.rooms[0].walls[0].openings[0];
}

function currentRun(state) {
  return state.rooms[0].walls[0].runs[0];
}

function pin(value, overrides = {}) {
  return {
    anchor: 'center',
    from: 'left',
    openingId: null,
    openingAnchor: 'center',
    value,
    ...overrides,
  };
}

describe('SPEC-12 elevation selection persistence', () => {
  it('4. keeps the wall selected when deleting a run in elevation', () => {
    const initial = stateWithRun(run());
    initial.selection = {
      wallId: 'wall-1', runId: 'run-1', pieceId: null, openingId: null,
    };

    const next = elevationReducer(initial, deleteRun({
      wallId: 'wall-1', runId: 'run-1',
    }));

    expect(next.selection).toEqual({
      runId: null, pieceId: null, openingId: null, soffitId: null, wallId: 'wall-1',
    });
  });

  it('5. resolves a later selection against the retained wall', () => {
    const initial = stateWithRun(run());
    initial.rooms[0].walls[0].runs.push(run({ id: 'run-2' }));
    initial.selection = {
      wallId: 'wall-1', runId: 'run-1', pieceId: null, openingId: null,
    };
    const deleted = elevationReducer(initial, deleteRun({
      wallId: 'wall-1', runId: 'run-1',
    }));

    const next = elevationReducer(deleted, setSelection({ runId: 'run-2' }));

    expect(next.selection.wallId).toBe('wall-1');
    expect(next.selection.runId).toBe('run-2');
  });

  it('6. clears the wall when deleting a run in plan', () => {
    const initial = stateWithRun(run());
    initial.view = 'plan';
    initial.selection = {
      wallId: 'wall-1', runId: 'run-1', pieceId: null, openingId: null,
    };

    const next = elevationReducer(initial, deleteRun({
      wallId: 'wall-1', runId: 'run-1',
    }));

    expect(next.selection.wallId).toBeNull();
  });

  it('7. keeps the wall selected when deleting an opening in elevation', () => {
    const initial = stateWithRun();
    initial.rooms[0].walls[0].openings = [opening()];
    initial.selection = {
      wallId: 'wall-1', runId: null, pieceId: null, openingId: 'door-1',
    };

    const next = elevationReducer(initial, deleteOpening({
      wallId: 'wall-1', openingId: 'door-1',
    }));

    expect(next.selection.wallId).toBe('wall-1');
    expect(next.selection.openingId).toBeNull();
  });

  it('8. keeps the wall when clearing elevation selection and clears it in plan', () => {
    const elevation = stateWithRun(run());
    elevation.selection = {
      wallId: 'wall-1', runId: 'run-1', pieceId: null, openingId: null,
    };
    const plan = stateWithRun(run());
    plan.view = 'plan';
    plan.selection = {
      wallId: 'wall-1', runId: 'run-1', pieceId: null, openingId: null,
    };

    expect(elevationReducer(elevation, clearSelection()).selection).toEqual({
      runId: null, pieceId: null, openingId: null, soffitId: null, wallId: 'wall-1',
    });
    expect(elevationReducer(plan, clearSelection()).selection).toEqual({
      runId: null, pieceId: null, openingId: null, soffitId: null, wallId: null,
    });
  });
});

describe('elevation room reducers', () => {
  it('1. activates and selects a wall while clearing object selection', () => {
    const initial = stateWithRun(run());
    initial.rooms[0].walls.push({
      ...initial.rooms[0].walls[0],
      id: 'wall-2',
      x1: 144,
      x2: 240,
      runs: [],
    });
    initial.selection = {
      wallId: 'wall-1',
      runId: 'run-1',
      pieceId: 'piece-1',
      openingId: null,
    };

    const next = elevationReducer(initial, setActiveWall('wall-2'));
    expect(next.activeWallId).toBe('wall-2');
    expect(next.selection).toEqual({
      wallId: 'wall-2', runId: null, pieceId: null, openingId: null, soffitId: null,
    });
  });

  it('2. clears all selection fields without changing the active wall', () => {
    const initial = stateWithRun(run());
    initial.selection = {
      wallId: 'wall-1', runId: 'run-1', pieceId: 'piece-1', openingId: null,
    };

    const next = elevationReducer(initial, clearSelection());
    expect(next.selection).toEqual({
      wallId: 'wall-1', runId: null, pieceId: null, openingId: null, soffitId: null,
    });
    expect(next.activeWallId).toBe('wall-1');
  });

  it('3. selects the active wall when entering elevation view', () => {
    const initial = elevationReducer(stateWithRun(), setView('plan'));

    const next = elevationReducer(initial, setView('elevation'));
    expect(next.selection).toEqual({
      wallId: 'wall-1', runId: null, pieceId: null, openingId: null, soffitId: null,
    });
  });

  it('4. clears a deleted wall selection and moves the active wall', () => {
    const initial = stateWithRun();
    initial.rooms[0].walls.push({
      ...initial.rooms[0].walls[0],
      id: 'wall-2',
      x1: 144,
      x2: 240,
      runs: [],
    });
    initial.rooms[0].wallOrder = ['wall-1', 'wall-2'];

    const next = elevationReducer(initial, deleteWall('wall-1'));
    expect(next.activeWallId).toBe('wall-2');
    expect(next.selection).toEqual({
      wallId: 'wall-2', runId: null, pieceId: null, openingId: null, soffitId: null,
    });
  });

  it("8. updates the room's wall height without touching existing walls", () => {
    const next = elevationReducer(stateWithRun(), updateRoomProfile({
      roomId: 'room-1',
      key: 'wallHeight',
      value: 108,
    }));

    expect(next.rooms[0].profile.wallHeight).toBe(108);
    expect(next.rooms[0].walls[0].height).toBe(96);
  });

  it("9. uses the room's wall height when adding a wall", () => {
    const initial = stateWithRun();
    initial.rooms[0].profile.wallHeight = 108;

    const next = elevationReducer(initial, addWall({
      roomId: 'room-1',
      id: 'wall-2',
    }));

    expect(next.rooms[0].walls.find((wall) => wall.id === 'wall-2').height).toBe(108);
  });

  it('10. uses the room wall height for segments while explicit height wins', () => {
    const initial = stateWithRun();
    initial.rooms[0].profile.wallHeight = 108;
    const payload = {
      roomId: 'room-1',
      x1: 0,
      y1: 60,
      x2: 120,
      y2: 60,
    };

    const defaulted = elevationReducer(initial, addWallSegment({
      ...payload,
      id: 'wall-default-height',
    }));
    const explicit = elevationReducer(initial, addWallSegment({
      ...payload,
      id: 'wall-explicit-height',
      height: 84,
    }));

    expect(defaulted.rooms[0].walls.find((wall) => wall.id === 'wall-default-height').height)
      .toBe(108);
    expect(explicit.rooms[0].walls.find((wall) => wall.id === 'wall-explicit-height').height)
      .toBe(84);
  });

  it('11. translates every wall to center the room on the origin', () => {
    const initial = stateWithRun();
    initial.rooms[0].walls = [
      {
        ...initial.rooms[0].walls[0],
        id: 'wall-a',
        x1: 0,
        y1: 0,
        x2: 120,
        y2: 0,
        runs: [],
      },
      {
        ...initial.rooms[0].walls[0],
        id: 'wall-b',
        x1: 120,
        y1: 0,
        x2: 120,
        y2: 96,
        runs: [],
      },
    ];

    const next = elevationReducer(initial, centerRoomOnOrigin({ roomId: 'room-1' }));

    expect(next.rooms[0].walls.map(({ x1, y1, x2, y2 }) => ({ x1, y1, x2, y2 })))
      .toEqual([
        { x1: -60, y1: -48, x2: 60, y2: -48 },
        { x1: 60, y1: -48, x2: 60, y2: 48 },
      ]);
  });

  it('12. changes nothing when centering an already-centered room', () => {
    const initial = stateWithRun();
    initial.rooms[0].walls = [
      {
        ...initial.rooms[0].walls[0],
        id: 'wall-a',
        x1: 0,
        y1: 0,
        x2: 120,
        y2: 0,
        runs: [],
      },
      {
        ...initial.rooms[0].walls[0],
        id: 'wall-b',
        x1: 120,
        y1: 0,
        x2: 120,
        y2: 96,
        runs: [],
      },
    ];
    const centered = elevationReducer(initial, centerRoomOnOrigin({ roomId: 'room-1' }));
    const centeredAgain = elevationReducer(centered, centerRoomOnOrigin({ roomId: 'room-1' }));

    expect(centeredAgain.rooms[0].walls.map(({ x1, y1, x2, y2 }) => ({ x1, y1, x2, y2 })))
      .toEqual([
        { x1: -60, y1: -48, x2: 60, y2: -48 },
        { x1: 60, y1: -48, x2: 60, y2: 48 },
      ]);
  });

  it('13. preserves wall-local content and topology while centering', () => {
    const initial = stateWithRun();
    initial.rooms[0].walls = [
      {
        ...initial.rooms[0].walls[0],
        id: 'wall-a',
        x1: 0,
        y1: 0,
        x2: 120,
        y2: 0,
        connections: { start: null, end: { wallId: 'wall-b', endpoint: 'start' } },
        runs: [run({ x: 12, width: 36 })],
      },
      {
        ...initial.rooms[0].walls[0],
        id: 'wall-b',
        x1: 120,
        y1: 0,
        x2: 120,
        y2: 96,
        connections: { start: { wallId: 'wall-a', endpoint: 'end' }, end: null },
        runs: [],
      },
    ];
    initial.rooms[0].wallOrder = ['wall-a', 'wall-b'];

    const next = elevationReducer(initial, centerRoomOnOrigin({ roomId: 'room-1' }));
    const wallA = next.rooms[0].walls.find((wall) => wall.id === 'wall-a');

    expect(wallA.runs[0].x).toBe(12);
    expect(next.rooms[0].wallOrder).toEqual(['wall-a', 'wall-b']);
    expect(wallA.connections.end).toEqual({ wallId: 'wall-b', endpoint: 'start' });
  });

  it('14. leaves an empty room unchanged', () => {
    const initial = stateWithRun();
    initial.rooms[0].walls = [];

    const next = elevationReducer(initial, centerRoomOnOrigin({ roomId: 'room-1' }));

    expect(next.rooms[0]).toBe(initial.rooms[0]);
    expect(next.rooms[0].walls).toEqual([]);
  });

  it('9. assigns exposed and inside anchored-end treatments', () => {
    const cornerState = (outside, rightEnd = { type: 'none', width: null }) => {
      const state = stateWithRun(run({
        width: 40,
        ends: {
          left: { type: 'none', width: null },
          right: rightEnd,
        },
      }));
      const wallA = state.rooms[0].walls[0];
      wallA.x2 = 120;
      wallA.flipped = outside;
      wallA.connections.end = { wallId: 'wall-2', endpoint: 'start' };
      state.rooms[0].walls.push({
        ...wallA,
        id: 'wall-2',
        x1: 120,
        y1: 0,
        x2: 120,
        y2: outside ? -96 : 96,
        flipped: false,
        connections: { start: { wallId: 'wall-1', endpoint: 'end' }, end: null },
        runs: [],
      });
      state.rooms[0].wallOrder = ['wall-1', 'wall-2'];
      return state;
    };
    const anchorRight = setRunAnchor({
      wallId: 'wall-1', runId: 'run-1', side: 'right', value: true,
    });

    expect(currentRun(elevationReducer(cornerState(true), anchorRight)).ends.right)
      .toEqual({ type: 'end_panel', width: null });
    expect(currentRun(elevationReducer(cornerState(false), anchorRight)).ends.right)
      .toEqual({ type: 'filler', width: null });
    expect(currentRun(elevationReducer(
      cornerState(true, { type: 'end_panel', width: 0.75 }),
      anchorRight,
    )).ends.right).toEqual({ type: 'end_panel', width: 0.75 });
  });

  it('20. fixes both pinned widths when adding the second pin and keeps them fixed', () => {
    const initial = stateWithRun(run({
      items: [auto('a'), auto('b'), auto('c'), auto('d'), auto('e')],
    }));
    const first = elevationReducer(initial, setItemPin({
      wallId: 'wall-1',
      runId: 'run-1',
      itemId: 'b',
      pin: pin(36),
    }));
    expect(currentRun(first).autoCount).toBe(false);
    expect(runItems(currentRun(first)).find((item) => item.id === 'b').width).toBeNull();

    const second = elevationReducer(first, setItemPin({
      wallId: 'wall-1',
      runId: 'run-1',
      itemId: 'd',
      pin: pin(84),
    }));
    expect(runItems(currentRun(second)).filter((item) => item.pin).map((item) => item.width))
      .toEqual([23, 23]);

    const removed = elevationReducer(second, setItemPin({
      wallId: 'wall-1',
      runId: 'run-1',
      itemId: 'b',
      pin: null,
    }));
    expect(runItems(currentRun(removed)).find((item) => item.id === 'b').width).toBe(23);

    const absorbing = elevationReducer(removed, setItemAbsorb({
      wallId: 'wall-1',
      runId: 'run-1',
      itemId: 'c',
      value: true,
    }));
    expect(runItems(currentRun(absorbing)).find((item) => item.id === 'c').absorb).toBe(true);
  });

  it('sets wall length from the right by default and reports pure-operation failures', () => {
    const initial = stateWithRun();
    const resized = elevationReducer(initial, setWallLength({
      wallId: 'wall-1',
      length: 150,
    }));
    expect(resized.rooms[0].walls[0]).toMatchObject({ x1: 0, x2: 150 });
    expect(resized.message).toBeNull();

    const rejected = elevationReducer(resized, setWallLength({
      wallId: 'wall-1',
      length: 160,
      growEnd: 'middle',
    }));
    expect(rejected.rooms[0].walls[0]).toMatchObject({ x1: 0, x2: 150 });
    expect(rejected.message).toBe('invalid-grow-end');
  });

  it('stores a per-side run corner-clearance override and syncs the room', () => {
    const initial = stateWithRun(run());
    const next = elevationReducer(initial, setRunCornerClearance({
      wallId: 'wall-1',
      runId: 'run-1',
      side: 'right',
      value: 'face',
    }));

    expect(currentRun(next).cornerClearance).toEqual({ right: 'face' });
  });

  it('starts a fresh document with an empty room ready to draw walls in plan', () => {
    const state = createInitialElevationState(null);

    expect(state.rooms).toHaveLength(1);
    expect(state.rooms[0].walls).toEqual([]);
    expect(state.activeWallId).toBeNull();
    expect(state.view).toBe('plan');
    expect(state.tool).toBe('wall');
  });

  it('adds an empty room and opens it in plan with Draw Wall selected', () => {
    const next = elevationReducer(
      stateWithRun(),
      addRoom({ name: 'Room 2' }),
    );
    const addedRoom = next.rooms[1];

    expect(addedRoom).toMatchObject({ name: 'Room 2', walls: [] });
    expect(next.activeRoomId).toBe(addedRoom.id);
    expect(next.activeWallId).toBeNull();
    expect(next.view).toBe('plan');
    expect(next.tool).toBe('wall');
  });

  it('15. defaults, preserves, updates, and validates elevationForced', () => {
    const defaulted = elevationReducer(stateWithRun(), addWall({
      roomId: 'room-1',
      id: 'wall-default',
    }));
    expect(defaulted.rooms[0].walls.find((wall) => wall.id === 'wall-default').elevationForced)
      .toBe(false);

    const forced = elevationReducer(defaulted, addWall({
      roomId: 'room-1',
      id: 'wall-forced',
      elevationForced: true,
    }));
    expect(forced.rooms[0].walls.find((wall) => wall.id === 'wall-forced').elevationForced)
      .toBe(true);

    const updated = elevationReducer(forced, updateWall({
      wallId: 'wall-default',
      changes: { elevationForced: true },
    }));
    expect(updated.rooms[0].walls.find((wall) => wall.id === 'wall-default').elevationForced)
      .toBe(true);

    const rejected = elevationReducer(updated, updateWall({
      wallId: 'wall-default',
      changes: { elevationForced: 'yes' },
    }));
    expect(rejected.rooms[0].walls.find((wall) => wall.id === 'wall-default').elevationForced)
      .toBe(true);
  });

  it('selects Draw Wall for empty rooms and Select for populated rooms', () => {
    const initial = stateWithRun();
    initial.rooms.push({
      id: 'room-2',
      name: 'Room 2',
      profile: { ...DEFAULT_SETTINGS.defaultProfile },
      walls: [],
    });

    const emptySelected = elevationReducer(initial, setActiveRoom('room-2'));
    expect(emptySelected).toMatchObject({
      activeRoomId: 'room-2',
      activeWallId: null,
      view: 'plan',
      tool: 'wall',
    });

    const populatedSelected = elevationReducer(emptySelected, setActiveRoom('room-1'));
    expect(populatedSelected).toMatchObject({
      activeRoomId: 'room-1',
      activeWallId: 'wall-1',
      view: 'plan',
      tool: 'select',
    });
  });

  it('keeps an unanchored run footprint fixed when its wall left end moves', () => {
    const initial = stateWithRun(run({
      x: 30,
      width: 30,
      autoCount: false,
      items: [fixed('cabinet', 27)],
    }));
    const oldRoom = initial.rooms[0];
    const oldWall = oldRoom.walls[0];
    const oldFootprint = runFootprint(
      wallFrame(oldRoom, oldWall),
      oldWall.runs[0],
      initial.settings,
    );

    const next = elevationReducer(initial, moveWallEndpoint({
      wallId: 'wall-1',
      endpoint: 'start',
      x: 10,
      y: 0,
    }));
    const nextRoom = next.rooms[0];
    const nextWall = nextRoom.walls[0];
    const nextFootprint = runFootprint(
      wallFrame(nextRoom, nextWall),
      nextWall.runs[0],
      next.settings,
    );

    expect(nextWall.runs[0].x).toBe(20);
    expect(nextFootprint).toEqual(oldFootprint);
  });

  it('leaves wall geometry unchanged and reports a rejected perpendicular move', () => {
    const initial = stateWithRun();
    const room = initial.rooms[0];
    room.wallOrder = ['wall-1', 'wall-2'];
    Object.assign(room.walls[0], {
      x2: 120,
      connections: { start: null, end: { wallId: 'wall-2', endpoint: 'start' } },
    });
    room.walls.push({
      ...room.walls[0],
      id: 'wall-2',
      x1: 120,
      y1: 0,
      x2: 120,
      y2: 96,
      connections: { start: { wallId: 'wall-1', endpoint: 'end' }, end: null },
      runs: [],
    });

    const next = elevationReducer(initial, moveWallPerpendicular({
      wallId: 'wall-1',
      delta: 96,
    }));

    expect(next.rooms[0]).toEqual(initial.rooms[0]);
    expect(next.message).toBe('neighbor-too-short');
  });
});

describe('elevation run reducers', () => {
  it('syncs auto cabinet items when adding an already-built run', () => {
    const next = elevationReducer(
      stateWithRun(),
      addRun({ wallId: 'wall-1', run: run() }),
    );

    expect(runItems(currentRun(next))).toHaveLength(4);
    expect(runItems(currentRun(next)).every((item) => item.kind === 'cabinet' && item.width === null)).toBe(true);
  });

  it('replaces a stretched run and re-syncs its automatic cabinet count', () => {
    const initialRun = run({ width: 60, items: [auto('left'), auto('right')] });
    const next = elevationReducer(
      stateWithRun(initialRun),
      replaceRun({
        wallId: 'wall-1',
        run: { ...initialRun, width: 110 },
      }),
    );

    expect(currentRun(next).width).toBe(110);
    expect(runItems(currentRun(next))).toHaveLength(3);
  });

  it('splits a cabinet into two auto cabinets and disables auto count', () => {
    const initial = stateWithRun(run({ items: [fixed('locked', 36)] }));
    const next = elevationReducer(
      initial,
      splitItem({ wallId: 'wall-1', runId: 'run-1', itemId: 'locked' }),
    );

    expect(currentRun(next).autoCount).toBe(false);
    expect(runItems(currentRun(next))).toHaveLength(2);
    expect(runItems(currentRun(next)).every((item) => item.kind === 'cabinet' && item.width === null)).toBe(true);
  });

  it('removes only the selected item and disables auto count', () => {
    const initial = stateWithRun(run({
      items: [auto('left'), { id: 'filler', kind: 'filler', width: 3 }, auto('right')],
    }));
    const next = elevationReducer(
      initial,
      removeItem({ wallId: 'wall-1', runId: 'run-1', itemId: 'filler' }),
    );

    expect(runItems(currentRun(next)).map((item) => item.id)).toEqual(['left', 'right']);
    expect(currentRun(next).autoCount).toBe(false);
  });

  it('locks an auto cabinet at the supplied computed width', () => {
    const initial = stateWithRun(run({ autoCount: false, items: [auto('cabinet')] }));
    const next = elevationReducer(
      initial,
      lockItem({
        wallId: 'wall-1',
        runId: 'run-1',
        itemId: 'cabinet',
        computedWidth: 29,
      }),
    );

    expect(runItems(currentRun(next))[0]).toEqual({ id: 'cabinet', kind: 'cabinet', width: 29 });
  });

  it('updates an end and re-syncs the run items', () => {
    const initial = stateWithRun(run({ width: 96 }));
    const next = elevationReducer(
      initial,
      setRunEnd({
        wallId: 'wall-1',
        runId: 'run-1',
        side: 'left',
        end: { type: 'end_panel', width: null },
      }),
    );

    expect(currentRun(next).ends.left).toEqual({ type: 'end_panel', width: null });
    expect(runItems(currentRun(next))).toHaveLength(3);
  });

  it('adds the first manual item to an empty run and disables auto count', () => {
    const initial = stateWithRun(run({ autoCount: false, items: [] }));
    const next = elevationReducer(
      initial,
      addItemAfter({
        wallId: 'wall-1',
        runId: 'run-1',
        itemId: null,
        kind: 'cabinet',
      }),
    );

    expect(currentRun(next).autoCount).toBe(false);
    expect(runItems(currentRun(next))).toHaveLength(1);
    expect(runItems(currentRun(next))[0]).toMatchObject({ kind: 'cabinet', width: null });
  });

  it('switches every room run to auto heights without clearing overrides', () => {
    const first = run({
      id: 'run-1',
      heightMode: 'manual',
      z: 12,
      height: 18,
      overrides: { toeKickHeight: 6 },
    });
    const second = run({
      id: 'run-2',
      cabinetTypeId: CABINET_TYPE_IDS.UPPER,
      heightMode: 'manual',
      z: 48,
      height: 24,
      overrides: { upperClearance: 20 },
    });
    const initial = stateWithRun(first);
    initial.rooms[0].walls[0].runs.push(second);

    const next = elevationReducer(
      initial,
      useAutoHeightsForRoom({ roomId: 'room-1' }),
    );
    const [resolvedFirst, resolvedSecond] = next.rooms[0].walls[0].runs;

    expect(resolvedFirst).toMatchObject({
      heightMode: 'auto',
      z: 6,
      height: 30.5,
      overrides: { toeKickHeight: 6 },
    });
    expect(resolvedSecond).toMatchObject({
      heightMode: 'auto',
      z: 58,
      height: 32,
      overrides: { upperClearance: 20 },
    });
  });

  it('re-resolves auto runs after room height changes while preserving manual runs', () => {
    const automatic = run({ id: 'auto', heightMode: 'auto' });
    const manual = run({
      id: 'manual',
      x: 84,
      width: 48,
      heightMode: 'manual',
      z: 12,
      height: 18,
    });
    const initial = stateWithRun(automatic);
    initial.rooms[0].walls[0].runs.push(manual);

    const next = elevationReducer(initial, updateRoomProfile({
      roomId: 'room-1',
      changes: { toeKickHeight: 5, baseBoxHeight: 32 },
    }));

    expect(next.rooms[0].walls[0].runs[0]).toMatchObject({ z: 5, height: 32 });
    expect(next.rooms[0].walls[0].runs[1]).toMatchObject({ z: 12, height: 18 });
  });

  it('re-resolves an auto tall run after a wall crown override changes', () => {
    const tall = run({
      cabinetTypeId: CABINET_TYPE_IDS.TALL,
      heightMode: 'auto',
      height: 86,
    });

    const next = elevationReducer(stateWithRun(tall), updateWall({
      wallId: 'wall-1',
      changes: { profile: { crownTop: 90 } },
    }));

    expect(currentRun(next)).toMatchObject({ z: 4, height: 80 });
  });
});

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
      runId: null, pieceId: null, openingId: null, soffitId: null, wallId: 'wall-1',
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

describe('cabinet faces', () => {
  function faceState() {
    return stateWithRun(run({
      autoCount: false,
      items: [fixed('a', 18), fixed('b', 18), { id: 'f', kind: 'filler', width: 3 }],
    }));
  }

  function item(state, id) {
    return runItems(currentRun(state)).find((entry) => entry.id === id);
  }

  it('23. setItemFace sets cabinets only, with copies', () => {
    const face = { type: 'pair_door', size: null };
    const next = elevationReducer(faceState(), setItemFace({
      wallId: 'wall-1', runId: 'run-1', itemIds: ['a', 'b', 'f'], face,
    }));

    expect(item(next, 'a').face).toEqual(face);
    expect(item(next, 'b').face).toEqual(face);
    expect(item(next, 'a').face).not.toBe(item(next, 'b').face);
    expect(item(next, 'f').face).toBeUndefined();
  });

  it('24. a null face resets only the listed cabinets', () => {
    const face = { type: 'pair_door', size: null };
    const set = elevationReducer(faceState(), setItemFace({
      wallId: 'wall-1', runId: 'run-1', itemIds: ['a', 'b', 'f'], face,
    }));
    const reset = elevationReducer(set, setItemFace({
      wallId: 'wall-1', runId: 'run-1', itemIds: ['a'], face: null,
    }));

    expect(item(reset, 'a').face).toBeNull();
    expect(item(reset, 'b').face).toEqual(face);
  });

  it('25. facePath is cleared by selection changes', () => {
    let state = elevationReducer(faceState(), setFacePath('r.1'));
    expect(state.facePath).toBe('r.1');

    state = elevationReducer(state, setSelection({ runId: 'run-1', pieceId: 'b' }));
    expect(state.facePath).toBeNull();

    state = elevationReducer(state, setFacePath('r.0'));
    state = elevationReducer(state, clearSelection());
    expect(state.facePath).toBeNull();

    state = elevationReducer(state, setSelection({ runId: 'run-1', pieceId: 'b' }));
    state = elevationReducer(state, setFacePath('r.0'));
    state = elevationReducer(state, removeItem({
      wallId: 'wall-1', runId: 'run-1', itemId: 'b',
    }));
    expect(state.facePath).toBeNull();
    expect(Object.keys(state.selection).sort()).toEqual(['openingId', 'pieceId', 'runId', 'wallId']);
  });
});

describe('styles and reveals', () => {
  const at = { wallId: 'wall-1', runId: 'run-1' };

  function styleState() {
    return stateWithRun(run({
      autoCount: false,
      items: [fixed('a', 18), fixed('b', 18), { id: 'f', kind: 'filler', width: 3 }],
    }));
  }

  function item(state, id) {
    return runItems(currentRun(state)).find((entry) => entry.id === id);
  }

  it('46. setRoomStyle and setRunStyle store cleaned partials', () => {
    let state = elevationReducer(styleState(), setRoomStyle({
      roomId: 'room-1', style: { cabinetStyleId: 14, beadWidth: null, finish: 'paint' },
    }));
    expect(state.rooms[0].style).toEqual({ cabinetStyleId: 14 });
    state = elevationReducer(state, setRoomStyle({ roomId: 'room-1', style: { cabinetStyleId: 99 } }));
    expect(state.rooms[0].style).toEqual({ cabinetStyleId: 14 });
    state = elevationReducer(state, setRoomStyle({ roomId: 'room-1', style: null }));
    expect('style' in state.rooms[0]).toBe(false);

    state = elevationReducer(state, setRunStyle({ ...at, style: { profiledEdge: true, beadWidth: 0.5 } }));
    expect(currentRun(state).style).toEqual({ beadWidth: 0.5, profiledEdge: true });
    state = elevationReducer(state, setRunStyle({ ...at, style: {} }));
    expect('style' in currentRun(state)).toBe(false);
  });

  it('47. setRunFaceOptions sets, ignores and clears', () => {
    let state = elevationReducer(styleState(), setRunFaceOptions({ ...at, upperBottom: 'flush', top: 'wood' }));
    expect(currentRun(state)).toMatchObject({ upperBottom: 'flush', top: 'wood' });
    state = elevationReducer(state, setRunFaceOptions({ ...at, upperBottom: 'floating' }));
    expect(currentRun(state).upperBottom).toBe('flush');
    state = elevationReducer(state, setRunFaceOptions({ ...at, upperBottom: null }));
    expect('upperBottom' in currentRun(state)).toBe(false);
    expect(currentRun(state).top).toBe('wood');
  });

  it('48. setItemStyle and setItemReveals touch listed cabinets only', () => {
    let state = elevationReducer(styleState(), setItemStyle({
      ...at, itemIds: ['a', 'b', 'f'], style: { cabinetStyleId: 15 },
    }));
    expect(item(state, 'a').style).toEqual({ cabinetStyleId: 15 });
    expect(item(state, 'a').style).not.toBe(item(state, 'b').style);
    expect(item(state, 'f').style).toBeUndefined();

    state = elevationReducer(state, setItemReveals({
      ...at, itemIds: ['a'], reveals: { top: 0.1875, left: null, pair: 1, bottom: Number.NaN },
    }));
    expect(item(state, 'a').reveals).toEqual({ top: 0.1875 });
    expect(item(state, 'b').reveals).toBeUndefined();
    state = elevationReducer(state, setItemReveals({ ...at, itemIds: ['a'], reveals: null }));
    expect('reveals' in item(state, 'a')).toBe(false);
  });
});

describe('SPEC-35 run top reducer', () => {
  it('sets any top on any run type and clears it back to the default', () => {
    const at = { wallId: 'wall-1', runId: 'run-1' };
    let state = elevationReducer(
      stateWithRun(run({ cabinetTypeId: CABINET_TYPE_IDS.TALL, autoCount: false, items: [auto('a')] })),
      setRunFaceOptions({ ...at, top: 'crown' }),
    );
    expect(currentRun(state).top).toBe('crown');
    state = elevationReducer(state, setRunFaceOptions({ ...at, top: 'marble' }));
    expect(currentRun(state).top).toBe('crown');
    state = elevationReducer(state, setRunFaceOptions({ ...at, top: null }));
    expect('top' in currentRun(state)).toBe(false);
  });
});

describe('SPEC-35 parts below reducer', () => {
  it('sets the list, rejects a bad one and clears it', () => {
    const at = { wallId: 'wall-1', runId: 'run-1' };
    const RAIL = { id: 'rail', kind: 'light_rail', height: 1.5, doors: 'cover' };
    let state = elevationReducer(
      stateWithRun(run({
        cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 36, depth: 12, autoCount: false, items: [auto('a')],
      })),
      setRunBottom({ ...at, bottom: [RAIL] }),
    );
    expect(currentRun(state).bottom).toEqual([RAIL]);
    const refused = elevationReducer(state, setRunBottom({ ...at, bottom: [{ ...RAIL, kind: 'bottom_cap' }] }));
    expect(currentRun(refused).bottom).toEqual([RAIL]);
    state = elevationReducer(state, setRunBottom({ ...at, bottom: [] }));
    expect('bottom' in currentRun(state)).toBe(false);
  });
});

describe('standard drawers on style switch', () => {
  const at = { wallId: 'wall-1', runId: 'run-1' };
  const THREE_DF = {
    direction: 'vertical',
    size: null,
    children: [
      { type: 'drawer_front', size: 5.875 },
      { type: 'drawer_front', size: null },
      { type: 'drawer_front', size: null },
    ],
  };

  function drawerState() {
    return stateWithRun(run({
      autoCount: false,
      items: [
        { ...fixed('a', 18), face: THREE_DF },
        { ...fixed('b', 18), face: THREE_DF, style: { cabinetStyleId: 13 } },
        fixed('c', 18),
      ],
    }));
  }

  function topSize(state, id) {
    return runItems(currentRun(state)).find((entry) => entry.id === id).face.children[0].size;
  }

  it('53. switching European and face frame resets small drawer fronts', () => {
    let state = elevationReducer(drawerState(), setRoomStyle({ roomId: 'room-1', style: { cabinetStyleId: 14 } }));
    expect(topSize(state, 'a')).toBe(5);
    expect(topSize(state, 'b')).toBe(5.875);
    expect(runItems(currentRun(state))[2].face).toBeUndefined();

    state = elevationReducer(state, setRunStyle({ ...at, style: { cabinetStyleId: 15 } }));
    expect(topSize(state, 'a')).toBe(5);

    state = elevationReducer(state, setItemStyle({ ...at, itemIds: ['b'], style: null }));
    expect(topSize(state, 'b')).toBe(5);

    state = elevationReducer(state, setRoomStyle({ roomId: 'room-1', style: null }));
    state = elevationReducer(state, setRunStyle({ ...at, style: null }));
    expect(topSize(state, 'a')).toBe(5.875);
    expect(topSize(state, 'b')).toBe(5.875);
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

describe('joined run reducers', () => {
  function joinedState() {
    const state = stateWithRun();
    const wall = state.rooms[0].walls[0];
    wall.runs = [
      run({
        id: 'T1',
        cabinetTypeId: CABINET_TYPE_IDS.TALL,
        x: 0,
        width: 24,
        z: 4,
        height: 80,
        ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
        autoCount: false,
        items: [auto('T1-cabinet')],
        anchors: { left: false, right: { to: 'joint', jointId: 'J1', offset: 0 } },
      }),
      run({
        id: 'B',
        x: 24,
        width: 36,
        ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
        autoCount: false,
        items: [auto('B-cabinet')],
        anchors: {
          left: { to: 'joint', jointId: 'J1', offset: 0 },
          right: { to: 'joint', jointId: 'J2', offset: 0 },
        },
      }),
      run({
        id: 'T2',
        cabinetTypeId: CABINET_TYPE_IDS.TALL,
        x: 60,
        width: 24,
        z: 4,
        height: 80,
        ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
        autoCount: false,
        items: [auto('T2-cabinet')],
        anchors: { left: { to: 'joint', jointId: 'J2', offset: 0 }, right: false },
      }),
    ];
    wall.joints = [{ id: 'J1', x: 24 }, { id: 'J2', x: 60 }];
    return state;
  }

  function joinedWall(state) {
    return state.rooms[0].walls[0];
  }

  it('79. setting a joint side free lets sync prune the joint', () => {
    const state = elevationReducer(joinedState(), setRunAnchor({
      wallId: 'wall-1', runId: 'B', side: 'left', anchor: false,
    }));
    const wall = joinedWall(state);

    expect(wall.joints).toEqual([{ id: 'J2', x: 60 }]);
    expect(wall.runs.find((entry) => entry.id === 'T1').anchors.right).toBe(false);
  });

  it('80. resizes through one or both joined sides', () => {
    const right = elevationReducer(joinedState(), resizeRun({
      wallId: 'wall-1', runId: 'B', width: 42, grow: 'right',
    }));
    expect(joinedWall(right).joints).toEqual([{ id: 'J1', x: 24 }, { id: 'J2', x: 66 }]);
    expect(joinedWall(right).runs.find((entry) => entry.id === 'T2'))
      .toMatchObject({ x: 66, width: 18 });

    const both = elevationReducer(joinedState(), resizeRun({
      wallId: 'wall-1', runId: 'B', width: 40, grow: 'both',
    }));
    expect(joinedWall(both).joints).toEqual([{ id: 'J1', x: 22 }, { id: 'J2', x: 62 }]);
    expect(joinedWall(both).runs.find((entry) => entry.id === 'T1')).toMatchObject({ width: 22 });
    expect(joinedWall(both).runs.find((entry) => entry.id === 'T2'))
      .toMatchObject({ x: 62, width: 22 });
  });

  it('81. offsets a joint member and dissolves a whole joint', () => {
    const offset = elevationReducer(joinedState(), setRunJointOffset({
      wallId: 'wall-1', runId: 'B', side: 'left', offset: 1.5,
    }));
    expect(joinedWall(offset).runs.find((entry) => entry.id === 'B').x).toBe(25.5);

    const dissolved = elevationReducer(joinedState(), dissolveJoint({
      wallId: 'wall-1', jointId: 'J1',
    }));
    const wall = joinedWall(dissolved);
    expect(wall.joints).toEqual([{ id: 'J2', x: 60 }]);
    expect(wall.runs.find((entry) => entry.id === 'T1'))
      .toMatchObject({ x: 0, width: 24, anchors: { right: false } });
    expect(wall.runs.find((entry) => entry.id === 'B'))
      .toMatchObject({ x: 24, width: 36, anchors: { left: false } });
  });

  it('86. keeps a manually selected end when joined depths change', () => {
    const initial = joinedState();
    const base = joinedWall(initial).runs.find((entry) => entry.id === 'B');
    base.ends.left = { type: 'end_panel', width: null, auto: true };
    const manual = elevationReducer(initial, setRunEnd({
      wallId: 'wall-1', runId: 'B', side: 'left', end: { type: 'none', width: null },
    }));
    const changed = elevationReducer(manual, updateRun({
      wallId: 'wall-1', runId: 'T1', changes: { depth: 12 },
    }));
    const end = joinedWall(changed).runs.find((entry) => entry.id === 'B').ends.left;

    expect(end.type).toBe('none');
    expect(end.auto).toBeUndefined();
  });
});

describe('SPEC-34.3 follow reducers', () => {
  function followState() {
    const state = stateWithRun();
    const wall = state.rooms[0].walls[0];
    wall.openings = [opening({
      id: 'window-1', kind: 'window', label: 'W1', height: 48, sillZ: 36, offset: 42,
    })];
    wall.runs = [
      run({
        id: 'TA', cabinetTypeId: CABINET_TYPE_IDS.TALL, x: 13, width: 24, height: 80,
        ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
        autoCount: false, items: [auto('TA-cabinet')],
        anchors: {
          left: false,
          right: { to: 'opening', openingId: 'window-1', edge: 'casing', clearance: 2 },
        },
      }),
      run({
        id: 'B', x: 37, width: 30,
        ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
        autoCount: false, items: [auto('B-cabinet')],
      }),
    ];
    return state;
  }
  const baseOf = (state) => state.rooms[0].walls[0].runs.find((entry) => entry.id === 'B');

  it('joins to an anchored edge as a follow, offsets it and frees it', () => {
    let state = elevationReducer(followState(), joinRunEdges({
      wallId: 'wall-1', runId: 'B', side: 'left', targetRunId: 'TA', targetSide: 'right',
    }));
    expect(state.message).toBeNull();
    expect(baseOf(state).anchors.left).toEqual({ to: 'follow', runId: 'TA', side: 'right', offset: 0 });
    expect(baseOf(state).ends.left).toEqual({ type: 'none', width: null, auto: true });

    state = elevationReducer(state, setRunJointOffset({
      wallId: 'wall-1', runId: 'B', side: 'left', offset: 1,
    }));
    expect(baseOf(state)).toMatchObject({ x: 38, width: 30 });

    state = elevationReducer(state, setRunAnchor({
      wallId: 'wall-1', runId: 'B', side: 'left', anchor: false,
    }));
    expect(baseOf(state).anchors.left).toBe(false);
    expect(baseOf(state).ends.left).toEqual({ type: 'end_panel', width: null });
  });
});

describe('joint glyph unjoin', () => {
  it('92. frees one stacked member while preserving the remaining joint', () => {
    const state = stateWithRun();
    const wall = state.rooms[0].walls[0];
    const joinedEnd = () => ({ type: 'none', width: null, auto: true });
    wall.runs = [
      run({
        id: 'T',
        cabinetTypeId: CABINET_TYPE_IDS.TALL,
        x: 0,
        width: 24,
        z: 4,
        height: 80,
        depth: 12,
        ends: { left: { type: 'none', width: null }, right: joinedEnd() },
        autoCount: false,
        items: [auto('T-cabinet')],
        anchors: { left: false, right: { to: 'joint', jointId: 'J1', offset: 0 } },
      }),
      run({
        id: 'B',
        x: 24,
        width: 36,
        z: 4,
        height: 30.5,
        depth: 24,
        ends: { left: joinedEnd(), right: { type: 'none', width: null } },
        autoCount: false,
        items: [auto('B-cabinet')],
        anchors: { left: { to: 'joint', jointId: 'J1', offset: 0 }, right: false },
      }),
      run({
        id: 'U',
        cabinetTypeId: CABINET_TYPE_IDS.UPPER,
        x: 24,
        width: 36,
        z: 54,
        height: 30,
        depth: 15,
        ends: { left: joinedEnd(), right: { type: 'none', width: null } },
        autoCount: false,
        items: [auto('U-cabinet')],
        anchors: { left: { to: 'joint', jointId: 'J1', offset: 0 }, right: false },
      }),
    ];
    wall.joints = [{ id: 'J1', x: 24 }];

    const next = elevationReducer(state, setRunAnchor({
      wallId: 'wall-1', runId: 'U', side: 'left', anchor: false,
    }));
    const nextWall = next.rooms[0].walls[0];
    const upper = nextWall.runs.find((entry) => entry.id === 'U');

    expect(nextWall.joints).toEqual([{ id: 'J1', x: 24 }]);
    expect(nextWall.runs.find((entry) => entry.id === 'T').anchors.right)
      .toMatchObject({ jointId: 'J1' });
    expect(nextWall.runs.find((entry) => entry.id === 'B').anchors.left)
      .toMatchObject({ jointId: 'J1' });
    expect(upper.x).toBe(24);
    expect(upper.anchors.left).toBe(false);
    expect(upper.ends.left.auto).toBeUndefined();
  });
});

describe('SPEC-17 active wall side', () => {
  it('119. initializes the active wall side to front', () => {
    expect(createInitialElevationState().activeWallSide).toBe('front');
  });

  it('120. sets a valid active wall side and clears transient selection', () => {
    let state = stateWithRun(run({ id: 'F', wallSide: 'front' }));
    state = elevationReducer(state, setSelection({ runId: 'F' }));
    state = elevationReducer(state, setActiveWallSide('back'));

    expect(state.activeWallSide).toBe('back');
    expect(state.selection.runId).toBeNull();

    state = elevationReducer(state, setActiveWallSide('side'));
    expect(state.activeWallSide).toBe('back');
  });

  it('121. keeps the active wall side in sync with selected runs and openings', () => {
    let state = stateWithRun(run({ id: 'F', wallSide: 'front' }));
    state.rooms[0].walls[0].runs.push(run({
      id: 'K', x: 0, width: 60, wallSide: 'back',
    }));

    state = elevationReducer(state, setSelection({ runId: 'K' }));
    expect(state.activeWallSide).toBe('back');

    state = elevationReducer(state, setSelection({ runId: 'F' }));
    expect(state.activeWallSide).toBe('front');

    state = elevationReducer(state, setActiveWallSide('back'));
    state = elevationReducer(state, setSelection({ openingId: 'door-1' }));
    expect(state.activeWallSide).toBe('front');
  });

  it('122. resets the active wall side when setting the active wall', () => {
    const state = stateWithRun();
    state.activeWallSide = 'back';

    const next = elevationReducer(state, setActiveWall('wall-1'));

    expect(next.activeWallSide).toBe('front');
  });

  it('123. accepts zero wall thickness and rejects negative thickness', () => {
    let state = stateWithRun();
    state = elevationReducer(state, updateWall({
      wallId: 'wall-1', changes: { thickness: 0 },
    }));
    expect(state.rooms[0].walls[0].thickness).toBe(0);

    state = elevationReducer(state, updateWall({
      wallId: 'wall-1', changes: { thickness: -1 },
    }));
    expect(state.rooms[0].walls[0].thickness).toBe(0);
  });
});

describe('SPEC-17 wall end panel shape', () => {
  it('124. creates walls with empty endpoint panels', () => {
    let state = elevationReducer(stateWithRun(), addWall({}));
    expect(state.rooms[0].walls.at(-1).endPanels).toEqual({ start: null, end: null });

    state = elevationReducer(state, addWallSegment({
      x1: 0, y1: 0, x2: 96, y2: 0, thickness: 0,
    }));
    expect(state.rooms[0].walls.at(-1).endPanels).toEqual({ start: null, end: null });
  });
});

describe('SPEC-17 wall end panel UI', () => {
  it('132. sets, updates, removes, and validates wall end panels', () => {
    let state = elevationReducer(stateWithRun(), setWallEndPanel({
      wallId: 'wall-1', endpoint: 'start', panel: { width: null },
    }));
    expect(state.rooms[0].walls[0].endPanels.start).toEqual({ width: null });

    state = elevationReducer(state, setWallEndPanel({
      wallId: 'wall-1', endpoint: 'end', panel: { width: 1 },
    }));
    expect(state.rooms[0].walls[0].endPanels.end).toEqual({ width: 1 });

    state = elevationReducer(state, setWallEndPanel({
      wallId: 'wall-1', endpoint: 'start', panel: null,
    }));
    expect(state.rooms[0].walls[0].endPanels.start).toBeNull();

    const unchanged = elevationReducer(state, setWallEndPanel({
      wallId: 'wall-1', endpoint: 'middle', panel: { width: 1 },
    }));
    expect(unchanged).toBe(state);

    const invalid = elevationReducer(state, setWallEndPanel({
      wallId: 'wall-1', endpoint: 'end', panel: { width: -1 },
    }));
    expect(invalid).toBe(state);
  });
});

describe('SPEC-18 wing wall store', () => {
  function stateWithLandings(existingRun = null) {
    let state = stateWithRun(existingRun);
    state = elevationReducer(state, addWallSegment({
      id: 'W1',
      x1: 60,
      y1: 0,
      x2: 60,
      y2: 30,
      thickness: 9,
      landStart: { wallId: 'wall-1', side: 'front', x: 60 },
    }));
    return elevationReducer(state, addWallSegment({
      id: 'W2',
      x1: 120,
      y1: 0,
      x2: 120,
      y2: 30,
      thickness: 9,
      landStart: { wallId: 'wall-1', side: 'front', x: 120 },
    }));
  }

  it('154. lands new wall segments on a host face', () => {
    const state = stateWithLandings();
    const wall1 = state.rooms[0].walls.find((wall) => wall.id === 'W1');
    const wall2 = state.rooms[0].walls.find((wall) => wall.id === 'W2');

    expect(wall1.landings.start).toEqual({
      wallId: 'wall-1', side: 'front', ref: 'left', to: 'near', offset: 60,
    });
    expect(wall1.flipped).toBe(false);
    expect(wall2.landings.start).toEqual({
      wallId: 'wall-1', side: 'front', ref: 'right', to: 'near', offset: 24,
    });
    expect(wall2.flipped).toBe(true);
  });

  it('155. edits landing references, targets, and offsets', () => {
    let state = stateWithLandings();
    state = elevationReducer(state, setWallLanding({
      wallId: 'W2', endpoint: 'start', ref: 'W1',
    }));
    let wall2 = state.rooms[0].walls.find((wall) => wall.id === 'W2');
    expect(wall2.landings.start.offset).toBe(42);
    expect(wall2.x1).toBe(120);

    const cycle = elevationReducer(state, setWallLanding({
      wallId: 'W1', endpoint: 'start', ref: 'W2',
    }));
    expect(cycle).toBe(state);
    const invalidTo = elevationReducer(state, setWallLanding({
      wallId: 'W2', endpoint: 'start', to: 'side',
    }));
    expect(invalidTo).toBe(state);

    state = elevationReducer(state, setWallLanding({
      wallId: 'W2', endpoint: 'start', offset: 30,
    }));
    wall2 = state.rooms[0].walls.find((wall) => wall.id === 'W2');
    expect(wall2.x1).toBe(108);
  });

  it('156. releases wall references and anchors when deleting a wing', () => {
    let state = stateWithLandings(run({
      anchors: { left: { to: 'wall', wallId: 'W1' }, right: false },
    }));
    state = elevationReducer(state, setWallLanding({
      wallId: 'W2', endpoint: 'start', ref: 'W1',
    }));
    state = elevationReducer(state, deleteWall('W1'));

    const wall2 = state.rooms[0].walls.find((wall) => wall.id === 'W2');
    const hostRun = state.rooms[0].walls.find((wall) => wall.id === 'wall-1').runs[0];
    expect(wall2.landings.start).toEqual({
      wallId: 'wall-1', side: 'front', ref: 'left', to: 'near', offset: 111,
    });
    expect(hostRun.anchors.left).toBe(false);
  });

  it('157. detaches a landing and releases wall anchors', () => {
    let state = stateWithLandings(run({
      anchors: { left: false, right: { to: 'wall', wallId: 'W2' } },
    }));
    state = elevationReducer(state, detachWallLanding({
      wallId: 'W2', endpoint: 'start',
    }));

    const wall2 = state.rooms[0].walls.find((wall) => wall.id === 'W2');
    const hostRun = state.rooms[0].walls.find((wall) => wall.id === 'wall-1').runs[0];
    expect(wall2.landings.start).toBeNull();
    expect(hostRun.anchors.right).toBe(false);
  });

  it('158. accepts wall run anchors and rejects missing wall ids', () => {
    let state = stateWithRun(run());
    state = elevationReducer(state, setRunAnchor({
      wallId: 'wall-1',
      runId: 'run-1',
      side: 'right',
      anchor: { to: 'wall', wallId: 'W2' },
    }));
    expect(state.rooms[0].walls[0].runs[0].anchors.right)
      .toEqual({ to: 'wall', wallId: 'W2' });
    expect(state.rooms[0].walls[0].runs[0].ends.right)
      .toEqual({ type: 'filler', width: null });

    const invalid = elevationReducer(state, setRunAnchor({
      wallId: 'wall-1',
      runId: 'run-1',
      side: 'right',
      anchor: { to: 'wall' },
    }));
    expect(invalid).toBe(state);
  });

  it('159. clears a landing when its endpoint is connected', () => {
    let state = stateWithLandings();
    state = elevationReducer(state, addWallSegment({
      id: 'C', x1: 200, y1: 50, x2: 250, y2: 50,
    }));
    state = elevationReducer(state, connectWalls({
      wallId1: 'W1',
      endpoint1: 'start',
      wallId2: 'C',
      endpoint2: 'start',
    }));

    expect(state.rooms[0].walls.find((wall) => wall.id === 'W1').landings.start)
      .toBeNull();
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

describe('SPEC-23 part number store', () => {
  it('196. initializes and updates a room part number start', () => {
    let state = elevationReducer(createInitialElevationState(), addRoom({ name: 'Parts' }));
    const roomId = state.activeRoomId;

    expect(state.rooms.find((room) => room.id === roomId)).toMatchObject({
      partNumberStart: 1,
      partNumberOverrides: {},
    });

    state = elevationReducer(state, setRoomPartNumberStart({ roomId, value: 100 }));
    expect(state.rooms.find((room) => room.id === roomId).partNumberStart).toBe(100);

    state = elevationReducer(state, setRoomPartNumberStart({ roomId, value: 0 }));
    expect(state.rooms.find((room) => room.id === roomId).partNumberStart).toBe(1);

    state = elevationReducer(state, setRoomPartNumberStart({ roomId, value: 2.5 }));
    expect(state.rooms.find((room) => room.id === roomId).partNumberStart).toBe(1);
  });

  it('197. sets, clears, and rejects invalid part number overrides', () => {
    let state = elevationReducer(createInitialElevationState(), addRoom({ name: 'Parts' }));
    const roomId = state.activeRoomId;

    state = elevationReducer(state, setPartNumberOverride({
      roomId, key: 'piece-1', number: 12,
    }));
    expect(state.rooms.find((room) => room.id === roomId).partNumberOverrides)
      .toEqual({ 'piece-1': 12 });

    state = elevationReducer(state, setPartNumberOverride({
      roomId, key: 'piece-1', number: null,
    }));
    expect(state.rooms.find((room) => room.id === roomId).partNumberOverrides).toEqual({});

    state = elevationReducer(state, setPartNumberOverride({
      roomId, key: 'piece-1', number: 0,
    }));
    expect(state.rooms.find((room) => room.id === roomId).partNumberOverrides).toEqual({});

    state = elevationReducer(state, setPartNumberOverride({ roomId, number: 12 }));
    expect(state.rooms.find((room) => room.id === roomId).partNumberOverrides).toEqual({});
  });
});

describe('SPEC-25 blind store action', () => {
  it('207. sets, clears, and rejects invalid run blind sides', () => {
    let state = stateWithRun(run({ items: [auto('a')] }));
    const roomId = state.rooms[0].id;
    const actionBase = { roomId, wallId: 'wall-1', runId: 'run-1' };
    const currentRun = () => state.rooms[0].walls[0].runs[0];

    state = elevationReducer(state, setRunBlind({
      ...actionBase, side: 'left', width: 42,
    }));
    expect(runBlind(currentRun())).toEqual({ left: 42, right: null });

    state = elevationReducer(state, setRunBlind({
      ...actionBase, side: 'right', width: 30,
    }));
    expect(runBlind(currentRun())).toEqual({ left: 42, right: 30 });

    state = elevationReducer(state, setRunBlind({
      ...actionBase, side: 'left', width: null,
    }));
    expect(runBlind(currentRun())).toEqual({ left: null, right: 30 });

    state = elevationReducer(state, setRunBlind({
      ...actionBase, side: 'left', width: 0,
    }));
    expect(runBlind(currentRun())).toEqual({ left: null, right: 30 });

    state = elevationReducer(state, setRunBlind({
      ...actionBase, side: 'middle', width: 24,
    }));
    expect(runBlind(currentRun())).toEqual({ left: null, right: 30 });
  });
});

describe('SPEC-27 end filler store action', () => {
  it('216. sets and independently clears end filler width and return depth', () => {
    let state = stateWithRun(run());
    const roomId = state.rooms[0].id;
    const actionBase = { roomId, wallId: 'wall-1', runId: 'run-1' };
    const currentRun = () => state.rooms[0].walls[0].runs[0];

    state = elevationReducer(state, setRunEndFiller({
      ...actionBase, side: 'left', key: 'width', value: 6,
    }));
    expect(currentRun().endFiller).toEqual({
      left: { width: 6, returnDepth: null }, right: null,
    });

    state = elevationReducer(state, setRunEndFiller({
      ...actionBase, side: 'left', key: 'returnDepth', value: 3,
    }));
    expect(currentRun().endFiller.left).toEqual({ width: 6, returnDepth: 3 });

    state = elevationReducer(state, setRunEndFiller({
      ...actionBase, side: 'left', key: 'width', value: null,
    }));
    state = elevationReducer(state, setRunEndFiller({
      ...actionBase, side: 'left', key: 'returnDepth', value: null,
    }));
    expect(currentRun().endFiller).toEqual({ left: null, right: null });

    const beforeInvalid = currentRun();
    state = elevationReducer(state, setRunEndFiller({
      ...actionBase, side: 'left', key: 'depth', value: 4,
    }));
    state = elevationReducer(state, setRunEndFiller({
      ...actionBase, side: 'middle', key: 'width', value: 4,
    }));
    expect(currentRun()).toEqual(beforeInvalid);
  });
});

describe('SPEC-28 blind end store actions', () => {
  it('223. clears incompatible end data and accepts zero return depth', () => {
    let state = stateWithRun(run({
      items: [auto('a')],
      blind: { left: 42, right: 30 },
      endFiller: { left: { width: 6 }, right: null },
    }));
    const roomId = state.rooms[0].id;
    const actionBase = { roomId, wallId: 'wall-1', runId: 'run-1' };
    const currentRun = () => state.rooms[0].walls[0].runs[0];

    state = elevationReducer(state, setRunEnd({
      ...actionBase,
      side: 'left',
      end: { type: 'filler', width: null },
    }));
    expect(runBlind(currentRun())).toEqual({ left: null, right: 30 });
    expect(currentRun().endFiller).toEqual({ left: { width: 6 }, right: null });

    state = elevationReducer(state, setRunEnd({
      ...actionBase,
      side: 'left',
      end: { type: 'end_panel', width: null },
    }));
    expect(currentRun().endFiller).toEqual({ left: null, right: null });

    state = elevationReducer(state, setRunEndFiller({
      ...actionBase,
      side: 'left',
      key: 'returnDepth',
      value: 0,
    }));
    expect(currentRun().endFiller.left).toEqual({ width: null, returnDepth: 0 });

    state = elevationReducer(state, setRunEndFiller({
      ...actionBase,
      side: 'left',
      key: 'returnDepth',
      value: -1,
    }));
    expect(currentRun().endFiller.left).toBeNull();
  });
});

describe('SPEC-32 store holds grids', () => {
  const actionBase = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1' };

  it('splits a grid item without restoring legacy run fields', () => {
    const initial = stateWithRun(run({
      autoCount: false,
      items: [fixed('a', 30)],
      blind: { left: 36, right: 24 },
    }));
    const state = elevationReducer(initial, splitItem({ ...actionBase, itemId: 'a' }));
    const storedRun = currentRun(state);

    expect(storedRun).not.toHaveProperty('items');
    expect(storedRun).not.toHaveProperty('blind');
    expect(runItems(storedRun)).toHaveLength(2);
    expect(runItems(storedRun).every((item) => (
      item.kind === 'cabinet' && item.id !== 'a'
    ))).toBe(true);
    expect(runBlind(storedRun)).toEqual({ left: 36, right: 24 });
  });

  it('locks and unlocks the root grid column', () => {
    let state = stateWithRun(run({ autoCount: false, items: [fixed('a', 30)] }));
    state = elevationReducer(state, lockItem({ ...actionBase, itemId: 'a', width: 20 }));
    expect(currentRun(state).grid.cols[0]).toEqual({
      id: 'a:col', size: 20, sizeMode: 'manual',
    });

    state = elevationReducer(state, unlockItem({ ...actionBase, itemId: 'a' }));
    expect(currentRun(state).grid.cols[0]).toEqual({
      id: 'a:col', size: null, sizeMode: 'auto',
    });
  });

  it('edits a cabinet face through the grid leaf', () => {
    const initial = stateWithRun(run({ items: [fixed('a', 30)] }));
    const state = elevationReducer(initial, setItemFace({
      ...actionBase,
      itemIds: ['a'],
      face: { type: 'door', size: null },
    }));

    expect(currentRun(state).grid.cells[0].node.face).toEqual({
      type: 'door', size: null,
    });
  });
});

describe('SPEC-33 cell reducers', () => {
  const actionBase = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1' };
  const start = (overrides = {}) => stateWithRun(run({
    autoCount: false, items: [fixed('a', 30), auto('b')], ...overrides,
  }));
  const stackOf = (state) => currentRun(state).grid.cells[0].node;
  const split = (state, cellId, direction, count = 2) => elevationReducer(
    state, splitCell({ ...actionBase, cellId, direction, count }),
  );

  it('splits a root cabinet down, then sizes and equalizes its rows', () => {
    let state = split(start(), 'a', 'down', 3);
    expect(stackOf(state).rows).toHaveLength(3);
    expect(stackOf(state).cells[0].node.id).toBe('a');
    expect(currentRun(state).grid.cols[0]).toEqual({
      id: `${stackOf(state).id}:col`, size: 30, sizeMode: 'manual',
    });
    expect(currentRun(state).autoCount).toBe(false);

    const trackId = stackOf(state).rows[2].id;
    state = elevationReducer(state, setTrackSize({ ...actionBase, trackId, size: 10 }));
    expect(stackOf(state).rows[2]).toEqual({ id: trackId, size: 10, sizeMode: 'manual' });

    state = elevationReducer(state, equalizeCells({ ...actionBase, cellId: 'a' }));
    expect(stackOf(state).rows.every((row) => row.size === null)).toBe(true);
  });

  it('splits across into root columns and turns auto count off', () => {
    const state = split(start({ autoCount: true }), 'b', 'across');
    expect(runItems(currentRun(state))).toHaveLength(3);
    expect(runItems(currentRun(state))[0].id).toBe('a');
    expect(runItems(currentRun(state))[1].id).toBe('b');
    expect(currentRun(state).autoCount).toBe(false);
  });

  it('removes a nested cell, collapsing the stack and its selection', () => {
    let state = split(start(), 'a', 'down');
    const second = stackOf(state).cells[1].node.id;
    state = elevationReducer(state, setSelection({ runId: 'run-1', pieceId: second }));
    state = elevationReducer(state, removeCell({ ...actionBase, cellId: second }));
    expect(currentRun(state).grid.cells[0].node).toEqual({ id: 'a', kind: 'cabinet' });
    expect(currentRun(state).grid.cols[0].id).toBe('a:col');
    expect(state.selection.pieceId).toBeNull();
    expect(state.facePath).toBeNull();

    state = elevationReducer(state, removeCell({ ...actionBase, cellId: 'b' }));
    expect(runItems(currentRun(state)).map((item) => item.id)).toEqual(['a']);
  });

  it('unsplits to the chosen cell', () => {
    let state = split(start(), 'a', 'down', 3);
    const mid = stackOf(state).cells[1].node.id;
    state = elevationReducer(state, unsplitCell({ ...actionBase, cellId: mid }));
    expect(currentRun(state).grid.cells[0].node).toEqual({ id: mid, kind: 'cabinet' });
    expect(currentRun(state).grid.cols[0]).toEqual({
      id: `${mid}:col`, size: 30, sizeMode: 'manual',
    });
  });

  it('face, style and reveal edits reach nested cells', () => {
    let state = split(start(), 'a', 'down');
    const lower = stackOf(state).cells[1].node.id;
    state = elevationReducer(state, setItemFace({
      ...actionBase, itemIds: [lower], face: { type: 'drawer_front', size: null },
    }));
    state = elevationReducer(state, setItemReveals({
      ...actionBase, itemIds: [lower], reveals: { top: 0.25 },
    }));
    state = elevationReducer(state, setItemStyle({
      ...actionBase, itemIds: [lower], style: { cabinetStyleId: 14 },
    }));

    const leaves = gridLeaves(currentRun(state).grid);
    expect(leaves.find((leaf) => leaf.id === lower)).toMatchObject({
      face: { type: 'drawer_front', size: null },
      reveals: { top: 0.25 },
      style: { cabinetStyleId: 14 },
    });
    expect(leaves.find((leaf) => leaf.id === 'a')).not.toHaveProperty('face');
    expect(leaves.find((leaf) => leaf.id === 'a')).not.toHaveProperty('reveals');
    expect(leaves.find((leaf) => leaf.id === 'a')).not.toHaveProperty('style');
  });

  it('a blind column stays blind when split down', () => {
    const state = split(start({ blind: { left: 36, right: null } }), 'a', 'down');
    const leaves = gridLeaves(currentRun(state).grid);
    expect(leaves.filter((leaf) => leaf.blind).map((leaf) => leaf.id)).toEqual([
      'a', leaves[1].id,
    ]);
    expect(runBlind(currentRun(state))).toEqual({ left: 36, right: null });
  });
});

describe('SPEC-34 cell kind reducers', () => {
  const actionBase = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1' };
  const BLIND_ENDS = { left: { type: 'blind', width: null }, right: { type: 'filler', width: null } };
  const splitA = (overrides = {}) => elevationReducer(stateWithRun(run({
    autoCount: false, items: [fixed('a', 30), auto('b')], ...overrides,
  })), splitCell({ ...actionBase, cellId: 'a', direction: 'down', count: 2 }));
  const stackOf = (state) => currentRun(state).grid.cells[0].node;
  const leafOf = (state, id) => gridLeaves(currentRun(state).grid).find((leaf) => leaf.id === id);
  const blindIds = (state) => gridLeaves(currentRun(state).grid)
    .filter((leaf) => leaf.blind).map((leaf) => leaf.id);

  it('sets blind per cell, and the run field resizes only blind cells', () => {
    let state = splitA({ ends: BLIND_ENDS, blind: { left: 36, right: null } });
    const lower = stackOf(state).cells[1].node.id;
    expect(blindIds(state)).toEqual(['a', lower]);
    state = elevationReducer(state, setCellBlind({ ...actionBase, cellId: lower, side: 'left', width: null }));
    expect(blindIds(state)).toEqual(['a']);
    state = elevationReducer(state, setRunBlind({ ...actionBase, side: 'left', width: 30 }));
    expect(leafOf(state, 'a').blind).toEqual({ left: 30 });
    expect(blindIds(state)).toEqual(['a']);
    expect(elevationReducer(state, setCellBlind({ ...actionBase, cellId: 'b', side: 'right', width: 30 })))
      .toBe(state);
  });

  it('changes a cell\'s kind and clears the face path', () => {
    let state = splitA();
    const lower = stackOf(state).cells[1].node.id;
    state = elevationReducer(state, setSelection({ runId: 'run-1', pieceId: lower }));
    state = elevationReducer(state, setFacePath('r'));
    state = elevationReducer(state, setCellKind({ ...actionBase, cellId: lower, kind: 'shelves' }));
    expect(leafOf(state, lower)).toEqual({ id: lower, kind: 'shelves', shelves: { count: 2, back: false } });
    expect(state.facePath).toBeNull();
    expect(elevationReducer(state, setCellKind({ ...actionBase, cellId: 'b', kind: 'filler' }))).toBe(state);
  });

  it('sets shelves count and back', () => {
    let state = splitA();
    const lower = stackOf(state).cells[1].node.id;
    state = elevationReducer(state, setCellKind({ ...actionBase, cellId: lower, kind: 'shelves' }));
    state = elevationReducer(state, setCellShelves({ ...actionBase, cellId: lower, count: 4, back: true }));
    expect(leafOf(state, lower).shelves).toEqual({ count: 4, back: true });
    expect(elevationReducer(state, setCellShelves({ ...actionBase, cellId: lower, count: Number.NaN })))
      .toBe(state);
  });

  it('sets depth and align, never deeper than the run', () => {
    let state = splitA();
    const lower = stackOf(state).cells[1].node.id;
    state = elevationReducer(state, setCellDepth({ ...actionBase, cellId: lower, depth: 21, align: 'back' }));
    expect(leafOf(state, lower)).toMatchObject({ depth: 21, align: 'back' });
    expect(elevationReducer(state, setCellDepth({ ...actionBase, cellId: lower, depth: 30 }))).toBe(state);
    state = elevationReducer(state, setCellDepth({ ...actionBase, cellId: lower, depth: null }));
    expect(leafOf(state, lower)).not.toHaveProperty('depth');
    expect(leafOf(state, lower).align).toBe('back');
  });

  it('wraps a cell in panels at the run\'s end panel thickness', () => {
    const state = elevationReducer(
      stateWithRun(run({ autoCount: false, items: [fixed('a', 30), auto('b')] })),
      wrapCell({ ...actionBase, cellId: 'a', through: 'sides', bottom: true }),
    );
    const outer = stackOf(state);
    expect(currentRun(state).grid.cols[0]).toEqual({ id: `${outer.id}:col`, size: 30, sizeMode: 'manual' });
    expect(outer.cols.map((col) => col.size)).toEqual([0.75, null, 0.75]);
    expect(outer.cells.map((entry) => entry.node.kind ?? 'grid')).toEqual(['panel', 'grid', 'panel']);
    const inner = outer.cells[1].node;
    expect(inner.rows.map((row) => row.size)).toEqual([0.75, null, 0.75]);
    expect(inner.cells.map((entry) => entry.node.id === 'a' ? 'a' : entry.node.kind))
      .toEqual(['panel', 'a', 'panel']);
  });
});

describe('SPEC-34.1 panel reducers', () => {
  const actionBase = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1' };
  const start = (overrides = {}) => stateWithRun(run({
    autoCount: true, items: [fixed('a', 30), auto('b')], ...overrides,
  }));
  const stackOf = (state) => currentRun(state).grid.cells[0].node;
  const leafOf = (state, id) => gridLeaves(currentRun(state).grid).find((leaf) => leaf.id === id);

  it('turns a top-level cabinet into a side panel, a back panel, and back', () => {
    let state = elevationReducer(start(), setCellKind({ ...actionBase, cellId: 'a', kind: 'panel' }));
    expect(leafOf(state, 'a')).toEqual({ id: 'a', kind: 'panel' });
    expect(currentRun(state).grid.cols[0]).toEqual({ id: 'a:col', size: 0.75, sizeMode: 'manual' });
    expect(currentRun(state).autoCount).toBe(false);
    state = elevationReducer(state, setPanelType({ ...actionBase, cellId: 'a', type: 'back' }));
    expect(currentRun(state).grid.cols[0]).toEqual({ id: 'a:col', size: null, sizeMode: 'auto' });
    expect(leafOf(state, 'a')).toEqual({ id: 'a', kind: 'panel', depth: 0.75, align: 'back' });
    state = elevationReducer(state, setCellKind({ ...actionBase, cellId: 'a', kind: 'cabinet' }));
    expect(leafOf(state, 'a')).toEqual({ id: 'a', kind: 'cabinet' });
  });

  it('gives a stacked panel the top/bottom type', () => {
    let state = elevationReducer(start({ autoCount: false }), splitCell({
      ...actionBase, cellId: 'a', direction: 'down', count: 2,
    }));
    const lower = stackOf(state).cells[1].node.id;
    const trackId = stackOf(state).rows[1].id;
    state = elevationReducer(state, setCellKind({ ...actionBase, cellId: lower, kind: 'panel' }));
    expect(stackOf(state).rows[1]).toEqual({ id: trackId, size: 0.75, sizeMode: 'manual' });
    expect(elevationReducer(state, setPanelType({ ...actionBase, cellId: lower, type: 'side' }))).toBe(state);
  });

  it('adds panels beside and above cells', () => {
    let state = elevationReducer(start(), addPanel({ ...actionBase, cellId: 'b', side: 'left' }));
    const items = runItems(currentRun(state));
    expect(items.map(({ kind }) => kind)).toEqual(['cabinet', 'panel', 'cabinet']);
    expect(items[1].width).toBe(0.75);
    expect(items[2].id).toBe('b');
    expect(currentRun(state).autoCount).toBe(false);
    state = elevationReducer(state, addPanel({ ...actionBase, cellId: 'a', side: 'above' }));
    expect(stackOf(state).rows.map(({ size }) => size)).toEqual([0.75, null]);
    expect(stackOf(state).cells.map((entry) => entry.node.kind)).toEqual(['panel', 'cabinet']);
  });

  it('sets a panel\'s doors', () => {
    let state = elevationReducer(start(), setCellKind({ ...actionBase, cellId: 'a', kind: 'panel' }));
    state = elevationReducer(state, setPanelDoors({ ...actionBase, cellId: 'a', doors: 'cover' }));
    expect(leafOf(state, 'a')).toEqual({ id: 'a', kind: 'panel', doors: 'cover' });
    expect(elevationReducer(state, setPanelDoors({ ...actionBase, cellId: 'a', doors: 'x' }))).toBe(state);
    state = elevationReducer(state, setPanelDoors({ ...actionBase, cellId: 'a', doors: 'flush' }));
    expect(leafOf(state, 'a')).toEqual({ id: 'a', kind: 'panel' });
  });
});
