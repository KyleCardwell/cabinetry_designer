import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { DEFAULT_DOOR_STYLE, SHEET_PANEL_THICKNESS, isDoorStyleList, sheetPanelStyle } from '../doorStyles.js';
import { pickOptions } from '../doorStyleEdits.js';
import { panelLevels, resolveDoorStyle } from '../doorStyleResolve.js';
import elevationReducer, { setDoorStylePick, setPartStyle } from '../../store/elevationSlice.js';
import { auto, currentRun, run, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';

const S = DEFAULT_SETTINGS;
const P = { ...DEFAULT_DOOR_STYLE, id: 'ds-p', label: 'P' };
const T = { ...DEFAULT_DOOR_STYLE, id: 'ds-t', label: 'T', thickness: 1 };
const SHEET = { ...DEFAULT_DOOR_STYLE, id: 'sheet', label: 'Sheet', name: 'Sheet slab', designId: 'slab', thickness: 0.75 };

describe('SPEC-46.1.1 sheet slab panels', () => {
  it('is a reserved panel style, and the default at a join or inside a run', () => {
    expect([sheetPanelStyle(), SHEET_PANEL_THICKNESS]).toEqual([SHEET, 0.75]);
    expect(isDoorStyleList([{ ...P, id: 'sheet' }])).toBe(false);
    const room = { doorStyles: [P, T], doorStyleId: 'ds-t', panelStyleId: 'ds-p' };
    const runNode = { doorStyleId: 'ds-t' };
    const at = (part, options) => {
      const { style, design, source } = resolveDoorStyle(room, S, 'panel', panelLevels(room, null, runNode, part, options));
      return [style.id, design.id, source];
    };
    expect(at(null)).toEqual(['ds-p', 'five-piece-square', { level: 'room', key: 'panelStyleId' }]);
    expect(at(null, { sheet: true })).toEqual(['sheet', 'slab', { level: 'spot', key: 'panelStyleId' }]);
    expect(at({ styleId: 'ds-t' }, { sheet: true })[0]).toBe('ds-t');
    expect(at({ styleId: 'sheet' })[0]).toBe('sheet');
    const door = resolveDoorStyle(room, S, 'door', [
      { level: 'run', node: { doorStyleId: 'sheet' } }, { level: 'room', node: room },
    ]);
    expect([door.style.id, door.warnings]).toEqual(['ds-t', [{ code: 'door-style-missing', level: 'run', id: 'sheet' }]]);
  });

  it('is offered on panel pickers, and says when it is this spot\'s default', () => {
    const room = { doorStyles: [P] };
    expect([
      pickOptions(room, S, 'panel', []).options.map(({ id }) => id),
      pickOptions(room, S, 'door', []).options.map(({ id }) => id),
      pickOptions(room, S, 'drawer_front', []).options.map(({ id }) => id),
    ]).toEqual([['default', 'sheet', 'ds-p'], ['default', 'ds-p'], ['default', 'ds-p']]);
    expect(pickOptions(room, S, 'panel', []).options[1]).toEqual({ id: 'sheet', text: 'Sheet slab (3/4")' });
    const levels = panelLevels(room, null, {}, {}, { sheet: true });
    expect(pickOptions(room, S, 'panel', levels.slice(1)).inherit).toEqual({ id: 'sheet', text: 'Sheet slab here (3/4")' });
    const sheetRoom = { ...room, panelStyleId: 'sheet' };
    expect(pickOptions(sheetRoom, S, 'panel', [{ level: 'room', node: sheetRoom }]).inherit)
      .toEqual({ id: 'sheet', text: 'Inherit (Sheet · Slab · 3/4")' });
  });

  it('is stored only on Panels picks and panel parts', () => {
    const state = stateWithRun(run({
      autoCount: false,
      ends: { left: { type: 'end_panel', width: null }, right: { type: 'filler', width: null } },
      items: [auto('c1')],
    }));
    state.rooms[0].doorStyles = [P];
    const at = { wallId: 'wall-1', runId: 'run-1' };
    const next = [
      setDoorStylePick({ level: 'room', key: 'panelStyleId', styleId: 'sheet' }),
      setPartStyle({ ...at, part: 'runEnd', side: 'left', styleId: 'sheet' }),
    ].reduce(elevationReducer, state);
    expect([next.rooms[0].panelStyleId, currentRun(next).ends.left.styleId]).toEqual(['sheet', 'sheet']);
    expect([
      setDoorStylePick({ level: 'room', key: 'doorStyleId', styleId: 'sheet' }),
      setDoorStylePick({ level: 'room', key: 'drawerFrontStyleId', styleId: 'sheet' }),
    ].map((action) => elevationReducer(next, action) === next)).toEqual([true, true]);
  });
});
