import { describe, expect, it } from 'vitest';
import { auto, run as buildRun, wall as buildWall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { gridFromItems, runBlind, runItems, updateRootItem } from '../grid.js';
import { flipRunsForWall } from '../room.js';
import { syncAutoItems } from '../splitRun.js';

const NONE = { type: 'none', width: null };

describe('grid runs', () => {
  it('copies cabinet details with fresh identities when growing a grid run (AC1)', () => {
    const face = { id: 'face', direction: 'vertical', size: null, children: [
      { id: 'top', type: 'drawer_front', size: null },
      { id: 'bottom', type: 'drawer_front', size: null },
    ] };
    const result = syncAutoItems(
      buildRun({ id: 'r', x: 10, width: 96, ends: { left: NONE, right: NONE },
        items: [{ ...auto('a'), face, absorb: true, attach: { lineId: 'missing', at: 'center', offset: 0 } }],
        blind: { left: 36, right: null } }),
      DEFAULT_SETTINGS,
    );

    expect(result).not.toHaveProperty('items');
    expect(runItems(result)).toHaveLength(3);
    expect(runItems(result)[0].id).toBe('a');
    expect(runItems(result).every((item) => item.width === null)).toBe(true);
    expect(runBlind(result)).toEqual({ left: 36, right: null });
    expect(result.grid.id).toBe('r:grid');
    expect(result.grid.rows[0].id).toBe('r:row');
    const copies = runItems(result).slice(1);
    for (const copy of copies) {
      expect(copy.autoAdded).toBe(true);
      expect(copy).not.toHaveProperty('absorb');
      expect(copy).not.toHaveProperty('attach');
      expect(copy.face).not.toBe(face);
      expect(copy.face.children.map(({ type, size }) => ({ type, size })))
        .toEqual(face.children.map(({ type, size }) => ({ type, size })));
    }
    const ids = [face, ...face.children, ...copies.flatMap(({ face }) => [face, ...face.children])]
      .map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('removes auto-added grid columns and re-homes the right blind (AC1)', () => {
    const result = syncAutoItems(
      buildRun({ id: 'r', x: 10, width: 30, ends: { left: NONE, right: NONE },
        items: [auto('a'), { ...auto('b'), autoAdded: true }, { ...auto('c'), autoAdded: true }],
        blind: { left: null, right: 24 } }),
      DEFAULT_SETTINGS,
    );

    expect(runItems(result).map((item) => item.id)).toEqual(['a']);
    expect(runBlind(result)).toEqual({ left: null, right: 24 });
  });

  it('adds plain item cabinets beside a nested column and clears ownership on typed width (AC1)', () => {
    const result = syncAutoItems(
      { ...buildRun({ id: 'r', x: 10, width: 96, ends: { left: NONE, right: NONE } }),
        grid: undefined, items: [{ ...auto('a'), grid: gridFromItems('nested', [auto('child1'), auto('child2')]) }] },
      DEFAULT_SETTINGS,
    );

    expect(result.items).toHaveLength(3);
    expect(result.grid).toBeUndefined();
    expect(result.items.slice(1)).toEqual([
      { id: result.items[1].id, kind: 'cabinet', width: null, autoAdded: true },
      { id: result.items[2].id, kind: 'cabinet', width: null, autoAdded: true },
    ]);
    const typed = updateRootItem(buildRun({ items: [result.items[1]] }).grid, result.items[1].id, { width: 24 });
    expect(runItems({ grid: typed })[0]).toEqual({ id: result.items[1].id, kind: 'cabinet', width: 24 });
  });

  it('flipRunsForWall mirrors a grid run', () => {
    const result = flipRunsForWall(buildWall({
      id: 'w', x1: 0, y1: 0, x2: 120, y2: 0, flipped: false,
      joints: [], openings: [],
      runs: [buildRun({ id: 'r', x: 10, width: 60, ends: { left: NONE, right: NONE },
        items: [auto('a'), auto('b')], blind: { left: 36, right: null } })],
    }));
    const [run] = result.runs;

    expect(run.x).toBe(50);
    expect(runItems(run).map((item) => item.id)).toEqual(['b', 'a']);
    expect(runBlind(run)).toEqual({ left: null, right: 36 });
    expect(run).not.toHaveProperty('items');
  });
});
