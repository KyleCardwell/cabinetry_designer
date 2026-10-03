import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  CABINET_TYPE_IDS,
} from '../../model/constants.js';
import {
  gridLeaves,
  runBlind,
  runItems,
} from '../../model/grid.js';
import elevationReducer, {
  addItemAfter,
  addRun,
  dissolveJoint,
  freeRunStack,
  lockItem,
  joinRunEdges,
  joinRunStack,
  removeItem,
  replaceRun,
  resizeRun,
  setRoomStyle,
  setRunFaceOptions,
  setRunBottom,
  setRunSeamGap,
  setRunTFiller,
  setItemTFiller,
  setRunStyle,
  setRunBlind,
  setRunEndFiller,
  setRunAnchor,
  setRunJointOffset,
  setRunStackOffset,
  setRunEnd,
  setTrackGap,
  splitItem,
  updateRun,
  updateRoomProfile,
  updateWall,
  useAutoHeightsForRoom,
} from '../elevationSlice.js';
import {
  auto,
  fixed,
  run,
  opening,
  stateWithRun,
  currentRun,
} from './helpers/sliceFixtures.js';

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

describe('SPEC-35 stack reducers', () => {
  function stackState() {
    const state = stateWithRun();
    state.rooms[0].walls[0].runs = [
      run({ id: 'B', x: 0, width: 60, heightMode: 'auto', autoCount: false, items: [auto('B-cabinet')] }),
      run({
        id: 'U', cabinetTypeId: CABINET_TYPE_IDS.UPPER, x: 0, width: 60, z: 54, height: 36, depth: 12,
        heightMode: 'auto', autoCount: false, items: [auto('U-cabinet')],
      }),
      run({
        id: 'M', cabinetTypeId: CABINET_TYPE_IDS.UPPER, x: 0, width: 60, z: 40, height: 10, depth: 12,
        autoCount: false, items: [auto('M-cabinet')],
      }),
    ];
    return state;
  }
  const runById = (state, id) => state.rooms[0].walls[0].runs.find((entry) => entry.id === id);
  const at = { wallId: 'wall-1', runId: 'M' };

  it('stacks a run, gaps it, refuses a loop and frees it', () => {
    let state = elevationReducer(stackState(), joinRunStack({ ...at, edge: 'below', leaderRunId: 'B' }));
    expect(state.message).toBeNull();
    expect(runById(state, 'M')).toMatchObject({ z: 36, height: 10 });

    state = elevationReducer(state, joinRunStack({ ...at, edge: 'above', leaderRunId: 'U' }));
    expect(runById(state, 'M')).toMatchObject({ z: 36, height: 18 });

    state = elevationReducer(state, setRunStackOffset({ ...at, edge: 'below', offset: 1 }));
    expect(runById(state, 'M')).toMatchObject({ z: 37, height: 17 });

    state = elevationReducer(state, joinRunStack({
      wallId: 'wall-1', runId: 'B', edge: 'below', leaderRunId: 'M',
    }));
    expect(state.message).toBe('stack-cycle');
    expect(runById(state, 'B').stack).toBeUndefined();

    state = elevationReducer(state, freeRunStack({ ...at, edge: 'above' }));
    expect(runById(state, 'M').stack).toEqual({ below: { runId: 'B', offset: 1 }, above: null });
    expect(runById(state, 'M')).toMatchObject({ z: 37, height: 17 });
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

describe('SPEC-36 gap reducers', () => {
  const actionBase = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1' };
  const NONE = { type: 'none', width: null };

  it('sets and clears the run seam gap and track gaps, and a beaded style sets the default', () => {
    let state = stateWithRun(run({
      autoCount: false, width: 36.5, ends: { left: NONE, right: NONE }, items: [auto('a'), auto('b')],
    }));
    state = elevationReducer(state, setRunSeamGap({ ...actionBase, gap: 0.5 }));
    expect(currentRun(state)).toMatchObject({ seamGap: 0.5, _seamGap: 0.5 });
    expect(elevationReducer(state, setRunSeamGap({ ...actionBase, gap: -1 }))).toBe(state);
    expect(elevationReducer(state, setRunSeamGap({ ...actionBase, gap: 0.5 }))).toBe(state);

    state = elevationReducer(state, setTrackGap({ ...actionBase, trackId: 'a:col', gap: 1 }));
    expect(currentRun(state).grid.cols[0].gap).toBe(1);
    expect(elevationReducer(state, setTrackGap({ ...actionBase, trackId: 'nope', gap: 1 }))).toBe(state);
    state = elevationReducer(state, setTrackGap({ ...actionBase, trackId: 'a:col', gap: null }));
    expect('gap' in currentRun(state).grid.cols[0]).toBe(false);

    state = elevationReducer(state, setRunSeamGap({ ...actionBase, gap: null }));
    expect('seamGap' in currentRun(state)).toBe(false);
    expect('_seamGap' in currentRun(state)).toBe(false);

    state = elevationReducer(state, setRoomStyle({ roomId: 'room-1', style: { cabinetStyleId: 15 } }));
    expect(currentRun(state)._seamGap).toBe(0.5);
    state = elevationReducer(state, setRunStyle({ ...actionBase, style: { cabinetStyleId: 13 } }));
    expect('_seamGap' in currentRun(state)).toBe(false);
  });
});

describe('SPEC-37 T-filler shape actions', () => {
  const setup = () => {
    const state = stateWithRun(run({ items: [auto('a'), auto('b')] }));
    return { state, base: { roomId: state.rooms[0].id, wallId: 'wall-1', runId: 'run-1' } };
  };
  const currentRun = (state) => state.rooms[0].walls[0].runs[0];
  const leaf = (state, id) => gridLeaves(currentRun(state).grid).find((candidate) => candidate.id === id);

  it('sets and clears the run setting, and rejects other values', () => {
    let { state, base } = setup();
    state = elevationReducer(state, setRunTFiller({ ...base, value: 'seams' }));
    expect(currentRun(state).tFiller).toBe('seams');
    state = elevationReducer(state, setRunTFiller({ ...base, value: 'all' }));
    expect(currentRun(state).tFiller).toBe('all');
    state = elevationReducer(state, setRunTFiller({ ...base, value: 'vertical' }));
    expect(currentRun(state).tFiller).toBe('all');
    state = elevationReducer(state, setRunTFiller({ ...base, value: null }));
    expect('tFiller' in currentRun(state)).toBe(false);
  });

  it('sets, clears and ignores per-side overrides on cabinets', () => {
    let { state, base } = setup();
    state = elevationReducer(state, setItemTFiller({
      ...base,
      edits: [
        { itemId: 'a', side: 'right', value: true },
        { itemId: 'b', side: 'left', value: true },
        { itemId: 'b', side: 'top', value: false },
      ],
    }));
    expect(leaf(state, 'a').tFiller).toEqual({ right: true });
    expect(leaf(state, 'b').tFiller).toEqual({ left: true, top: false });
    state = elevationReducer(state, setItemTFiller({
      ...base,
      edits: [
        { itemId: 'a', side: 'right', value: null },
        { itemId: 'b', side: 'top', value: null },
        { itemId: 'b', side: 'middle', value: true },
        { itemId: 'b', side: 'bottom', value: 'yes' },
        { itemId: 'zz', side: 'left', value: true },
      ],
    }));
    expect('tFiller' in leaf(state, 'a')).toBe(false);
    expect(leaf(state, 'b').tFiller).toEqual({ left: true });
  });

  it('sets and clears an end filler\'s T-filler choice beside its other details', () => {
    let { state, base } = setup();
    state = elevationReducer(state, setRunEndFiller({ ...base, side: 'left', key: 'tFiller', value: true }));
    expect(currentRun(state).endFiller.left).toEqual({ width: null, returnDepth: null, tFiller: true });
    state = elevationReducer(state, setRunEndFiller({ ...base, side: 'left', key: 'width', value: 3 }));
    expect(currentRun(state).endFiller.left).toEqual({ width: 3, returnDepth: null, tFiller: true });
    state = elevationReducer(state, setRunEndFiller({ ...base, side: 'left', key: 'tFiller', value: false }));
    expect(currentRun(state).endFiller.left.tFiller).toBe(false);
    state = elevationReducer(state, setRunEndFiller({ ...base, side: 'left', key: 'tFiller', value: null }));
    state = elevationReducer(state, setRunEndFiller({ ...base, side: 'left', key: 'width', value: null }));
    expect(currentRun(state).endFiller).toEqual({ left: null, right: null });
  });
});

describe('SPEC-37.1 an end panel keeps its own T choice', () => {
  it('keeps the choice when the panel width changes, and clears it when the end type changes', () => {
    let state = stateWithRun(run({ items: [auto('a')] }));
    const base = { roomId: state.rooms[0].id, wallId: 'wall-1', runId: 'run-1' };
    const currentRun = () => state.rooms[0].walls[0].runs[0];

    state = elevationReducer(state, setRunEnd({ ...base, side: 'left', end: { type: 'end_panel', width: null } }));
    state = elevationReducer(state, setRunEndFiller({ ...base, side: 'left', key: 'tFiller', value: false }));
    expect(currentRun().endFiller.left).toEqual({ width: null, returnDepth: null, tFiller: false });

    state = elevationReducer(state, setRunEnd({ ...base, side: 'left', end: { type: 'end_panel', width: 0.8125 } }));
    expect(currentRun().endFiller.left).toEqual({ width: null, returnDepth: null, tFiller: false });

    state = elevationReducer(state, setRunEnd({ ...base, side: 'left', end: { type: 'filler', width: null } }));
    state = elevationReducer(state, setRunEnd({ ...base, side: 'left', end: { type: 'end_panel', width: null } }));
    expect(currentRun().endFiller.left).toBeNull();
  });
});
