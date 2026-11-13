import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE } from '../../model/doorStyles.js';
import { gridLeaves } from '../../model/grid.js';
import elevationReducer, {
  addDoorStyle,
  setDoorStylePick,
  setItemFace,
  setPanelType,
  setPartStyle,
  setWallEndPanel,
  updateDoorStyle,
} from '../elevationSlice.js';
import { auto, currentRun, run, stateWithRun } from './helpers/sliceFixtures.js';

const apply = (state, ...actions) => actions.reduce(elevationReducer, state);
const THICK = { ...DEFAULT_DOOR_STYLE, id: 'ds-1', label: 'A', thickness: 1 };
const at = { wallId: 'wall-1', runId: 'run-1' };
const leaf = (state, id) => gridLeaves(currentRun(state).grid).find((node) => node.id === id);

/** A base run 12" in (end panel left, cabinet c1, panel cell p1) and style A at 1" thick (ds-1). */
function base() {
  const state = stateWithRun(run({
    x: 12,
    autoCount: false,
    ends: { left: { type: 'end_panel', width: null }, right: { type: 'filler', width: null } },
    items: [auto('c1'), { id: 'p1', kind: 'panel', width: 0.75 }],
  }));
  return apply(state, addDoorStyle({ id: 'ds-1' }), updateDoorStyle({ styleId: 'ds-1', style: THICK }));
}

describe('SPEC-46.1 door style picks in the store', () => {
  it('sets and clears a pick at the room, a wall, a run and cabinets', () => {
    const state = apply(
      base(),
      setDoorStylePick({ level: 'room', key: 'doorStyleId', styleId: 'ds-1' }),
      setDoorStylePick({ level: 'wall', wallId: 'wall-1', key: 'panelStyleId', styleId: 'ds-1' }),
      setDoorStylePick({ level: 'run', ...at, key: 'drawerFrontStyleId', styleId: 'ds-1' }),
      setDoorStylePick({ level: 'cabinet', ...at, itemIds: ['c1'], key: 'doorStyleId', styleId: 'ds-1' }),
    );
    expect([
      state.rooms[0].doorStyleId,
      state.rooms[0].walls[0].panelStyleId,
      currentRun(state).drawerFrontStyleId,
      leaf(state, 'c1').doorStyleId,
      currentRun(state)._doorThickness,
    ]).toEqual(['ds-1', 'ds-1', 'ds-1', 'ds-1', 1]);
    const cleared = apply(
      state,
      setDoorStylePick({ level: 'room', key: 'doorStyleId', styleId: null }),
      setDoorStylePick({ level: 'cabinet', ...at, itemIds: ['c1'], key: 'doorStyleId', styleId: null }),
    );
    expect(['doorStyleId' in cleared.rooms[0], 'doorStyleId' in leaf(cleared, 'c1'), '_doorThickness' in currentRun(cleared)])
      .toEqual([false, false, false]);
  });

  it('ignores a style the room doesn\'t have, a bad key, level or target', () => {
    const state = base();
    expect([
      setDoorStylePick({ level: 'room', key: 'doorStyleId', styleId: 'gone' }),
      setDoorStylePick({ level: 'room', key: 'styleId', styleId: 'ds-1' }),
      setDoorStylePick({ level: 'face', ...at, key: 'doorStyleId', styleId: 'ds-1' }),
      setDoorStylePick({ level: 'run', wallId: 'wall-1', runId: 'gone', key: 'doorStyleId', styleId: 'ds-1' }),
    ].map((action) => apply(state, action) === state)).toEqual([true, true, true, true]);
  });

  it('sets a run end panel\'s and a wall end panel\'s style and sizes, and keeps them on other edits', () => {
    const sizes = { stiles: { left: 3.5 }, notes: { left: 'scribe' } };
    const state = apply(
      base(),
      setPartStyle({ ...at, part: 'runEnd', side: 'left', styleId: 'ds-1', sizes }),
      setWallEndPanel({ wallId: 'wall-1', endpoint: 'start', panel: { width: null } }),
      setPartStyle({ wallId: 'wall-1', part: 'wallEndPanel', endpoint: 'start', styleId: 'ds-1' }),
      setWallEndPanel({ wallId: 'wall-1', endpoint: 'start', panel: { width: 1 } }),
    );
    expect(currentRun(state).ends.left).toEqual({ type: 'end_panel', width: null, styleId: 'ds-1', sizes });
    expect(state.rooms[0].walls[0].endPanels.start).toEqual({ width: 1, styleId: 'ds-1' });
    const cleared = apply(state, setPartStyle({ ...at, part: 'runEnd', side: 'left', sizes: null }));
    expect(currentRun(cleared).ends.left).toEqual({ type: 'end_panel', width: null, styleId: 'ds-1' });
  });

  it('sets a panel cell\'s style and sizes, kept when its panel type changes; refuses bad parts', () => {
    const state = apply(
      base(),
      setPartStyle({ ...at, part: 'panelCell', cellId: 'p1', styleId: 'ds-1', sizes: { rails: { bottom: 3.5 } } }),
      setPanelType({ ...at, cellId: 'p1', type: 'back' }),
    );
    const p1 = leaf(state, 'p1');
    expect([p1.styleId, p1.sizes, p1.align]).toEqual(['ds-1', { rails: { bottom: 3.5 } }, 'back']);
    expect([
      setPartStyle({ ...at, part: 'panelCell', cellId: 'c1', styleId: 'ds-1' }),
      setPartStyle({ ...at, part: 'panelCell', cellId: 'p1', styleId: 'gone' }),
      setPartStyle({ ...at, part: 'panelCell', cellId: 'p1', styleId: null, sizes: { rails: {} } }),
      setPartStyle({ wallId: 'wall-1', part: 'wallEndPanel', endpoint: 'end', styleId: 'ds-1' }),
      setPartStyle({ ...at, part: 'thing', styleId: 'ds-1' }),
    ].map((action) => apply(state, action) === state)).toEqual([true, true, true, true, true]);
  });

  it('re-syncs the room when a face picks a style (P11)', () => {
    const state = apply(base(), setItemFace({ ...at, itemIds: ['c1'], face: { type: 'door', size: null, styleId: 'ds-1' } }));
    expect(currentRun(state)._doorThickness).toBe(1);
  });
});
