import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { gridFromItems } from '../../model/grid.js';
import { isElevationDocument, toElevationDocument } from '../persistence.js';

const R = {
  id: 'R', kind: 'recess', label: 'R1', wallSide: 'front', offsetFrom: 'left', offsetAnchor: 'edge',
  offset: 60, width: 48, bottom: 0, height: null, depth: 24, molding: 'crown',
};
const DOOR = {
  id: 'D', kind: 'door', label: 'D1', measureMode: 'jamb', width: 24, height: 80, sillZ: 0,
  offset: 72, offsetFrom: 'left', offsetAnchor: 'edge', casing: null, recessId: 'R',
};

function document(runExtra = {}, wallExtra = {}) {
  const settings = structuredClone(DEFAULT_SETTINGS);
  return {
    schemaVersion: 4,
    settings,
    rooms: [{
      id: 'room-1',
      name: 'Room 1',
      profile: { ...settings.defaultProfile },
      wallOrder: ['wall-a'],
      walls: [{
        id: 'wall-a', name: '', numberOverride: null, elevationForced: false,
        x1: 0, y1: 0, x2: 240, y2: 0, height: 108, thickness: 4.5, flipped: false,
        connections: { start: null, end: null }, profile: {},
        openings: [DOOR],
        recesses: [R],
        runs: [{
          id: 'a', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 60, width: 48, z: 4, height: 30.5, depth: 24,
          ends: { left: { type: 'filler', width: null }, right: { type: 'filler', width: null } },
          autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
          anchors: { left: { to: 'recess', recessId: 'R', edge: 'left', offset: 0 }, right: false },
          recessId: 'R',
          grid: gridFromItems('a', [{ id: 'a-cab', kind: 'cabinet', width: null }]),
          ...runExtra,
        }],
        ...wallExtra,
      }],
    }],
    activeRoomId: 'room-1',
    activeWallId: 'wall-a',
    view: 'elevation',
  };
}

describe('SPEC-38 saves', () => {
  it('accepts recesses, runs and openings set in them, and recess anchors', () => {
    expect(isElevationDocument(document())).toBe(true);
    expect(isElevationDocument(document({}, { recesses: [{ ...R, kind: 'projection', height: 84 }] })))
      .toBe(true);
  });

  it('rejects bad recesses, plane ids and recess anchors', () => {
    for (const bad of [
      { kind: 'niche' }, { depth: 0 }, { height: 0 }, { bottom: -1 }, { molding: 'cove' },
      { offsetAnchor: 'middle' }, { wallSide: 'top' },
    ]) {
      expect(isElevationDocument(document({}, { recesses: [{ ...R, ...bad }] }))).toBe(false);
    }
    expect(isElevationDocument(document({ recessId: 5 }))).toBe(false);
    expect(isElevationDocument(document({
      anchors: { left: { to: 'recess', recessId: 'R', edge: 'top', offset: 0 }, right: false },
    }))).toBe(false);
    expect(isElevationDocument(document({}, { openings: [{ ...DOOR, recessId: 3 }] }))).toBe(false);
  });

  it("doesn't save a run's derived plane", () => {
    const saved = toElevationDocument(document({ _plane: { recessId: 'R', offset: -24 } }));
    expect(saved.rooms[0].walls[0].runs[0]).not.toHaveProperty('_plane');
    expect(saved.rooms[0].walls[0].runs[0].recessId).toBe('R');
  });
});
