import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { cabinetFaceLevels, resolveDoorStyle } from '../doorStyleResolve.js';
import { gridLeaves } from '../grid.js';
import elevationReducer, { deleteDoorStyle, setDoorStylePick, setPartStyle } from '../../store/elevationSlice.js';
import { auto, currentRun, run, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';

const S = DEFAULT_SETTINGS;
const T = { ...DEFAULT_DOOR_STYLE, id: 'ds-t', label: 'T', thickness: 1 };

describe('SPEC-46.1.1 picking the team default on purpose', () => {
  it('resolves a "default" pick to the team style, at the level it was picked', () => {
    const room = { doorStyles: [T], doorStyleId: 'ds-t', drawerFrontStyleId: 'default' };
    const door = resolveDoorStyle(room, S, 'door', cabinetFaceLevels(room, null, null, { doorStyleId: 'default' }, { type: 'door' }));
    expect([door.style, door.source, door.warnings])
      .toEqual([DEFAULT_DOOR_STYLE, { level: 'cabinet', key: 'doorStyleId' }, []]);
    const drawer = resolveDoorStyle(room, S, 'drawer_front', cabinetFaceLevels(room, null, null, {}, { type: 'drawer_front' }));
    expect([drawer.style.id, drawer.source]).toEqual(['default', { level: 'room', key: 'drawerFrontStyleId' }]);
    const face = resolveDoorStyle(room, S, 'door', cabinetFaceLevels(room, null, null, {}, { type: 'door', styleId: 'default' }));
    expect([face.style.id, face.source]).toEqual(['default', { level: 'face', key: 'styleId' }]);
    expect(resolveDoorStyle(room, { ...S, teamDoorStyle: { ...S.teamDoorStyle, thickness: 1 } }, 'door', [{ level: 'run', node: { doorStyleId: 'default' } }]).style.thickness)
      .toBe(1);
  });

  it('accepts the team default as a pick, a part\'s style and a reassign target in the store', () => {
    const at = { wallId: 'wall-1', runId: 'run-1' };
    const state = stateWithRun(run({
      autoCount: false,
      ends: { left: { type: 'end_panel', width: null }, right: { type: 'filler', width: null } },
      items: [auto('c1')],
    }));
    state.rooms[0].doorStyles = [T];
    state.rooms[0].doorStyleId = 'ds-t';
    const picked = [
      setDoorStylePick({ level: 'cabinet', ...at, itemIds: ['c1'], key: 'doorStyleId', styleId: 'default' }),
      setPartStyle({ ...at, part: 'runEnd', side: 'left', styleId: 'default' }),
    ].reduce(elevationReducer, state);
    const c1 = gridLeaves(currentRun(picked).grid).find((node) => node.id === 'c1');
    expect([c1.doorStyleId, currentRun(picked).ends.left.styleId, '_doorThickness' in currentRun(picked)])
      .toEqual(['default', 'default', false]);
    const deleted = elevationReducer(picked, deleteDoorStyle({ styleId: 'ds-t', reassignTo: 'default' }));
    expect([deleted.rooms[0].doorStyleId, 'doorStyles' in deleted.rooms[0]]).toEqual(['default', false]);
  });
});
