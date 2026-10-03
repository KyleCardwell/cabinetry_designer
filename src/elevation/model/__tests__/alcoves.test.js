import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { pickColumnRuns, verticalChains } from '../dimensions.js';
import { gridFromItems } from '../grid.js';
import { resolveWall, syncRoom } from '../room.js';

const S = DEFAULT_SETTINGS;
const NONE = { type: 'none', width: null };

const base = (id, x, width) => ({
  id, cabinetTypeId: CABINET_TYPE_IDS.BASE, x, width, z: 4, height: 30.5, depth: 24,
  ends: { left: NONE, right: NONE }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'auto', overrides: {}, anchors: { left: false, right: false },
  grid: gridFromItems(id, [{ id: `${id}a`, kind: 'cabinet', width: null }]),
});

const soffit = (id, x, width, bottom) => ({
  id, wallSide: 'front', x, width, bottom, depth: 14, molding: 'none', anchors: { left: false, right: false },
});

/** SPEC-36.3.3: a 144" wall, 96" tall, as the elevation builds its left and right chains. */
function chain(runs, soffits, edge) {
  const wall = {
    id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs, openings: [],
    joints: [], endPanels: { start: null, end: null }, landings: { start: null, end: null }, soffits,
  };
  const room = syncRoom({
    id: 'room-1', name: 'Room 1', profile: { ...S.defaultProfile }, walls: [wall], wallOrder: ['wall-1'],
  }, S);
  const resolved = resolveWall(room, room.walls[0]);
  return verticalChains(room, resolved, pickColumnRuns(resolved, null, edge), S, edge)
    .inner.map(({ start, end, kind }) => [kind, start, end]);
}

describe('SPEC-36.3.3 each end of the wall gets its own chain', () => {
  it('gives a bare end its own soffit and no cabinets from the other end', () => {
    // An alcove each end: a base under the left soffit, nothing under the right one.
    const runs = [base('b', 0, 48)];
    const soffits = [soffit('L', 0, 48, 84), soffit('R', 96, 48, 80)];
    expect(chain(runs, soffits, 'left').slice(-3)).toEqual([
      ['countertop', 34.5, 36],
      ['open', 36, 84],
      ['soffit', 84, 96],
    ]);
    expect(chain(runs, soffits, 'right')).toEqual([['open', 0, 80], ['soffit', 80, 96]]);
  });

  it('takes the soffit nearest the edge when none is over the runs', () => {
    const soffits = [soffit('L', 0, 30, 72), soffit('R', 114, 30, 84)];
    expect(chain([], soffits, 'left')).toEqual([['open', 0, 72], ['soffit', 72, 96]]);
    expect(chain([], soffits, 'right')).toEqual([['open', 0, 84], ['soffit', 84, 96]]);
    // A run across the whole wall is on both chains.
    expect(chain([base('w', 0, 144)], [], 'right')[0]).toEqual(['toe-kick', 0, 4]);
  });
});
