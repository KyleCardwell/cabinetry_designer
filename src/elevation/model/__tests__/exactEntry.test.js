import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { moveRun, stretchRun } from '../room.js';

const S = DEFAULT_SETTINGS;
const EXACT = { exact: true };

function makeRun(id, overrides = {}) {
  return {
    id,
    cabinetTypeId: CABINET_TYPE_IDS.BASE,
    x: 40,
    width: 40,
    z: 4,
    height: 30.5,
    depth: 24,
    ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
    autoCount: false,
    maxCabinetWidth: null,
    items: [{ id: `${id}-cabinet`, kind: 'cabinet', width: overrides.width ?? 40 }],
    heightMode: 'manual',
    overrides: {},
    anchors: { left: false, right: false },
    ...overrides,
  };
}

function makeRoom(runs) {
  return {
    id: 'room',
    name: 'Room',
    profile: { ...S.defaultProfile },
    wallOrder: ['A'],
    walls: [{
      id: 'A', name: '', numberOverride: null,
      x1: 0, y1: 0, x2: 120, y2: 0, height: 96, thickness: 4.5, flipped: false,
      connections: { start: null, end: null }, profile: {}, runs,
    }],
  };
}

const withNeighbor = () => makeRoom([makeRun('run'), makeRun('neighbor', { x: 90, width: 20 })]);
const runIn = (result, id = 'run') => result.room.walls[0].runs.find((run) => run.id === id);
const at = (result) => [result.ok, runIn(result).x, runIn(result).width];

describe('SPEC-46.1.1 a typed width or move lands where it is typed', () => {
  it('stretches to a typed edge with no rounding or snapping, but still clamps and joins on an exact hit', () => {
    const room = makeRoom([makeRun('run')]);
    expect(at(stretchRun(room, 'A', 'run', 'left', 3.0625, S))).toEqual([true, 3, 77]);
    expect(at(stretchRun(room, 'A', 'run', 'left', 3.0625, S, EXACT))).toEqual([true, 3.0625, 76.9375]);
    const near = stretchRun(room, 'A', 'run', 'left', 1.25, S, EXACT);
    expect([...at(near), runIn(near).anchors.left]).toEqual([true, 1.25, 78.75, false]);
    const onEnd = stretchRun(room, 'A', 'run', 'left', 0, S, EXACT);
    expect([...at(onEnd), runIn(onEnd).anchors.left, runIn(onEnd).ends.left.type]).toEqual([true, 0, 80, true, 'end_panel']);
    expect(at(stretchRun(room, 'A', 'run', 'right', 42, S, EXACT))).toEqual([true, 40, 9]);
    expect(at(stretchRun(withNeighbor(), 'A', 'run', 'right', 88.5, S, EXACT))).toEqual([true, 40, 48.5]);
    const snapped = stretchRun(withNeighbor(), 'A', 'run', 'right', 88.5, S);
    const typed = stretchRun(withNeighbor(), 'A', 'run', 'right', 90, S, EXACT);
    expect([at(typed), typed.joined]).toEqual([[true, 40, 50], snapped.joined]);
  });

  it('moves to a typed x with no rounding or snapping, and reports a snap only on an exact hit', () => {
    const room = makeRoom([makeRun('run')]);
    const plain = moveRun(room, 'A', 'run', 60.0625, S, EXACT);
    expect([...at(plain), plain.snap]).toEqual([true, 60.0625, 40, null]);
    const nearEnd = moveRun(room, 'A', 'run', 1.5, S, EXACT);
    expect([...at(nearEnd), nearEnd.snap]).toEqual([true, 1.5, 40, null]);
    const onEnd = moveRun(room, 'A', 'run', 0, S, EXACT);
    expect([...at(onEnd), onEnd.snap]).toEqual([true, 0, 40, { value: 0, edge: 'left' }]);
    const nearNeighbor = moveRun(withNeighbor(), 'A', 'run', 49, S, EXACT);
    expect([...at(nearNeighbor), nearNeighbor.snap]).toEqual([true, 49, 40, null]);
  });
});
