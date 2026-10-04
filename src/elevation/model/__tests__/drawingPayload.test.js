import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { drawingZipName, toDrawingPayload } from '../drawingPayload.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const room = (name) => syncRoom(document.rooms.find((candidate) => candidate.name === name), settings);

describe('SPEC-40 drawing payload', () => {
  it('has one elevation per lettered wall face, in letter order', () => {
    const island = '84063fed-ab0d-4a1d-ae05-ffe67decad5e';
    expect(toDrawingPayload(room('G1 Euro kitchen'), settings)).toEqual({
      payloadVersion: 1,
      units: 'in',
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
});
