import { afterEach, expect, it, vi } from 'vitest';
import { room } from '../../../test/builders.js';
import { newShape } from '../../model/libraryShapes.js';
import { copySettings } from '../slices/helpers.js';
import {
  ELEVATION_SCHEMA_VERSION, ELEVATION_STORAGE_KEY, isElevationDocument,
  loadElevationDocument, normalizeElevationDocument, toElevationDocument,
} from '../persistence.js';

afterEach(() => vi.unstubAllGlobals());

it('round-trips archived and live shapes and rejects malformed or conflicting sandbox libraries (SH2)', () => {
  const shape = newShape([], 'shape-1');
  const settings = copySettings();
  settings.shapes = [shape, { ...shape, id: 'archived', archived: true }];
  const document = toElevationDocument({
    schemaVersion: ELEVATION_SCHEMA_VERSION, settings, rooms: [room()],
    activeRoomId: 'room-1', activeWallId: null, view: 'elevation',
  });
  const storage = new Map([[ELEVATION_STORAGE_KEY, JSON.stringify(document)]]);
  vi.stubGlobal('window', { localStorage: { getItem: (key) => storage.get(key) ?? null } });
  expect(loadElevationDocument().settings.shapes).toEqual(settings.shapes);
  for (const shapes of [null, {}, [null], [{ ...shape, extra: true }],
    [shape, { ...shape, id: 'duplicate-name', name: 'NEW SHAPE' }],
    [shape, { ...shape, name: 'Different' }], [{ ...shape, stretch: { x: [[-1, 10]] } }]]) {
    const invalid = { ...document, settings: { ...settings, shapes } };
    expect(isElevationDocument(normalizeElevationDocument(invalid))).toBe(false);
    storage.set(ELEVATION_STORAGE_KEY, JSON.stringify(invalid));
    expect(loadElevationDocument()).toBeNull();
  }
});
