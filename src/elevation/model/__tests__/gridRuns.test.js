import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { gridFromItems, runBlind, runItems } from '../grid.js';
import { flipRunsForWall } from '../room.js';
import { syncAutoItems } from '../splitRun.js';

const auto = (id) => ({ id, kind: 'cabinet', width: null });
const NONE = { type: 'none', width: null };

function gridRun(width, items, blind) {
  return {
    id: 'r', x: 10, width, ends: { left: NONE, right: NONE },
    anchors: { left: false, right: false },
    autoCount: true, maxCabinetWidth: null,
    grid: gridFromItems('r', items, blind),
  };
}

describe('grid runs', () => {
  it("syncAutoItems grows a grid run's columns and keeps its blind", () => {
    const result = syncAutoItems(
      gridRun(96, [auto('a')], { left: 36, right: null }),
      DEFAULT_SETTINGS,
    );

    expect(result).not.toHaveProperty('items');
    expect(runItems(result)).toHaveLength(3);
    expect(runItems(result)[0].id).toBe('a');
    expect(runItems(result).every((item) => item.width === null)).toBe(true);
    expect(runBlind(result)).toEqual({ left: 36, right: null });
    expect(result.grid.id).toBe('r:grid');
    expect(result.grid.rows[0].id).toBe('r:row');
  });

  it('syncAutoItems shrinks a grid run and re-homes its right blind', () => {
    const result = syncAutoItems(
      gridRun(30, [auto('a'), auto('b'), auto('c')], { left: null, right: 24 }),
      DEFAULT_SETTINGS,
    );

    expect(runItems(result).map((item) => item.id)).toEqual(['a']);
    expect(runBlind(result)).toEqual({ left: null, right: 24 });
  });

  it('syncAutoItems keeps an items run as items', () => {
    const result = syncAutoItems(
      { ...gridRun(96, []), grid: undefined, items: [auto('a')] },
      DEFAULT_SETTINGS,
    );

    expect(result.items).toHaveLength(3);
    expect(result.grid).toBeUndefined();
  });

  it('flipRunsForWall mirrors a grid run', () => {
    const result = flipRunsForWall({
      id: 'w', x1: 0, y1: 0, x2: 120, y2: 0, flipped: false,
      joints: [], openings: [],
      runs: [gridRun(60, [auto('a'), auto('b')], { left: 36, right: null })],
    });
    const [run] = result.runs;

    expect(run.x).toBe(50);
    expect(runItems(run).map((item) => item.id)).toEqual(['b', 'a']);
    expect(runBlind(run)).toEqual({ left: null, right: 36 });
    expect(run).not.toHaveProperty('items');
  });
});
