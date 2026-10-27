import { describe, expect, it } from 'vitest';
import { auto, room, run, wall } from '../../../test/builders.js';
import { columnLayoutOf } from '../../model/cellTree.js';
import { gridLeaves, rootItems } from '../../model/grid.js';
import { columnRun } from '../../model/__tests__/fixtures/columnLayout.js';
import elevationReducer, {
  applyColumnToRun, createInitialElevationState, pasteColumn, removeColumn, removeItem, setClipboard,
} from '../elevationSlice.js';

const at = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1' };
const setup = (existingRun = columnRun()) => ({
  ...createInitialElevationState(null),
  activeRoomId: 'room-1', activeWallId: 'wall-1',
  rooms: [room({ walls: [wall({ runs: [existingRun] })] })],
});
const currentRun = (state) => state.rooms[0].walls[0].runs[0];

describe('DR1 column reducers', () => {
  it('pastes a column clipboard across runs, preserves the clipboard, and skips invalid requests', () => {
    const layout = columnLayoutOf(columnRun().grid, 'B2');
    let state = setup(run({ autoCount: false, items: [auto('target')] }));
    for (const clipboard of [null, { kind: 'midLayout', data: layout }]) {
      const before = elevationReducer(state, setClipboard(clipboard));
      expect(elevationReducer(before, pasteColumn({ ...at, cellId: 'target' }))).toBe(before);
    }
    state = elevationReducer(state, setClipboard({ kind: 'columnLayout', data: layout }));
    const clipboard = state.clipboard;
    const next = elevationReducer(state, pasteColumn({ ...at, cellId: 'target' }));
    expect(currentRun(next).grid.cells[0].node).toMatchObject({ id: 'target', rows: layout.node.rows.map((row) => ({
      size: row.size, sizeMode: row.sizeMode,
    })) });
    expect(gridLeaves(currentRun(next).grid)).toHaveLength(2);
    expect(next.clipboard).toBe(clipboard);
    expect(currentRun(state).grid.cells[0].node.kind).toBe('cabinet');
    for (const patch of [{ cellId: 'missing' }, { wallId: 'missing' }, { runId: 'missing' }, { roomId: 'missing' }]) {
      expect(elevationReducer(next, pasteColumn({ ...at, cellId: 'target', ...patch }))).toBe(next);
    }
    const same = elevationReducer(setup(), setClipboard({ kind: 'columnLayout', data: layout }));
    expect(elevationReducer(same, pasteColumn({ ...at, cellId: 'B2' }))).toBe(same);
  });

  it('anchor 5: applies B1 to A and C together, preserving widths, the source and filler, without using the clipboard', () => {
    const existingRun = columnRun();
    const filler = run({ items: [{ id: 'F', kind: 'filler', width: 3 }] }).grid;
    existingRun.grid.cols.splice(2, 0, filler.cols[0]);
    existingRun.grid.cells[2].col = 3;
    existingRun.grid.cells.splice(2, 0, { ...filler.cells[0], col: 2 });
    let state = setup(existingRun);
    state = elevationReducer(state, setClipboard({ kind: 'other', data: { saved: true } }));
    const before = currentRun(state).grid;
    const next = elevationReducer(state, applyColumnToRun({ ...at, cellId: 'B1' }));
    const grid = currentRun(next).grid;
    expect(grid.cells[1].node).toEqual(before.cells[1].node);
    expect(grid.cells[2]).toEqual(before.cells[2]);
    expect(grid.cols[2]).toEqual(before.cols[2]);
    for (const col of [0, 3]) {
      expect(grid.cells[col].node.id).toBe(before.cells[col].node.id);
      expect(grid.cells[col].node.rows.map(({ size, sizeMode }) => ({ size, sizeMode }))).toEqual([
        { size: 25.25, sizeMode: 'manual' }, { size: null, sizeMode: 'auto' },
      ]);
      expect(grid.cols[col]).toEqual({ ...before.cols[col], top: { value: 2, source: 'manual' } });
    }
    const ids = gridLeaves(grid).map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id === 'B1' || id === 'B2')).toEqual(['B1', 'B2']);
    expect(next.clipboard).toBe(state.clipboard);
    expect(currentRun(state).grid).toBe(before);
    expect(before.cells[0].node.kind).toBe('cabinet');
    expect(currentRun(next).autoCount).toBe(false);
  });

  it('anchor 6: removes the root containing B2, clears any selection inside it, and follows removeItem for the last column', () => {
    for (const selected of ['B', 'B1', 'B2', 'A']) {
      const state = setup(columnRun({ autoCount: true }));
      state.selection = { runId: 'run-1', pieceId: selected, openingId: null, soffitId: null,
        recessId: null, wallId: 'wall-1' };
      state.facePath = 'r.0';
      state.interiorPath = 'r.1';
      state.interiorDivider = 'divider';
      const next = elevationReducer(state, removeColumn({ ...at, cellId: 'B2' }));
      expect(rootItems(currentRun(next).grid).map(({ id }) => id)).toEqual(['A', 'C']);
      expect(currentRun(next).autoCount).toBe(false);
      expect(next.selection).toEqual({ ...state.selection, pieceId: selected === 'A' ? 'A' : null });
      expect(next.facePath).toBe(selected === 'A' ? 'r.0' : null);
      expect(next.interiorPath).toBe(selected === 'A' ? 'r.1' : null);
      expect(next.interiorDivider).toBe(selected === 'A' ? 'divider' : null);
    }
    const last = setup(run({ items: [auto('last')] }));
    const removed = elevationReducer(last, removeColumn({ ...at, cellId: 'last' }));
    expect(removed).toEqual(elevationReducer(last, removeItem({ ...at, itemId: 'last' })));
    expect(currentRun(removed).grid.cols).toHaveLength(0);
  });

  it('ignores missing columns and locations and respects read-only rooms and issued versions', () => {
    const state = setup();
    for (const action of [applyColumnToRun, removeColumn]) {
      for (const patch of [{ cellId: 'missing' }, { wallId: 'missing' }, { runId: 'missing' }, { roomId: 'missing' }]) {
        expect(elevationReducer(state, action({ ...at, cellId: 'B2', ...patch }))).toBe(state);
      }
    }
    const copy = elevationReducer(state, setClipboard({ kind: 'columnLayout', data: columnLayoutOf(currentRun(state).grid, 'B2') }));
    for (const locked of [{ ...copy, source: 'version' }, { ...copy, cloud: { room: { readOnly: true } } }]) {
      for (const action of [pasteColumn, applyColumnToRun, removeColumn]) {
        expect(elevationReducer(locked, action({ ...at, cellId: 'A' }))).toBe(locked);
      }
    }
    const only = setup(run({ autoCount: false, items: [auto('only')] }));
    expect(elevationReducer(only, applyColumnToRun({ ...at, cellId: 'only' }))).toBe(only);
  });
});
