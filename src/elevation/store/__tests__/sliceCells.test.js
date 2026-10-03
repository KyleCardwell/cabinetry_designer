import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  gridLeaves,
  runBlind,
  runItems,
} from '../../model/grid.js';
import elevationReducer, {
  addPanel,
  clearSelection,
  equalizeCells,
  lockItem,
  removeCell,
  removeItem,
  setCellBlind,
  setCellDepth,
  setCellExtend,
  setCellKind,
  setCellShelves,
  setPanelType,
  setPanelDoors,
  setFacePath,
  setItemFace,
  setItemReveals,
  setItemStyle,
  setRoomStyle,
  setRunFaceOptions,
  setRunStyle,
  setRunBlind,
  setRunEnd,
  setRunEndExtend,
  setSelection,
  setTrackSize,
  splitCell,
  splitItem,
  unlockItem,
  unsplitCell,
  wrapCell,
} from '../elevationSlice.js';
import {
  auto,
  fixed,
  run,
  stateWithRun,
  currentRun,
} from './helpers/sliceFixtures.js';

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
    expect(Object.keys(state.selection).sort()).toEqual([
      'openingId', 'pieceId', 'recessId', 'runId', 'soffitId', 'wallId',
    ]);
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

  it('47b. setRunFaceOptions sets and clears hanging', () => {
    let state = elevationReducer(styleState(), setRunFaceOptions({ ...at, hanging: true }));
    expect(currentRun(state).hanging).toBe(true);
    state = elevationReducer(state, setRunFaceOptions({ ...at, top: 'wood' }));
    expect(currentRun(state).hanging).toBe(true);
    state = elevationReducer(state, setRunFaceOptions({ ...at, hanging: false }));
    expect('hanging' in currentRun(state)).toBe(false);
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

describe('SPEC-35.3 extension reducers', () => {
  it('sets and clears run-end and panel or filler extensions', () => {
    let state = stateWithRun(run({
      items: [
        { ...fixed('panel', 0.75), kind: 'panel' },
        { ...auto('filler'), kind: 'filler' },
      ],
      ends: {
        left: { type: 'end_panel', width: 0.75 },
        right: { type: 'none', width: 0 },
      },
    }));
    const actionBase = {
      roomId: state.rooms[0].id,
      wallId: state.rooms[0].walls[0].id,
      runId: currentRun(state).id,
    };
    const target = { to: 'run', runId: 'other-run' };
    state = elevationReducer(state, setRunEndExtend({
      ...actionBase,
      side: 'left',
      direction: 'up',
      target,
    }));
    expect(currentRun(state).ends.left.extend).toEqual({ up: target });
    state = elevationReducer(state, setRunEnd({
      ...actionBase,
      side: 'left',
      end: { type: 'filler', width: 2 },
    }));
    expect(currentRun(state).ends.left.extend).toEqual({ up: target });
    expect(elevationReducer(state, setRunEndExtend({
      ...actionBase,
      side: 'right',
      direction: 'up',
      target,
    }))).toBe(state);
    state = elevationReducer(state, setRunEndExtend({
      ...actionBase,
      side: 'left',
      direction: 'up',
      target: null,
    }));
    expect(currentRun(state).ends.left.extend).toBeUndefined();

    state = elevationReducer(state, setCellExtend({
      ...actionBase,
      cellId: 'panel',
      direction: 'down',
      target,
    }));
    expect(gridLeaves(currentRun(state).grid).find(({ id }) => id === 'panel').extend)
      .toEqual({ down: target });
    state = elevationReducer(state, setCellExtend({
      ...actionBase,
      cellId: 'panel',
      direction: 'down',
      target: null,
    }));
    expect(gridLeaves(currentRun(state).grid).find(({ id }) => id === 'panel').extend)
      .toBeUndefined();
  });
});

