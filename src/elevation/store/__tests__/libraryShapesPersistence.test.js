import { afterEach, expect, it, vi } from 'vitest';
import { room } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { newShape } from '../../model/libraryShapes.js';
import { copySettings } from '../slices/helpers.js';
import {
  ELEVATION_SCHEMA_VERSION, ELEVATION_STORAGE_KEY, isElevationDocument,
  loadElevationDocument, normalizeElevationDocument, toElevationDocument,
} from '../persistence.js';

afterEach(() => vi.unstubAllGlobals());

it('SH2 defaults missing sandbox shapes to an empty library and deep-copies shape settings', () => {
  const settings = copySettings();
  expect(settings.shapes).toEqual([]);
  expect(settings.shapes).not.toBe(DEFAULT_SETTINGS.shapes);
  delete settings.shapes;
  expect(copySettings(settings).shapes).toEqual([]);
  const document = {
    schemaVersion: ELEVATION_SCHEMA_VERSION, settings, rooms: [room()],
    activeRoomId: 'room-1', activeWallId: null, view: 'elevation',
  };
  const serialized = JSON.stringify(document);
  vi.stubGlobal('window', { localStorage: { getItem: (key) => key === ELEVATION_STORAGE_KEY ? serialized : null } });
  const loaded = loadElevationDocument();
  expect(isElevationDocument(loaded)).toBe(true);
  expect(loaded.settings.shapes).toEqual([]);
  expect(document.settings.shapes).toBeUndefined();
  const shape = newShape([], 'shape-1');
  settings.shapes = [shape];
  const copied = copySettings(settings);
  copied.shapes[0].views.front.points.p1[0] = 1;
  copied.shapes[0].box.w = 2;
  copied.shapes.push(newShape([], 'shape-2'));
  expect(shape.views.front.points.p1).toEqual([0, 0]);
  expect(shape.box.w).toBe(12);
  expect(settings.shapes).toHaveLength(1);
});

it('SH2 round-trips archived and live shapes and rejects malformed or conflicting sandbox libraries', () => {
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
