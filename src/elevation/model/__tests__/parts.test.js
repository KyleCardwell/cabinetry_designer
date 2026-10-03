import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { partNumbers } from '../partNumbers.js';
import { roomParts } from '../parts.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

vi.mock('uuid', () => {
  let count = 0;
  return { v4: () => `parts-${(count += 1)}` };
});

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const synced = document.rooms.map((room) => syncRoom(room, settings));

describe('SPEC-39 the parts list', () => {
  it('is what part numbers number, in the same order, in every golden room', () => {
    for (const room of synced) {
      expect(roomParts(room, settings).map(({ key }) => key))
        .toEqual(partNumbers(room, settings).parts.map(({ key }) => key));
    }
  });

  it('gives every part its source, and every part but moldings a rectangle', () => {
    for (const room of synced) {
      for (const part of roomParts(room, settings)) {
        expect(['piece', 'tee', 'frame', 'wall_end_panel', 'molding']).toContain(part.source);
        if (part.source === 'molding') {
          expect([part.x, part.z, part.height]).toEqual([null, null, null]);
        } else {
          expect([part.x, part.z, part.height, part.width].every(Number.isFinite)).toBe(true);
          expect(part.height).toBeGreaterThan(0);
        }
      }
    }
  });

  it('keeps the G4 parts list as it is now', () => {
    const room = synced.find(({ name }) => name === 'G4 T-filler run');
    expect(roomParts(room, settings)).toMatchSnapshot();
  });
});
