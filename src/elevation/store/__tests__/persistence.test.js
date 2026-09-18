import { afterEach, describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { wallFrame } from '../../model/geometry.js';
import {
  ELEVATION_STORAGE_KEY,
  LEGACY_ELEVATION_STORAGE_KEY,
  isElevationDocument,
  loadElevationDocument,
  migrateV1Document,
} from '../persistence.js';

function v1Run(id, x, z, height) {
  return {
    id,
    cabinetTypeId: CABINET_TYPE_IDS.BASE,
    x,
    width: 48,
    z,
    height,
    depth: 24,
    ends: {
      left: { type: 'filler', width: null },
      right: { type: 'filler', width: null },
    },
    autoCount: false,
    maxCabinetWidth: null,
    items: [{ id: `${id}-cab`, kind: 'cabinet', width: 45 }],
  };
}

function v1Document() {
  return {
    schemaVersion: 1,
    settings: {
      toeKickHeight: 4,
      baseBoxHeight: 30.5,
      baseDepth: 24,
      countertopThickness: 1.5,
      upperBottomZ: 60,
      upperBoxHeight: 30,
      upperDepth: 12,
      tallBoxHeight: 84,
      tallDepth: 24,
      roundTo: 0.5,
      maxCabinetWidth: 36,
      minCabinetWidth: 9,
      fillerMinWidth: 1.5,
      fillerWarnWidth: 6,
      endPanelThickness: 0.75,
      defaultInteriorFillerWidth: 3,
      minRunWidth: 9,
      snapHeightsToDefaults: true,
      defaultEnds: { left: 'filler', right: 'filler' },
    },
    walls: [
      { id: 'wall-a', name: 'Wall A', length: 144, height: 96, runs: [v1Run('a', 12, 4, 30.5)] },
      { id: 'wall-b', name: 'Wall B', length: 96, height: 90, runs: [v1Run('b', 7, 10, 20)] },
    ],
    activeWallId: 'wall-b',
  };
}

function storageWith(entries) {
  const values = new Map(entries);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

afterEach(() => {
  delete globalThis.window;
});

describe('elevation persistence migration', () => {
  it('18. migrates v1 walls and runs without deleting the v1 key', () => {
    const legacy = JSON.stringify(v1Document());
    const localStorage = storageWith([
      [LEGACY_ELEVATION_STORAGE_KEY, legacy],
      [ELEVATION_STORAGE_KEY, '{'],
    ]);
    globalThis.window = { localStorage };

    const migrated = loadElevationDocument();
    const room = migrated.rooms[0];
    expect(migrated).toMatchObject({
      schemaVersion: 2,
      activeRoomId: room.id,
      activeWallId: 'wall-b',
      view: 'elevation',
    });
    expect(room.name).toBe('Room 1');
    expect(migrated.settings.defaultProfile).toMatchObject({
      toeKickHeight: 4,
      baseBoxHeight: 30.5,
      countertopThickness: 1.5,
      upperClearance: 24,
    });
    expect(room.profile).toEqual(migrated.settings.defaultProfile);
    expect(room.walls.map((wall) => [wall.x1, wall.y1, wall.x2, wall.y2]))
      .toEqual([[0, 0, 144, 0], [0, 60, 96, 60]]);
    expect(room.walls.every((wall) => wallFrame(room, wall).leftEndpoint === 'start')).toBe(true);
    expect(room.walls[0].runs[0]).toMatchObject({
      x: 12,
      z: 4,
      height: 30.5,
      heightMode: 'manual',
      overrides: {},
      anchors: { left: false, right: false },
    });
    expect(room.walls[1].runs[0]).toMatchObject({ x: 7, z: 10, height: 20 });
    expect(localStorage.getItem(LEGACY_ELEVATION_STORAGE_KEY)).toBe(legacy);
  });

  it('defaults new optional wall fields and normalizes generated names on v2 load', () => {
    const current = migrateV1Document(v1Document());
    current.rooms[0].walls[0].name = 'Wall 7';
    delete current.rooms[0].walls[0].numberOverride;
    delete current.rooms[0].wallOrder;
    delete current.settings.autoEndPanelOnFreeEnd;
    delete current.settings.adjacentRunGap;
    delete current.settings.maxRunOverhang;
    for (const key of [
      'casingWidth',
      'casingThickness',
      'openingsHaveCasing',
      'defaultOpeningMeasureMode',
      'defaultDoorWidth',
      'defaultDoorHeight',
      'defaultWindowWidth',
      'defaultWindowHeight',
      'defaultWindowSillZ',
      'minOpeningWidth',
      'openingSnap',
    ]) delete current.settings[key];
    globalThis.window = {
      localStorage: storageWith([[ELEVATION_STORAGE_KEY, JSON.stringify(current)]]),
    };

    const loaded = loadElevationDocument();
    expect(loaded.rooms[0].walls[0]).toMatchObject({
      name: '',
      numberOverride: null,
    });
    expect(loaded.rooms[0].wallOrder).toEqual(['wall-a', 'wall-b']);
    expect(loaded.settings).toMatchObject({
      autoEndPanelOnFreeEnd: true,
      adjacentRunGap: 1,
      maxRunOverhang: 36,
      casingWidth: DEFAULT_SETTINGS.casingWidth,
      casingThickness: DEFAULT_SETTINGS.casingThickness,
      openingsHaveCasing: DEFAULT_SETTINGS.openingsHaveCasing,
      defaultOpeningMeasureMode: DEFAULT_SETTINGS.defaultOpeningMeasureMode,
      defaultDoorWidth: DEFAULT_SETTINGS.defaultDoorWidth,
      defaultDoorHeight: DEFAULT_SETTINGS.defaultDoorHeight,
      defaultWindowWidth: DEFAULT_SETTINGS.defaultWindowWidth,
      defaultWindowHeight: DEFAULT_SETTINGS.defaultWindowHeight,
      defaultWindowSillZ: DEFAULT_SETTINGS.defaultWindowSillZ,
      minOpeningWidth: DEFAULT_SETTINGS.minOpeningWidth,
      openingSnap: DEFAULT_SETTINGS.openingSnap,
    });
  });

  it('24. defaults a missing v2 openings array and validates the result', () => {
    const current = migrateV1Document(v1Document());
    delete current.rooms[0].walls[0].openings;
    expect(isElevationDocument(current)).toBe(true);
    globalThis.window = {
      localStorage: storageWith([[ELEVATION_STORAGE_KEY, JSON.stringify(current)]]),
    };

    const loaded = loadElevationDocument();
    expect(loaded.rooms[0].walls[0].openings).toEqual([]);
    expect(isElevationDocument(loaded)).toBe(true);
  });

  it('25. rejects a malformed opening so the editor can start fresh', () => {
    const current = migrateV1Document(v1Document());
    current.rooms[0].walls[0].openings.push({
      id: 'door-1',
      kind: 'door',
      label: 'D1',
      measureMode: 'rough',
      width: 36,
      height: 80,
      sillZ: 0,
      offset: 24,
      offsetFrom: 'left',
      casing: { width: 3, thickness: 0.75 },
    });
    globalThis.window = {
      localStorage: storageWith([[ELEVATION_STORAGE_KEY, JSON.stringify(current)]]),
    };

    expect(isElevationDocument(current)).toBe(false);
    expect(loadElevationDocument()).toBeNull();
  });
});
