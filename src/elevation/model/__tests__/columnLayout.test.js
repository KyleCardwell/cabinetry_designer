import { describe, expect, it } from 'vitest';
import { columnLayoutOf, pasteColumnLayout } from '../cellTree.js';
import { gridLeaves, runBlind, setGridBlind, updateRootItem } from '../grid.js';
import { auto, run } from '../../../test/builders.js';
import { columnRun } from './fixtures/columnLayout.js';

const nodeIds = (value) => {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, entry]) => key === 'id' ? [entry] : nodeIds(entry));
};

describe('DR1 column layouts', () => {
  it('anchor 1: copies the root stack and steps from any nested leaf, deeply and without placement', () => {
    const grid = columnRun().grid;
    const source = grid.cells[1].node;
    source.cells[0].node.reveals = { top: 0.125 };
    source.cells[0].node.style = { cabinetStyleId: 14 };
    source.cells[0].node.interior = { items: [{ id: 'shelf', accessory: { id: 'accessory' } }] };
    const layout = columnLayoutOf(grid, 'B2');
    expect(layout).toEqual({ node: source, top: { value: 2, source: 'manual' } });
    expect(layout.node.id).toBe('B');
    expect(layout.node.cells).toHaveLength(2);
    for (const key of ['size', 'sizeMode', 'pin', 'attach', 'absorb', 'gap', 'blind']) {
      expect(layout).not.toHaveProperty(key);
    }
    layout.node.cells[0].node.reveals.top = 1;
    layout.node.cells[0].node.style.cabinetStyleId = 1;
    layout.node.cells[0].node.interior.items[0].accessory.id = 'changed';
    layout.node.rows[0].size = 8;
    layout.top.value = 9;
    expect(source.cells[0].node.reveals.top).toBe(0.125);
    expect(source.cells[0].node.style.cabinetStyleId).toBe(14);
    expect(source.cells[0].node.interior.items[0].accessory.id).toBe('accessory');
    expect(source.rows[0].size).toBe(25.25);
    expect(grid.cols[1].top.value).toBe(2);
    expect(columnLayoutOf(grid, 'missing')).toBeNull();
  });

  it('anchor 2: preserves the target track and root id, and refreshes every contained id', () => {
    const grid = columnRun().grid;
    grid.cols[2].id = 'custom-target-track';
    const source = grid.cells[1].node;
    source.cells[0].node.interior = { id: 'interior', items: [
      { id: 'accessory', accessoryId: 'library-accessory', shape: { id: 'shape', points: [{ x: 2, y: 3 }] } },
    ] };
    const layout = columnLayoutOf(grid, 'B2');
    const snapshot = structuredClone(layout);
    let sequence = 0;
    const pasted = pasteColumnLayout(grid, 'C', layout, () => `fresh-${sequence++}`);
    const target = pasted.cells[2].node;
    expect(target.id).toBe('C');
    expect(target.rows.map(({ size, sizeMode }) => ({ size, sizeMode }))).toEqual([
      { size: 25.25, sizeMode: 'manual' }, { size: null, sizeMode: 'auto' },
    ]);
    expect(pasted.cols[2]).toEqual({ ...grid.cols[2], top: { value: 2, source: 'manual' } });
    const ids = nodeIds(target);
    expect(ids).toHaveLength(nodeIds(source).length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => !nodeIds(source).includes(id))).toBe(true);
    expect(target.cells[0].node.interior.items[0].accessoryId).toBe('library-accessory');
    target.cells[0].node.interior.items[0].shape.points[0].x = 9;
    expect(layout).toEqual(snapshot);
    expect(grid.cells[2].node).toEqual({ id: 'C', kind: 'cabinet' });
  });

  it('anchor 3: makes distinct descendant ids on two separate pastes onto the same column', () => {
    const grid = columnRun().grid;
    const layout = columnLayoutOf(grid, 'B2');
    let sequence = 0;
    const makeId = () => `fresh-${sequence++}`;
    const first = pasteColumnLayout(grid, 'A', layout, makeId);
    const second = pasteColumnLayout(first, gridLeaves(first.cells[0].node)[1].id, layout, makeId);
    const firstIds = nodeIds(first.cells[0].node).filter((id) => id !== 'A');
    const secondIds = nodeIds(second.cells[0].node).filter((id) => id !== 'A');
    expect(secondIds.every((id) => !firstIds.includes(id))).toBe(true);
  });

  it('anchor 4: returns the same grid for an unchanged source and skipped or missing targets', () => {
    const grid = columnRun().grid;
    const layout = columnLayoutOf(grid, 'B2');
    const makeId = () => { throw new Error('a no-op must not generate ids'); };
    expect(pasteColumnLayout(grid, 'B', layout, makeId)).toBe(grid);
    expect(pasteColumnLayout(grid, 'B1', layout, makeId)).toBe(grid);
    expect(pasteColumnLayout(grid, 'missing', layout, makeId)).toBe(grid);
    expect(pasteColumnLayout(grid, 'A', null, makeId)).toBe(grid);
    for (const kind of ['filler', 'panel', 'void', 'shelves']) {
      const other = run({ items: [{ id: 'skip', kind, width: 3 }] }).grid;
      expect(pasteColumnLayout(other, 'skip', layout, makeId)).toBe(other);
    }
    const changed = updateRootItem(grid, 'B', { top: { value: 3, source: 'manual' } });
    let sequence = 0;
    const restored = pasteColumnLayout(changed, 'B2', layout, () => `fresh-${sequence++}`);
    expect(restored).not.toBe(changed);
    expect(restored.cols[1].top.value).toBe(2);
  });

  it('clears absent steps, keeps blinds at run ends, and supports leaf and cross-run layouts', () => {
    const grid = setGridBlind(setGridBlind(columnRun().grid, 'left', 8), 'right', 9);
    const layout = columnLayoutOf(grid, 'A');
    expect(layout.node).not.toHaveProperty('blind');
    let sequence = 0;
    const makeId = () => `fresh-${sequence++}`;
    const pasted = pasteColumnLayout(grid, 'B1', layout, makeId);
    expect(pasted.cells[1].node).toEqual({ id: 'B', kind: 'cabinet', face: { type: 'open' } });
    expect(pasted.cols[1]).not.toHaveProperty('top');
    expect(pasted.cells[1].node).not.toHaveProperty('blind');
    expect(runBlind({ grid: pasted })).toEqual({ left: 8, right: 9 });
    const other = run({ items: [auto('other')] }).grid;
    const stack = columnLayoutOf(grid, 'B2');
    stack.bottom = { value: 1, source: 'manual' };
    const right = pasteColumnLayout(grid, 'C', stack, makeId);
    expect(gridLeaves(right.cells[2].node).map((leaf) => leaf.blind)).toEqual([{ right: 9 }, { right: 9 }]);
    expect(right.cols[2].bottom.value).toBe(1);
    const cleared = pasteColumnLayout(right, 'C', layout, makeId);
    expect(cleared.cols[2]).not.toHaveProperty('bottom');
    const across = pasteColumnLayout(other, 'other', stack, makeId);
    expect(across.cells[0].node.id).toBe('other');
    expect(runBlind({ grid: across })).toBeUndefined();
  });
});
