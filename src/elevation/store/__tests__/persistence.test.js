import { afterEach, describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { wallFrame } from '../../model/geometry.js';
import { resolvePinTarget } from '../../model/room.js';
import {
  ELEVATION_STORAGE_KEY,
  LEGACY_ELEVATION_STORAGE_KEY,
  V2_ELEVATION_STORAGE_KEY,
  isElevationDocument,
  isV2ElevationDocument,
  loadElevationDocument,
  migrateV1Document,
  migrateV2Document,
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

function v2Profile(profile) {
  const {
    crownStackHeight,
    topMoldHeight,
    crownHeight,
    ...rest
  } = profile;
  return {
    ...rest,
    topMoldHeight,
    crownHeight,
    crownOverlap: topMoldHeight + crownHeight - crownStackHeight,
  };
}

function v2Document() {
  const current = migrateV1Document(v1Document());
  return {
    ...current,
    schemaVersion: 2,
    settings: {
      ...current.settings,
      defaultProfile: v2Profile(current.settings.defaultProfile),
    },
    rooms: current.rooms.map((room) => ({
      ...room,
      profile: v2Profile(room.profile),
    })),
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
      schemaVersion: 3,
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

  it('defaults new optional wall fields and normalizes generated names on current load', () => {
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
      'casingClearance',
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
      casingClearance: DEFAULT_SETTINGS.casingClearance,
    });
  });

  it('14. defaults a missing elevationForced field and rejects non-boolean values', () => {
    const current = migrateV1Document(v1Document());
    delete current.rooms[0].walls[0].elevationForced;
    globalThis.window = {
      localStorage: storageWith([[ELEVATION_STORAGE_KEY, JSON.stringify(current)]]),
    };

    const loaded = loadElevationDocument();
    expect(loaded.rooms[0].walls[0].elevationForced).toBe(false);
    expect(isElevationDocument(loaded)).toBe(true);

    loaded.rooms[0].walls[0].elevationForced = 'yes';
    expect(isElevationDocument(loaded)).toBe(false);
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

  it('defaults a missing v3 opening offset anchor to edge', () => {
    const current = migrateV1Document(v1Document());
    current.rooms[0].walls[0].openings.push({
      id: 'door-1',
      kind: 'door',
      label: 'D1',
      measureMode: 'jamb',
      width: 36,
      height: 80,
      sillZ: 0,
      offset: 24,
      offsetFrom: 'left',
      casing: { width: 3, thickness: 0.75 },
    });
    expect(isElevationDocument(current)).toBe(true);
    globalThis.window = {
      localStorage: storageWith([[ELEVATION_STORAGE_KEY, JSON.stringify(current)]]),
    };

    const loaded = loadElevationDocument();
    expect(loaded.rooms[0].walls[0].openings[0].offsetAnchor).toBe('edge');
    expect(isElevationDocument(loaded)).toBe(true);
  });

  it('validates optional cabinet pins without requiring the referenced opening', () => {
    const current = migrateV1Document(v1Document());
    const item = current.rooms[0].walls[0].runs[0].items[0];
    item.pin = {
      anchor: 'center',
      from: 'opening',
      openingId: 'deleted-opening',
      openingAnchor: 'casing-left',
      value: 0,
    };
    item.absorb = true;
    expect(isElevationDocument(current)).toBe(true);
    globalThis.window = {
      localStorage: storageWith([[ELEVATION_STORAGE_KEY, JSON.stringify(current)]]),
    };

    const loaded = loadElevationDocument();
    expect(loaded.rooms[0].walls[0].runs[0].items[0]).toMatchObject({
      pin: { openingId: 'deleted-opening' },
      absorb: true,
    });
    expect(resolvePinTarget(
      loaded.rooms[0].walls[0].runs[0].items[0].pin,
      loaded.rooms[0].walls[0],
      144,
      loaded.settings,
    )).toBeNull();

    item.pin.anchor = 'top';
    expect(isElevationDocument(current)).toBe(false);
  });

  it('21. round-trips a valid cabinet face and rejects a malformed one', () => {
    const current = migrateV1Document(v1Document());
    const item = current.rooms[0].walls[0].runs[0].items[0];
    const face = {
      direction: 'vertical',
      size: null,
      children: [
        {
          direction: 'horizontal',
          size: 6,
          children: [
            { type: 'drawer_front', size: null },
            { type: 'drawer_front', size: null },
          ],
        },
        { type: 'pair_door', size: null },
      ],
    };
    item.face = face;
    expect(isElevationDocument(current)).toBe(true);
    globalThis.window = {
      localStorage: storageWith([[ELEVATION_STORAGE_KEY, JSON.stringify(current)]]),
    };

    const loaded = loadElevationDocument();
    expect(loaded.rooms[0].walls[0].runs[0].items[0]).toMatchObject({ face });

    item.face = { type: 'shelf', size: null };
    expect(isElevationDocument(current)).toBe(false);
    item.face = null;
    expect(isElevationDocument(current)).toBe(true);
  });

  it('22. defaults the face settings on documents saved before them', () => {
    const current = migrateV1Document(v1Document());
    delete current.settings.faceReveals;
    delete current.settings.pairDoorAboveWidth;
    globalThis.window = {
      localStorage: storageWith([[ELEVATION_STORAGE_KEY, JSON.stringify(current)]]),
    };

    const loaded = loadElevationDocument();
    expect(loaded.settings.pairDoorAboveWidth).toBe(24);
    expect(loaded.settings.faceReveals).toEqual(DEFAULT_SETTINGS.faceReveals);
  });

  it('validates opening anchors on either run side', () => {
    const current = migrateV1Document(v1Document());
    const run = current.rooms[0].walls[0].runs[0];
    run.anchors.right = {
      to: 'opening',
      openingId: 'deleted-opening',
      edge: 'casing',
      clearance: null,
    };
    expect(isElevationDocument(current)).toBe(true);
    run.anchors.right.edge = 'rough';
    expect(isElevationDocument(current)).toBe(false);
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

  it('3. migrates crown totals at every v2 profile level and keeps the v2 key', () => {
    const previous = v2Document();
    const room = previous.rooms[0];
    room.walls[0].profile = {
      topMoldHeight: 3,
      crownHeight: 4.5,
      crownOverlap: 1.5,
    };
    const serialized = JSON.stringify(previous);
    const localStorage = storageWith([[V2_ELEVATION_STORAGE_KEY, serialized]]);
    globalThis.window = { localStorage };

    expect(isV2ElevationDocument(previous)).toBe(true);
    const migrated = loadElevationDocument();

    for (const profile of [
      migrated.settings.defaultProfile,
      migrated.rooms[0].profile,
      migrated.rooms[0].walls[0].profile,
    ]) {
      expect(profile.crownStackHeight).toBe(6);
      expect(profile).not.toHaveProperty('crownOverlap');
    }
    expect(migrated.schemaVersion).toBe(3);
    expect(isElevationDocument(migrated)).toBe(true);
    expect(localStorage.getItem(V2_ELEVATION_STORAGE_KEY)).toBe(serialized);
  });

  it('4. migrates a partial wall crown profile using inherited room values', () => {
    const previous = v2Document();
    previous.rooms[0].walls[0].profile = { crownHeight: 6 };

    const migrated = migrateV2Document(previous);

    expect(migrated.rooms[0].walls[0].profile).toEqual({
      crownHeight: 6,
      crownStackHeight: 7.5,
    });
    expect(isElevationDocument(migrated)).toBe(true);
  });
});
