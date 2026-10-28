import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { auto, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { setGridCellDepth, splitGridCell } from '../cellTree.js';
import { gridLeaves } from '../grid.js';
import { syncRoom } from '../roomSync.js';
import { isPanelOnlyRun, panelRunFace } from '../wallEndPanels.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };

describe('FX5 panel-only run depth', () => {
  it('anchor 1: corrects Room 9b back run from 24 to 13/16', () => {
    const stored = JSON.parse(readFileSync(new URL('./fixtures/room9b.json', import.meta.url), 'utf8'));
    const back = stored.walls.flatMap(({ runs }) => runs)
      .find(({ id }) => id === 'c3e90115-6035-4641-b50b-a0b5ba4079dc');
    back.depth = 24;
    const synced = syncRoom(stored, { ...settings, ...stored.settingsOverrides });
    expect(synced.walls.flatMap(({ runs }) => runs).find(({ id }) => id === back.id).depth).toBe(0.8125);
    expect(back.depth).toBe(24);
  });

  it('anchor 2: corrects the woodTopGroups island back run from 24 to 3/4', () => {
    const wood = { top: 'wood', autoCount: false,
      ends: { left: { type: 'none' }, right: { type: 'none' } } };
    const island = room({ walls: [wall({ id: 'island', x2: 96, thickness: 0, runs: [
      run({ ...wood, id: 'front', width: 96, items: [auto('cabinet')] }),
      run({ ...wood, id: 'back', width: 96, depth: 24, wallSide: 'back',
        items: [{ ...auto('back-panel'), kind: 'panel', depth: 0.75, align: 'back' }] }),
    ] })] });
    const synced = syncRoom(island, settings);
    expect(synced.walls[0].runs.map(({ depth }) => depth)).toEqual([24, 0.75]);
  });

  it('anchor 3: follows the deepest panel, including nested split leaves', () => {
    const panels = run({ autoCount: false,
      items: [{ ...auto('panel'), kind: 'panel', depth: 0.75 }] });
    let id = 0;
    panels.grid = splitGridCell(panels.grid, 'panel', 'down', 2, () => `split-${++id}`);
    const second = gridLeaves(panels.grid)[1];
    panels.grid = setGridCellDepth(panels.grid, second.id, { depth: 0.8125 });
    const synced = syncRoom(room({ walls: [wall({ runs: [panels] })] }), settings);
    expect(synced.walls[0].runs[0].depth).toBe(0.8125);
    expect(syncRoom(synced, settings)).toEqual(synced);
  });

  it('anchor 4: leaves two side panels at the stored run depth', () => {
    const panels = run({ autoCount: false, items: [
      { ...auto('left'), kind: 'panel' }, { ...auto('right'), kind: 'panel' },
    ] });
    expect(isPanelOnlyRun(panels)).toBe(false);
    // The existing wall-end-panel face calculation still accepts these panels.
    expect(panelRunFace(panels)).toMatchObject({ thickness: 24 });
    expect(syncRoom(room({ walls: [wall({ runs: [panels] })] }), settings)
      .walls[0].runs[0].depth).toBe(24);
  });

  it('anchor 5: follows a panel alongside a void, ignoring any void depth', () => {
    const panels = run({ autoCount: false, items: [
      { ...auto('panel'), kind: 'panel', depth: 0.75 },
      { ...auto('gap'), kind: 'void', depth: 30 },
    ] });
    expect(isPanelOnlyRun(panels)).toBe(true);
    expect(panelRunFace(panels)).toBeNull();
    expect(syncRoom(room({ walls: [wall({ runs: [panels] })] }), settings)
      .walls[0].runs[0].depth).toBe(0.75);
  });

  it('requires at least one panel, numeric depths on every panel, and no cabinets or shelves', () => {
    const panel = { ...auto('panel'), kind: 'panel', depth: 0.75 };
    for (const items of [[], [{ ...auto('gap'), kind: 'void' }],
      [panel, auto('cabinet')], [panel, { ...auto('shelf'), kind: 'shelves' }],
      ...[undefined, null, '0.75', NaN, Infinity].map((depth) => [panel,
        { ...auto('other'), kind: 'panel', depth }]),
    ]) {
      const candidate = run({ autoCount: false, items });
      expect(isPanelOnlyRun(candidate)).toBe(false);
      expect(syncRoom(room({ walls: [wall({ runs: [candidate] })] }), settings)
        .walls[0].runs[0].depth).toBe(24);
    }
    expect(isPanelOnlyRun({})).toBe(false);
  });
});
