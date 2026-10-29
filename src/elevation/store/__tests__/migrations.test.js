import { afterEach, describe, expect, it, vi } from 'vitest';
import { room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import * as migrations from '../migrations.js';
import {
  ELEVATION_SCHEMA_VERSION,
  ELEVATION_STORAGE_KEY,
  loadElevationDocument,
  roomFromDocument,
} from '../persistence.js';

function currentDocument() {
  return {
    schemaVersion: 4,
    settings: structuredClone(DEFAULT_SETTINGS),
    rooms: [room({ walls: [wall({ runs: [run()] })], wallOrder: ['wall-1'] })],
    activeRoomId: null,
    activeWallId: null,
    view: 'plan',
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AU2 c numbered migrations', () => {
  it('leaves a current document equal and unmutated with the real empty list', () => {
    const document = currentDocument();
    const before = structuredClone(document);
    expect(migrations.MIGRATIONS).toEqual([]);
    expect(migrations.migrateDocument(document)).toEqual(before);
    expect(document).toEqual(before);
    expect(ELEVATION_SCHEMA_VERSION).toBe(4);
    expect(ELEVATION_STORAGE_KEY).toBe('cd.elevationLab.v4');
  });

  it('runs 2 → 3 → 4 in order on a copy of the full document', () => {
    const document = { ...currentDocument(), schemaVersion: 2 };
    const before = structuredClone(document);
    const calls = [];
    const list = [
      { from: 2, to: 3, note: 'SPEC-test-2', up(document) {
        calls.push(document.schemaVersion);
        document.settings.stoneTopReveal = 0.5;
        document.rooms[0].name = 'Upgraded room';
        return document;
      } },
      { from: 3, to: 4, note: 'SPEC-test-3', up(document) {
        calls.push(document.schemaVersion);
        expect(document.settings.stoneTopReveal).toBe(0.5);
        expect(document.rooms[0].name).toBe('Upgraded room');
        document.rooms[0].walls[0].name = 'Upgraded wall';
        return document;
      } },
    ];
    const result = migrations.migrateDocument(document, list);
    expect(calls).toEqual([2, 3]);
    expect(result.schemaVersion).toBe(4);
    expect(result.rooms[0].walls[0].name).toBe('Upgraded wall');
    expect(document).toEqual(before);
  });

  it('returns schema 2 unchanged when only 3 → 4 is available', () => {
    const document = { ...currentDocument(), schemaVersion: 2 };
    const before = structuredClone(document);
    const up = vi.fn();
    const result = migrations.migrateDocument(document, [
      { from: 3, to: 4, note: 'SPEC-test-3', up },
    ]);
    expect(result).toEqual(before);
    expect(document).toEqual(before);
    expect(up).not.toHaveBeenCalled();
  });

  it('returns the original document if the chain runs out after an upgrade', () => {
    const document = { ...currentDocument(), schemaVersion: 2 };
    const before = structuredClone(document);
    const result = migrations.migrateDocument(document, [
      { from: 2, to: 3, note: 'SPEC-test-2', up(document) {
        document.settings.stoneTopReveal = 0.5;
        document.rooms[0].name = 'Partial upgrade';
        return document;
      } },
    ]);
    expect(result).toEqual(before);
    expect(document).toEqual(before);
  });

  it.each([4, 5])('does not run migrations for schema %s', (schemaVersion) => {
    const document = { ...currentDocument(), schemaVersion };
    const before = structuredClone(document);
    const up = vi.fn();
    expect(migrations.migrateDocument(document, [
      { from: schemaVersion, to: schemaVersion + 1, note: 'SPEC-test', up },
    ])).toEqual(before);
    expect(up).not.toHaveBeenCalled();
    expect(document).toEqual(before);
  });

  it.each([
    [3, 'This room uses an unsupported older format (version 3).'],
    [5, 'This room was saved by a newer version of the designer. Reload the page to update, then open it again.'],
  ])('preserves the schema %s room rejection and message with the real empty list', (version, message) => {
    const document = currentDocument();
    expect(roomFromDocument(document.rooms[0], version, document.settings)).toEqual({
      ok: false, reason: 'schema', message,
    });
  });

  it.each(['sandbox', 'room'])('migrates the full %s document before normalization', (source) => {
    const document = { ...currentDocument(), schemaVersion: 3 };
    delete document.settings.stoneTopReveal;
    const before = structuredClone(document);
    const up = vi.fn((document) => {
      expect(document.settings.stoneTopReveal).toBeUndefined();
      document.settings.stoneTopReveal = 0.5;
      document.rooms[0].name = 'Upgraded room';
      return document;
    });
    const list = [{ from: 3, to: 4, note: 'SPEC-test-3', up }];
    const migrateDocument = migrations.migrateDocument;
    vi.spyOn(migrations, 'migrateDocument').mockImplementation((document) => migrateDocument(document, list));

    if (source === 'sandbox') {
      vi.stubGlobal('window', { localStorage: {
        getItem: (key) => key === ELEVATION_STORAGE_KEY ? JSON.stringify(document) : null,
      } });
      const loaded = loadElevationDocument();
      expect(loaded?.schemaVersion).toBe(4);
      expect(loaded?.settings.stoneTopReveal).toBe(0.5);
      expect(loaded?.rooms[0].name).toBe('Upgraded room');
    } else {
      expect(roomFromDocument(document.rooms[0], 3, document.settings)).toMatchObject({
        ok: true, room: { name: 'Upgraded room' },
      });
    }
    expect(up).toHaveBeenCalledOnce();
    expect(document).toEqual(before);
    expect(migrations.MIGRATIONS).toEqual([]);
  });
});
