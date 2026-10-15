import { describe, expect, it } from 'vitest';
import { projectAddress, nextName, copyName, newRoomDocument, ROOM_STATUS_LABELS } from '../index.js';

describe('DB5 a project helpers', () => {
  it('starts names at the count plus one and skips occupied names (anchor 4)', () => {
    expect(nextName('Phase', ['Phase 1', 'Phase 2'])).toBe('Phase 3');
    expect(nextName('Room', ['Room 1', 'Room 3'])).toBe('Room 4');
    expect(nextName('Room', [])).toBe('Room 1');
    expect(nextName('Room', ['Room 4', 'Room 5', 'Kitchen'])).toBe('Room 6');
  });

  it('joins nonblank address parts, including a lone state or zip (anchor 5)', () => {
    expect(projectAddress({ street: '12 Elm', city: 'Provo', state: 'UT', zip: '84601' })).toBe('12 Elm, Provo, UT 84601');
    expect(projectAddress({ city: 'Provo' })).toBe('Provo');
    expect(projectAddress({})).toBe('');
    expect(projectAddress({ street: '  ', city: null, state: ' UT ', zip: '' })).toBe('UT');
    expect(projectAddress({ state: ' ', zip: '84601' })).toBe('84601');
  });

  it('creates the stored room shape at schema version 4 with fresh IDs (anchor 6)', () => {
    const { document, schemaVersion } = newRoomDocument('Kitchen');
    expect(schemaVersion).toBe(4);
    expect(document).toEqual({ id: expect.any(String), name: 'Kitchen', walls: [], wallOrder: [],
      profile: {}, partNumberStart: 1, partNumberOverrides: {}, reportParts: {}, reportNote: '' });
    const second = newRoomDocument('Kitchen');
    expect(second.document.id).not.toBe(document.id);
    document.walls.push({ id: 'wall' });
    expect(second.document.walls).toEqual([]);
  });

  it('provides copy names and the three room status labels', () => {
    expect(copyName('Kitchen')).toBe('Kitchen copy');
    expect(ROOM_STATUS_LABELS).toEqual({ drafting: 'Drafting', approved: 'Approved', released: 'Released to shop' });
  });
});
