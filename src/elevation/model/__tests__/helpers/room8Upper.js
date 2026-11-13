import { findLeaf, splitGridCell } from '../../cellTree.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../constants.js';
import { gridFromItems } from '../../grid.js';
import { resolveWall, syncRoom } from '../../room.js';
import { runScene } from '../../runScene.js';

export const settings = { ...DEFAULT_SETTINGS, runFlex: 0,
  teamDoorStyle: { ...DEFAULT_SETTINGS.teamDoorStyle, thickness: 0.75 } };

// Room 8's 164 1/8-inch upper: a 24-inch back panel over a void between cabinets.
export function room8Upper(change = () => {}) {
  const run = {
    id: 'r', cabinetTypeId: CABINET_TYPE_IDS.UPPER, x: 0, width: 164.125, z: 30, height: 60, depth: 24,
    ends: { left: { type: 'end_panel', width: null }, right: { type: 'end_panel', width: null } },
    autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
    anchors: { left: false, right: false },
    grid: gridFromItems('r', ['a', 'b', 'c'].map((id) => ({ id, kind: 'cabinet', width: null,
      face: { type: 'door', size: null } }))),
  };
  let n = 0;
  run.grid = splitGridCell(run.grid, 'b', 'down', 2, () => `n${++n}`);
  Object.assign(findLeaf(run.grid, 'b'), { kind: 'panel', depth: 0.75, align: 'back' });
  findLeaf(run.grid, 'n5').kind = 'void';
  run.grid.cells[1].node.rows[0] = { id: 'n3', size: 24, sizeMode: 'manual' };
  const source = { id: 'room8', name: 'Room 8', profile: {}, wallOrder: ['w'], walls: [{
    id: 'w', name: '', numberOverride: null, x1: 0, y1: 0, x2: 180, y2: 0,
    height: 96, thickness: 4.5, flipped: false, connections: { start: null, end: null },
    profile: {}, runs: [run], openings: [],
  }] };
  change(run, source);
  const room = syncRoom(source, settings);
  const wall = resolveWall(room, room.walls[0], 'front');
  const resolved = wall.runs[0];
  return { room, wall, run: resolved, scene: runScene(room, wall, resolved, settings) };
}
