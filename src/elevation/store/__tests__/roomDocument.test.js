import { describe, expect, it } from 'vitest';
import { newRoomDocument } from '../../model/designProjects.js';
import { createInitialElevationState } from '../elevationSlice.js';
import { ELEVATION_SCHEMA_VERSION, roomFromDocument, toElevationDocument, toRoomDocument } from '../persistence.js';

const settings = () => createInitialElevationState(null).settings;

describe('DB6a room documents', () => {
  it('toRoomDocument is exactly what the full document stores for a room', () => {
    const state = createInitialElevationState(null);
    expect(toElevationDocument(state).rooms).toEqual(state.rooms.map(toRoomDocument));
  });

  it('a new room document round-trips through roomFromDocument', () => {
    const { document, schemaVersion } = newRoomDocument('Kitchen');
    const loaded = roomFromDocument(document, schemaVersion, settings());
    expect(loaded.ok).toBe(true);
    expect(loaded.room).toMatchObject({ id: document.id, name: 'Kitchen', walls: [], wallOrder: [] });
    expect(toRoomDocument(loaded.room)).toEqual(document);
  });

  it('does not change the document it is given', () => {
    const { document } = newRoomDocument('Kitchen');
    const copy = structuredClone(document);
    roomFromDocument(document, ELEVATION_SCHEMA_VERSION, settings());
    expect(document).toEqual(copy);
  });

  it('refuses other schema versions and things that are not rooms', () => {
    const { document } = newRoomDocument('Kitchen');
    expect(roomFromDocument(document, ELEVATION_SCHEMA_VERSION + 1, settings())).toMatchObject({ ok: false, reason: 'schema' });
    expect(roomFromDocument(document, ELEVATION_SCHEMA_VERSION - 1, settings())).toMatchObject({ ok: false, reason: 'schema' });
    for (const bad of [null, [], 'room', { id: 1 }, { ...document, walls: 'x' }, { ...document, style: 'x' }]) {
      expect(roomFromDocument(bad, ELEVATION_SCHEMA_VERSION, settings())).toMatchObject({ ok: false, reason: 'bad_document' });
    }
  });
});
