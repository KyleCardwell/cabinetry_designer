import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { wallParts } from '../wallParts.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const room = (name) => syncRoom(stored(name), settings);
const partsOf = (synced, wallIndex, side = 'front') => wallParts(synced, synced.walls[wallIndex], side, settings);
const row = ({ id, kind, x, z, width, height, back, front }) => [id, kind, x, z, width, height, back, front];

const ISLAND = '84063fed-ab0d-4a1d-ae05-ffe67decad5e';
const PENINSULA = '64da569f-6c94-408d-809a-37c6e1f9755f';

describe('SPEC-42.1 wall parts', () => {
  it('draws an island\'s wall end panels through the wall, as deep as the runs on this side', () => {
    const g1 = room('G1 Euro kitchen');
    expect(partsOf(g1, 3).map(row)).toEqual([
      [`${ISLAND}:endPanel:start`, 'wall_end_panel', 90.75, 0, 0.75, 34.5, -12.875, 24.875],
      [`${ISLAND}:endPanel:end`, 'wall_end_panel', 0, 0, 0.75, 34.5, -12.875, 24.875],
    ]);
    expect(partsOf(g1, 3, 'back').map(row)).toEqual([
      [`${ISLAND}:endPanel:start`, 'wall_end_panel', 0, 0, 0.75, 34.5, -24.875, 12.875],
      [`${ISLAND}:endPanel:end`, 'wall_end_panel', 90.75, 0, 0.75, 34.5, -24.875, 12.875],
    ]);
    expect(partsOf(g1, 3)[0]).toEqual({
      id: `${ISLAND}:endPanel:start`, kind: 'wall_end_panel',
      x: 90.75, z: 0, width: 0.75, height: 34.5, back: -12.875, front: 24.875, coversBoxEdges: false,
    });
  });

  it('puts a wall end panel a face frame is mitered over behind the frame (G2 peninsula)', () => {
    const g2 = room('G2 Face frame kitchen');
    expect(row(partsOf(g2, 1)[0]))
      .toEqual([`${PENINSULA}:endPanel:end`, 'wall_end_panel', 77.75, 0, 0.75, 34.5, -24, 24]);
    // The back face's run is only a back panel: no frame, so nothing is mitered over it.
    expect(row(partsOf(g2, 1, 'back')[0]))
      .toEqual([`${PENINSULA}:endPanel:end`, 'wall_end_panel', 0, 0, 0.75, 34.5, -24.8125, 24]);
  });

  it('draws a door or window as its casing and its opening, outlines that hide nothing', () => {
    const window = '93ab97a1-ce31-4283-8240-ead92a6ae665';
    expect(partsOf(room('G1 Euro kitchen'), 0)).toEqual([
      {
        id: `${window}:casing`, kind: 'casing', x: 45, z: 39, width: 54, height: 54,
        back: 0, front: 0.75, coversBoxEdges: false, opaque: false,
      },
      {
        id: window, kind: 'opening', x: 48, z: 42, width: 48, height: 48,
        back: -4.5, front: 0, coversBoxEdges: false, opaque: false,
      },
    ]);
    const door = '6c5010bf-ce59-494b-8c69-b37f33af3e70';
    expect(partsOf(room('G2 Face frame kitchen'), 0).map(row)).toEqual([
      [`${door}:casing`, 'casing', 2, 0, 42, 83, 0, 0.75],
      [door, 'opening', 5, 0, 36, 80, -4.5, 0],
    ]);
  });

  it('outlines a soffit and a wing wall; a soffit as deep as the wing wall runs over it (G3)', () => {
    const soffit = '5ac8edd3-2c75-476d-bc64-f80ade3f5fba';
    const wing = '5ab00c5d-9ea6-4d32-9586-d266db26a4d2';
    expect(partsOf(room('G3 Bath alcove'), 1)).toEqual([
      {
        id: soffit, kind: 'soffit', x: 0, z: 84, width: 72, height: 12,
        back: 0, front: 14, coversBoxEdges: false, opaque: false,
      },
      {
        id: wing, kind: 'wing_wall', x: 72, z: 0, width: 4.5, height: 96,
        back: 0, front: 30, coversBoxEdges: false, opaque: false,
        openEdges: ['left', 'right'],
        lines: [{ x1: 72, z1: 0, x2: 72, z2: 96 }, { x1: 76.5, z1: 0, x2: 76.5, z2: 96 }],
      },
    ]);
    const flush = structuredClone(stored('G3 Bath alcove'));
    flush.walls[1].soffits[0].depth = 30;
    const [deep, wall] = partsOf(syncRoom(flush, settings), 1);
    expect(deep.openEdges).toEqual(['right']);
    expect(wall.lines).toEqual([{ x1: 72, z1: 0, x2: 72, z2: 84 }, { x1: 76.5, z1: 0, x2: 76.5, z2: 96 }]);
  });

  it('outlines a recess at the wall face and a projection out from it (G5)', () => {
    const r1 = '61c07d7e-ec8b-4306-9825-9f3decfb5fa1';
    const r2 = '56ed5f83-a17f-4d5b-9bcf-b72501cecc4d';
    expect(partsOf(room('G5 Recess room'), 1).map(row)).toEqual([
      [r1, 'recess', 32, 0, 48, 96, -12, 0],
      [r2, 'recess', 140, 0, 48, 96, -24, 0],
    ]);
    const built = structuredClone(stored('G5 Recess room'));
    Object.assign(built.walls[1].recesses[0], { kind: 'projection', bottom: 6, height: 60 });
    expect(row(partsOf(syncRoom(built, settings), 1)[0])).toEqual([r1, 'projection', 32, 6, 48, 60, 0, 12]);
  });
});
