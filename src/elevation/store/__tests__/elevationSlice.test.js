import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { runFootprint } from '../../model/footprints.js';
import { wallFrame } from '../../model/geometry.js';
import { openingGeometry } from '../../model/openings.js';
import elevationReducer, {
  addOpening,
  resizeOpening,
  addRoom,
  addItemAfter,
  addRun,
  addWall,
  addWallSegment,
  centerRoomOnOrigin,
  clearSelection,
  createInitialElevationState,
  deleteOpening,
  deleteRun,
  deleteWall,
  dissolveJoint,
  lockItem,
  moveOpening,
  moveWallEndpoint,
  moveWallPerpendicular,
  removeItem,
  replaceRun,
  resizeRun,
  setOpeningMeasureMode,
  setOpeningOffsetAnchor,
  setOpeningOffsetSide,
  setItemAbsorb,
  setItemPin,
  setActiveRoom,
  setFacePath,
  setItemFace,
  setItemReveals,
  setItemStyle,
  setRoomStyle,
  setRunFaceOptions,
  setRunStyle,
  setActiveWall,
  setRunCornerClearance,
  setRunAnchor,
  setRunJointOffset,
  setRunEnd,
  setSelection,
  setTool,
  setView,
  setWallLength,
  splitItem,
  updateOpening,
  updateRoomProfile,
  updateWall,
  useAutoHeightsForRoom,
} from '../elevationSlice.js';

function auto(id) {
  return { id, kind: 'cabinet', width: null };
}

function fixed(id, width) {
  return { id, kind: 'cabinet', width };
}

function run(overrides = {}) {
  return {
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
      runId: null, pieceId: null, openingId: null, wallId: 'wall-1',
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
      runId: null, pieceId: null, openingId: null, wallId: 'wall-1',
    });
    expect(elevationReducer(plan, clearSelection()).selection).toEqual({
      runId: null, pieceId: null, openingId: null, wallId: null,
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
      wallId: 'wall-2', runId: null, pieceId: null, openingId: null,
    });
  });

  it('2. clears all selection fields without changing the active wall', () => {
    const initial = stateWithRun(run());
    initial.selection = {
      wallId: 'wall-1', runId: 'run-1', pieceId: 'piece-1', openingId: null,
    };

    const next = elevationReducer(initial, clearSelection());
    expect(next.selection).toEqual({
      wallId: 'wall-1', runId: null, pieceId: null, openingId: null,
    });
    expect(next.activeWallId).toBe('wall-1');
  });

  it('3. selects the active wall when entering elevation view', () => {
    const initial = elevationReducer(stateWithRun(), setView('plan'));

    const next = elevationReducer(initial, setView('elevation'));
    expect(next.selection).toEqual({
      wallId: 'wall-1', runId: null, pieceId: null, openingId: null,
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
      wallId: 'wall-2', runId: null, pieceId: null, openingId: null,
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
    expect(currentRun(first).items.find((item) => item.id === 'b').width).toBeNull();

    const second = elevationReducer(first, setItemPin({
      wallId: 'wall-1',
      runId: 'run-1',
      itemId: 'd',
      pin: pin(84),
    }));
    expect(currentRun(second).items.filter((item) => item.pin).map((item) => item.width))
      .toEqual([23, 23]);

    const removed = elevationReducer(second, setItemPin({
      wallId: 'wall-1',
      runId: 'run-1',
      itemId: 'b',
      pin: null,
    }));
    expect(currentRun(removed).items.find((item) => item.id === 'b').width).toBe(23);

    const absorbing = elevationReducer(removed, setItemAbsorb({
      wallId: 'wall-1',
      runId: 'run-1',
      itemId: 'c',
      value: true,
    }));
    expect(currentRun(absorbing).items.find((item) => item.id === 'c').absorb).toBe(true);
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

    expect(currentRun(next).items).toHaveLength(4);
    expect(currentRun(next).items.every((item) => item.kind === 'cabinet' && item.width === null)).toBe(true);
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
    expect(currentRun(next).items).toHaveLength(3);
  });

  it('splits a cabinet into two auto cabinets and disables auto count', () => {
    const initial = stateWithRun(run({ items: [fixed('locked', 36)] }));
    const next = elevationReducer(
      initial,
      splitItem({ wallId: 'wall-1', runId: 'run-1', itemId: 'locked' }),
    );

    expect(currentRun(next).autoCount).toBe(false);
    expect(currentRun(next).items).toHaveLength(2);
    expect(currentRun(next).items.every((item) => item.kind === 'cabinet' && item.width === null)).toBe(true);
  });

  it('removes only the selected item and disables auto count', () => {
    const initial = stateWithRun(run({
      items: [auto('left'), { id: 'filler', kind: 'filler', width: 3 }, auto('right')],
    }));
    const next = elevationReducer(
      initial,
      removeItem({ wallId: 'wall-1', runId: 'run-1', itemId: 'filler' }),
    );

    expect(currentRun(next).items.map((item) => item.id)).toEqual(['left', 'right']);
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

    expect(currentRun(next).items[0]).toEqual({ id: 'cabinet', kind: 'cabinet', width: 29 });
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
    expect(currentRun(next).items).toHaveLength(3);
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
    expect(currentRun(next).items).toHaveLength(1);
    expect(currentRun(next).items[0]).toMatchObject({ kind: 'cabinet', width: null });
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
    expect(currentRun(deleted).items[0].pin).toBeNull();
    expect(deleted.selection).toEqual({
      runId: null, pieceId: null, openingId: null, wallId: 'wall-1',
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
    return currentRun(state).items.find((entry) => entry.id === id);
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
    return currentRun(state).items.find((entry) => entry.id === id);
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
    return currentRun(state).items.find((entry) => entry.id === id).face.children[0].size;
  }

  it('53. switching European and face frame resets small drawer fronts', () => {
    let state = elevationReducer(drawerState(), setRoomStyle({ roomId: 'room-1', style: { cabinetStyleId: 14 } }));
    expect(topSize(state, 'a')).toBe(5);
    expect(topSize(state, 'b')).toBe(5.875);
    expect(currentRun(state).items[2].face).toBeUndefined();

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
});
