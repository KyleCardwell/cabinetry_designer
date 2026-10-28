import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { run } from '../../../test/builders.js';
import elevationReducer, { createInitialElevationState, splitCell } from '../../store/elevationSlice.js';
import { equalizeGridCells, findLeaf, removeGridCell, setGridTrackSize,
  splitGridCell, unsplitGridCell } from '../cellTree.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { gridLeaves, rootItems } from '../grid.js';
import { resolveWall } from '../room.js';
import { runScene } from '../runScene.js';

const stored = JSON.parse(readFileSync(new URL('./fixtures/room9b.json', import.meta.url), 'utf8'));
const BACK = 'a23ef60a-20d0-4490-9598-768dcfd2c75d';
const SIDE = '3924953e-f0ab-4e7c-9e46-f60a0c3146ba';
const panel = { kind: 'panel', depth: 0.8125, align: 'back', styleId: 'default', baseUnder: true };
const ids = () => { let n = 0; return () => `split-${++n}`; };

function splitStored(cellId, direction) {
  const wall = stored.walls.find(({ name }) => name === 'Wall 4');
  const run = wall.runs.find(({ grid }) => gridLeaves(grid).some(({ id }) => id === cellId));
  const initial = createInitialElevationState({ rooms: [structuredClone(stored)],
    settings: { ...DEFAULT_SETTINGS, ...stored.settingsOverrides }, activeRoomId: stored.id });
  const state = elevationReducer(initial, splitCell({ wallId: wall.id, runId: run.id,
    cellId, direction, count: 2 }));
  const room = state.rooms[0];
  const syncedWall = resolveWall(room, room.walls.find(({ id }) => id === wall.id), run.wallSide);
  const syncedRun = syncedWall.runs.find(({ id }) => id === run.id);
  return { run: syncedRun, scene: runScene(room, syncedWall, syncedRun, state.settings) };
}

describe('FX5 step e split panel cells', () => {
  it('anchor 1: splits Room 9b Wall 4 back panel down into two 12 1/4 inch panels', () => {
    const { run, scene } = splitStored(BACK, 'down');
    const stack = run.grid.cells[0].node;
    expect(stack.rows).toHaveLength(2);
    expect(stack.cols).toHaveLength(1);
    expect(stack.cells.map(({ node }) => node)).toEqual([
      { id: BACK, ...panel }, { id: expect.any(String), ...panel },
    ]);
    expect(scene.cells.pieces.filter(({ columnId }) => columnId === stack.id)
      .map(({ kind, height }) => [kind, height])).toEqual([['panel', 12.25], ['panel', 12.25]]);
  });

  it('anchor 2: splits the back panel across into three automatic root panel columns', () => {
    const { run } = splitStored(BACK, 'across');
    const items = rootItems(run.grid);
    expect(items).toHaveLength(3);
    expect(items.slice(0, 2)).toEqual([
      { id: BACK, ...panel, width: null },
      { id: expect.any(String), ...panel, width: null },
    ]);
    expect(items.every(({ kind, width }) => kind === 'panel' && width === null)).toBe(true);
    expect(run.autoCount).toBe(false);
  });

  it('anchor 3: keeps the front side panel column at a manual 0.75 inches when stacked', () => {
    const { run, scene } = splitStored(SIDE, 'down');
    const stack = run.grid.cells[1].node;
    expect(run.grid.cols[1]).toMatchObject({ size: 0.75, sizeMode: 'manual' });
    expect(stack.rows).toHaveLength(2);
    expect(stack.cells.map(({ node }) => node)).toEqual([
      { id: SIDE, kind: 'panel' }, { id: expect.any(String), kind: 'panel' },
    ]);
    expect(scene.cells.pieces.filter(({ columnId }) => columnId === stack.id)
      .map(({ kind, width }) => [kind, width])).toEqual([['panel', 0.75], ['panel', 0.75]]);
  });

  it('anchor 4: copies only panel properties and keeps doors, sizes and extend on the original', () => {
    const leaf = { id: 'panel', ...panel, doors: 'cover', sizes: { depth: 12 }, extend: { left: 2 } };
    const grid = run({ items: [{ ...leaf, width: 30 }] }).grid;
    const split = splitGridCell(grid, leaf.id, 'down', 2, ids());
    expect(gridLeaves(split)).toEqual([leaf, { id: expect.any(String), ...panel }]);
    expect(gridLeaves(grid)).toEqual([leaf]);
    expect(split.cols[0]).toMatchObject({ size: 30, sizeMode: 'manual' });
  });

  it('supports flat and perpendicular nested panel splits, Make equal, Unsplit and Remove', () => {
    const grid = run({ items: [{ id: 'panel', ...panel, width: 30 }] }).grid;
    const makeId = ids();
    const stack = splitGridCell(grid, 'panel', 'down', 2, makeId);
    const sized = setGridTrackSize(stack, stack.cells[0].node.rows[0].id, 8);
    expect(equalizeGridCells(sized, 'panel')).toEqual(stack);
    const flat = splitGridCell(sized, 'panel', 'down', 2, makeId);
    expect(flat.cells[0].node.rows).toHaveLength(3);
    expect(flat.cells[0].node.rows.every(({ size }) => size === null)).toBe(true);
    const nested = splitGridCell(flat, 'panel', 'across', 2, makeId);
    const across = nested.cells[0].node.cells[0].node;
    expect(across.cols).toHaveLength(2);
    expect(gridLeaves(nested).every((leaf) => Object.entries(panel)
      .every(([key, value]) => leaf[key] === value))).toBe(true);
    expect(unsplitGridCell(nested, 'panel')).toEqual(flat);
    expect(removeGridCell(nested, across.cells[1].node.id)).toEqual(flat);
    expect(unsplitGridCell(stack, 'panel')).toEqual(grid);
    expect(removeGridCell(stack, stack.cells[0].node.cells[1].node.id)).toEqual(grid);
    expect(findLeaf(stack, 'panel')).toEqual({ id: 'panel', ...panel });
  });
});
