import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../constants.js';
import { gridFromItems } from '../../grid.js';

const S = DEFAULT_SETTINGS;
export const AUTO_NONE = { type: 'none', width: null, auto: true };
const joint = { to: 'joint', jointId: 'J', offset: 0 };

/** L: a 60" run that's only a 3/4" back panel; R: a 60" run of cabinets; joined at 60. */
export function joinedRooms(wallId = 'A') {
  const base = {
    cabinetTypeId: CABINET_TYPE_IDS.BASE, z: 4, height: 30.5, depth: 24, autoCount: false,
    maxCabinetWidth: null, heightMode: 'manual', overrides: {},
  };
  return {
    id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: [wallId],
    walls: [{
      id: wallId, name: '', numberOverride: null, elevationForced: false, x1: 0, y1: 0, x2: 240, y2: 0,
      height: 96, thickness: 4.5, flipped: false, connections: { start: null, end: null }, profile: {},
      openings: [], endPanels: { start: null, end: null }, landings: { start: null, end: null }, soffits: [],
      joints: [{ id: 'J', x: 60, wallSide: 'front' }],
      runs: [
        {
          ...base, id: 'L', x: 0, width: 60,
          ends: { left: { type: 'none', width: null }, right: AUTO_NONE },
          anchors: { left: false, right: joint },
          grid: {
            id: 'L:grid', cols: [{ id: 'lc', size: null, sizeMode: 'auto' }],
            rows: [{ id: 'L:row', size: null, sizeMode: 'auto' }],
            cells: [{ col: 0, row: 0, colSpan: 1, rowSpan: 1, node: { id: 'p', kind: 'panel', depth: 0.75, align: 'back' } }],
          },
        },
        {
          ...base, id: 'R', x: 60, width: 60,
          ends: { left: AUTO_NONE, right: { type: 'end_panel', width: null } },
          anchors: { left: joint, right: false },
          grid: gridFromItems('R', [{ id: 'r1', kind: 'cabinet', width: null }]),
        },
      ],
    }],
  };
}
