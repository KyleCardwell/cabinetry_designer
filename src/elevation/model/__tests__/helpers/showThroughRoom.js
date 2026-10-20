import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../constants.js';
import { gridFromItems } from '../../grid.js';

export function roomWith(leaves, { width = 24 * leaves.length, height = 30.5, depth = 24,
  cabinetTypeId = CABINET_TYPE_IDS.BASE } = {}) {
  const run = { id: 'run', cabinetTypeId, x: 24, width, z: 4, height, depth,
    ends: { left: { type: 'none' }, right: { type: 'none' } }, autoCount: false, maxCabinetWidth: null,
    heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
    grid: gridFromItems('run', leaves.map((leaf) => ({ kind: 'cabinet', width: null, ...leaf }))) };
  const wall = { id: 'wall', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5, flipped: false,
    connections: { start: null, end: null }, profile: {}, runs: [run], openings: [] };
  return { id: 'room', profile: { ...DEFAULT_SETTINGS.defaultProfile }, walls: [wall], wallOrder: ['wall'] };
}
