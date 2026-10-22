import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../constants.js';
import { gridFromItems } from '../../grid.js';

export const topSegmentSettings = { ...DEFAULT_SETTINGS, runFlex: 0 };
export const topSegment = { id: 's', from: 'B', to: 'B', kind: 'wood', drop: 2, mode: 'box' };

// ST4 base anchor: three manual 30-inch columns, box top 34.5, stone top 1.5.
export function topSegmentRoom(overrides = {}) {
  return {
    id: 'room', name: 'Top segments', profile: {}, wallOrder: ['w'],
    walls: [{ id: 'w', x1: 0, y1: 0, x2: 120, y2: 0, height: 96, thickness: 4.5,
      flipped: false, connections: { start: null, end: null }, profile: {}, openings: [],
      runs: [{
        id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width: 90, z: 4, height: 30.5, depth: 24,
        top: 'stone', style: { cabinetStyleId: 13 },
        ends: { left: { type: 'none' }, right: { type: 'none' } },
        autoCount: false, heightMode: 'manual', overrides: {}, anchors: {},
        grid: gridFromItems('r', ['A', 'B', 'C'].map((id) => ({
          id, kind: 'cabinet', width: 30, face: { type: 'door' },
        }))),
        topSegments: [topSegment], ...overrides,
      }],
    }],
  };
}
