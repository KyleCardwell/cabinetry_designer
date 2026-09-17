import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { runFootprint } from '../../model/footprints.js';
import { wallFrame } from '../../model/geometry.js';
import elevationReducer, {
  addRoom,
  addItemAfter,
  addRun,
  createInitialElevationState,
  lockItem,
  moveWallEndpoint,
  moveWallPerpendicular,
  removeItem,
  setActiveRoom,
  setRunEnd,
  splitItem,
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

function stateWithRun(existingRun = null) {
  return {
    schemaVersion: 2,
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
      }],
    }],
    activeRoomId: 'room-1',
    activeWallId: 'wall-1',
    view: 'elevation',
    selection: { runId: null, pieceId: null },
    tool: 'select',
    message: null,
  };
}

function currentRun(state) {
  return state.rooms[0].walls[0].runs[0];
}

describe('elevation room reducers', () => {
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
