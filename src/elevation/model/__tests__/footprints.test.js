import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { footprintsAtPoint } from '../footprints.js';

function run(id, cabinetTypeId, depth) {
  return {
    id,
    cabinetTypeId,
    x: 0,
    width: 60,
    depth,
  };
}

function roomR() {
  const wallA = {
    id: 'A',
    x1: 0,
    y1: 0,
    x2: 120,
    y2: 0,
    height: 96,
    thickness: 4.5,
    flipped: false,
    connections: { start: null, end: { wallId: 'B', endpoint: 'start' } },
    runs: [
      run('base', CABINET_TYPE_IDS.BASE, 24),
      run('upper', CABINET_TYPE_IDS.UPPER, 12),
    ],
  };
  const wallB = {
    id: 'B',
    x1: 120,
    y1: 0,
    x2: 120,
    y2: 96,
    height: 96,
    thickness: 4.5,
    flipped: false,
    connections: { start: { wallId: 'A', endpoint: 'end' }, end: null },
    runs: [],
  };
  return { id: 'R', walls: [wallA, wallB] };
}

describe('footprintsAtPoint', () => {
  it('1. returns overlapping footprints from topmost to bottommost', () => {
    const room = roomR();
    expect(footprintsAtPoint(room, { x: 30, y: 5 }, DEFAULT_SETTINGS))
      .toEqual(['upper', 'base']);
    expect(footprintsAtPoint(room, { x: 30, y: 20 }, DEFAULT_SETTINGS))
      .toEqual(['base']);
  });
});
