import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { runFaceLayouts } from '../faceLayouts.js';
import { resolveWall } from '../room.js';

function roomWith(run, style) {
  const wall = {
    id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
  };
  return {
    id: 'room-1', name: 'Room 1', profile: { ...DEFAULT_SETTINGS.defaultProfile }, walls: [wall], wallOrder: ['wall-1'],
    ...(style ? { style } : {}),
  };
}

const RUN = {
  id: 'run-1', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 24, width: 19.5, z: 4, height: 30.5, depth: 24,
  ends: { left: { type: 'end_panel', width: null }, right: { type: 'end_panel', width: null } },
  autoCount: false, maxCabinetWidth: null, items: [{ id: 'a', kind: 'cabinet', width: 18 }],
  heightMode: 'auto', overrides: {}, anchors: { left: false, right: false },
};

describe('runFaceLayouts', () => {
  it('49. captured single door, then the room switched to inset', () => {
    const room = roomWith(RUN);
    const wall = resolveWall(room, room.walls[0]);
    const euro = runFaceLayouts(room, wall, RUN, DEFAULT_SETTINGS).get('a');
    expect(euro.style.cabinetStyleId).toBe(13);
    expect(euro.reveals.sources.left).toBe('rule:captured-single');
    expect(euro.faces).toEqual([{ path: 'r', type: 'door', x: 24.84375, z: 4.125, width: 17.8125, height: 30.125 }]);

    const insetRoom = roomWith(RUN, { cabinetStyleId: 14 });
    const inset = runFaceLayouts(insetRoom, resolveWall(insetRoom, insetRoom.walls[0]), RUN, DEFAULT_SETTINGS).get('a');
    expect(inset.faces).toEqual([{ path: 'r', type: 'door', x: 25.5, z: 5.5, width: 16.5, height: 27.5 }]);
  });
});
