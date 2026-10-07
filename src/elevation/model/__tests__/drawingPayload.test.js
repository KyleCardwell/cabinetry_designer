import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { drawingZipName, toDrawingPayload } from '../drawingPayload.js';
import { bandParts } from '../bandParts.js';
import { elevationParts } from '../elevationParts.js';
import { wallParts } from '../wallParts.js';
import { cornerParts } from '../cornerParts.js';
import { elevationDimensions } from '../elevationDimensions.js';
import { elevationMarks } from '../elevationMarks.js';
import { planParts } from '../planParts.js';
import { planDimensions } from '../planDimensions.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const room = (name) => syncRoom(document.rooms.find((candidate) => candidate.name === name), settings);

/** The round-40 fields only, so the first test keeps checking just those. */
const withoutParts = (payload) => ({
  ...payload,
  plan: undefined,
  elevations: payload.elevations.map((elevation) => {
    const copy = { ...elevation };
    delete copy.parts;
    delete copy.dimensions;
    delete copy.marks;
    return copy;
  }),
});

describe('SPEC-40 drawing payload', () => {
  it('has one elevation per lettered wall face, in letter order', () => {
    const island = '84063fed-ab0d-4a1d-ae05-ffe67decad5e';
    expect(withoutParts(toDrawingPayload(room('G1 Euro kitchen'), settings))).toEqual({
      payloadVersion: 1,
      units: 'in',
      plotScale: 24,
      room: { id: '7ee9fabb-5daf-4fb2-96f9-b24b9e1e546f', name: 'G1 Euro kitchen' },
      elevations: [
        {
          key: 'cb33d774-f31e-41c1-bbe4-198cbf981619', letter: 'A', wallId: 'cb33d774-f31e-41c1-bbe4-198cbf981619',
          side: 'front', title: 'Elevation A', wallLabel: 'Wall 1', length: 168, height: 96,
        },
        {
          key: '4afd9749-bbe8-4848-8a67-a1d063bdfce8', letter: 'B', wallId: '4afd9749-bbe8-4848-8a67-a1d063bdfce8',
          side: 'front', title: 'Elevation B', wallLabel: 'Wall 2', length: 120, height: 96,
        },
        {
          key: island, letter: 'C', wallId: island,
          side: 'front', title: 'Elevation C', wallLabel: 'Wall 4', length: 91.5, height: 36,
        },
        {
          key: `${island}:back`, letter: 'D', wallId: island,
          side: 'back', title: 'Elevation D', wallLabel: 'Wall 4', length: 91.5, height: 36,
        },
      ],
    });
    expect(toDrawingPayload(room('G3 Bath alcove'), settings).elevations.map(
      ({ letter, wallLabel, length, height }) => [letter, wallLabel, length, height],
    )).toEqual([['A', 'Wall 2', 168, 96]]);
  });

  it('names the zip after the room', () => {
    expect(drawingZipName('G1 Euro kitchen')).toBe('g1-euro-kitchen.zip');
    expect(drawingZipName('Bath #2 / Main')).toBe('bath-2-main.zip');
    expect(drawingZipName('  ')).toBe('room.zip');
  });

  it('SPEC-42.2 carries each wall face\'s parts, its bands, the wall\'s own parts, then its neighbours', () => {
    const synced = room('G1 Euro kitchen');
    const payload = toDrawingPayload(synced, settings);
    expect(payload.elevations.map((elevation) => elevation.parts.length)).toEqual([40, 34, 13, 13]);
    for (const elevation of payload.elevations) {
      const wall = synced.walls.find((candidate) => candidate.id === elevation.wallId);
      expect(elevation.parts).toEqual([
        ...elevationParts(synced, wall, elevation.side, settings),
        ...bandParts(synced, wall, elevation.side, settings),
        ...wallParts(synced, wall, elevation.side, settings),
        ...cornerParts(synced, wall, elevation.side, settings),
      ]);
    }
  });

  it('SPEC-43 carries each wall face\'s dimensions', () => {
    const synced = room('G1 Euro kitchen');
    const payload = toDrawingPayload(synced, settings);
    expect(payload.elevations.map((elevation) => elevation.dimensions.length)).toEqual([38, 30, 17, 17]);
    for (const elevation of payload.elevations) {
      const wall = synced.walls.find((candidate) => candidate.id === elevation.wallId);
      expect(elevation.dimensions).toEqual(elevationDimensions(synced, wall, elevation.side, settings));
    }
  });

  it('SPEC-43.3 carries each wall face\'s centreline marks', () => {
    const synced = room('G1 Euro kitchen');
    const payload = toDrawingPayload(synced, settings);
    expect(payload.elevations.map((elevation) => elevation.marks.length)).toEqual([1, 0, 0, 0]);
    for (const elevation of payload.elevations) {
      const wall = synced.walls.find((candidate) => candidate.id === elevation.wallId);
      expect(elevation.marks).toEqual(elevationMarks(synced, wall, elevation.side, settings));
    }
  });

  it('SPEC-44 carries the room in plan', () => {
    const synced = room('G1 Euro kitchen');
    const { plan } = toDrawingPayload(synced, settings);
    expect(Object.keys(plan)).toEqual(['parts', 'dimensions']);
    expect(plan.parts).toHaveLength(76);
    expect(plan.parts).toEqual(planParts(synced, settings));
  });

  it('SPEC-45 carries the plan dimensions', () => {
    const synced = room('G1 Euro kitchen');
    const { plan } = toDrawingPayload(synced, settings);
    expect(plan.dimensions).toHaveLength(7);
    expect(plan.dimensions).toEqual(planDimensions(synced, settings));
  });
});
