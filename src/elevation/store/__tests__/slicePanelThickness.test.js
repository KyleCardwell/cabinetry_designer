import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE } from '../../model/doorStyles.js';
import { gridLeaves, runItems } from '../../model/grid.js';
import { isSheetCell } from '../../model/panelThickness.js';
import elevationReducer, { addPanel, setCellKind, setPanelType, setPartStyle } from '../elevationSlice.js';
import { auto, currentRun, fixed, run, stateWithRun } from './helpers/sliceFixtures.js';

const P = { ...DEFAULT_DOOR_STYLE, id: 'ds-p', label: 'P' };
const T = { ...DEFAULT_DOOR_STYLE, id: 'ds-t', label: 'T', thickness: 1 };
const at = { wallId: 'wall-1', runId: 'run-1' };
const apply = (state, ...actions) => actions.reduce(elevationReducer, state);
const plain = () => stateWithRun(run({ autoCount: false, items: [fixed('a', 30), auto('b')] }));

/** Cabinet a (30") and b (auto), with P (13/16") and T (1") listed, the given room picks and End panel thickness. */
function base(picks, endPanelThickness = 0.75) {
  const state = plain();
  Object.assign(state.rooms[0], { doorStyles: [P, T] }, picks);
  state.settings.endPanelThickness = endPanelThickness;
  return state;
}

describe('SPEC-46.1.1 panel cells: sheet slab unless they pick a style', () => {
  it('makes new side panel cells 3/4" sheet slab; a back panel takes the room\'s Panels style', () => {
    const picks = { panelStyleId: 'ds-p', doorStyleId: 'ds-t' };
    const added = apply(base(picks, 0.8125), addPanel({ ...at, cellId: 'b', side: 'left' }));
    expect(runItems(currentRun(added))[1].width).toBe(0.75);
    const back = apply(
      base(picks, 0.8125),
      setCellKind({ ...at, cellId: 'a', kind: 'panel' }),
      setPanelType({ ...at, cellId: 'a', type: 'back' }),
    );
    const a = gridLeaves(currentRun(back).grid).find((node) => node.id === 'a');
    expect([a.depth, a.align]).toEqual([0.8125, 'back']);
  });

  it('uses a panel\'s own style when its type is set again', () => {
    const own = (styleId) => currentRun(apply(
      base({ panelStyleId: 'ds-p' }, 0.8125),
      setCellKind({ ...at, cellId: 'a', kind: 'panel' }),
      setPartStyle({ ...at, part: 'panelCell', cellId: 'a', styleId }),
      setPanelType({ ...at, cellId: 'a', type: 'side' }),
    )).grid.cols[0].size;
    expect([own('ds-t'), own('default')]).toEqual([1, 0.8125]);
  });

  it('is 3/4" with no styles too, even with End panel thickness at 13/16"', () => {
    const state = plain();
    state.settings.endPanelThickness = 0.8125;
    expect(currentRun(apply(state, setCellKind({ ...at, cellId: 'a', kind: 'panel' }))).grid.cols[0].size).toBe(0.75);
  });

  it('makes a back panel its Panels style, or 3/4" when it picks sheet slab (SPEC-46.2.1)', () => {
    expect([isSheetCell({ kind: 'panel' }), isSheetCell({ kind: 'panel', align: 'back' }), isSheetCell(null)])
      .toEqual([true, false, true]);
    const back = (styleId) => {
      const steps = [setCellKind({ ...at, cellId: 'a', kind: 'panel' })];
      if (styleId) steps.push(setPartStyle({ ...at, part: 'panelCell', cellId: 'a', styleId }));
      steps.push(setPanelType({ ...at, cellId: 'a', type: 'back' }));
      const leaves = gridLeaves(currentRun(apply(base({ doorStyleId: 'ds-t' }), ...steps)).grid);
      return leaves.find((node) => node.id === 'a').depth;
    };
    expect([back(null), back('sheet'), back('ds-p')]).toEqual([1, 0.75, 0.8125]);
  });
});
