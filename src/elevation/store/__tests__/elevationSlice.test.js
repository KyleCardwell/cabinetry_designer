import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import elevationReducer, {
  addItemAfter,
  addRun,
  lockItem,
  removeItem,
  setRunEnd,
  splitItem,
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
    ...overrides,
  };
}

function stateWithRun(existingRun = null) {
  return {
    schemaVersion: 1,
    settings: { ...DEFAULT_SETTINGS, defaultEnds: { ...DEFAULT_SETTINGS.defaultEnds } },
    walls: [{
      id: 'wall-1',
      name: 'Wall 1',
      length: 144,
      height: 96,
      runs: existingRun ? [existingRun] : [],
    }],
    activeWallId: 'wall-1',
    selection: { runId: null, pieceId: null },
    tool: 'select',
    message: null,
  };
}

function currentRun(state) {
  return state.walls[0].runs[0];
}

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
});
