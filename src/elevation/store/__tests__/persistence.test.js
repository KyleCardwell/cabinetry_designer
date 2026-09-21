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

function tbtDocument() {
  const document = migrateV1Document(v1Document());
  const wall = document.rooms[0].walls[0];
  const run = (id, cabinetTypeId, x, width, height, anchors) => ({
    id,
    cabinetTypeId,
    x,
    width,
    z: 4,
    height,
    depth: 24,
    ends: {
      left: { type: 'none', width: null },
      right: { type: 'none', width: null },
    },
    autoCount: false,
    maxCabinetWidth: null,
    items: [{ id: `${id}-cabinet`, kind: 'cabinet', width: null }],
    heightMode: 'manual',
    overrides: {},
    anchors,
  });
  wall.runs = [
    run('T1', CABINET_TYPE_IDS.TALL, 0, 24, 80, {
      left: false,
      right: { to: 'joint', jointId: 'J1', offset: 0 },
    }),
    run('B', CABINET_TYPE_IDS.BASE, 24, 36, 30.5, {
      left: { to: 'joint', jointId: 'J1', offset: 0 },
      right: { to: 'joint', jointId: 'J2', offset: 0 },
    }),
    run('T2', CABINET_TYPE_IDS.TALL, 60, 24, 80, {
      left: { to: 'joint', jointId: 'J2', offset: 0 },
      right: false,
    }),
  ];
  wall.joints = [{ id: 'J1', x: 24 }, { id: 'J2', x: 60 }];
  document.rooms[0].walls[1].joints = [];
  return document;
}

afterEach(() => {
  delete globalThis.window;
});

describe('elevation persistence migration', () => {
  it('60. defaults missing joints and round-trips joined runs unchanged', () => {
    const withoutJoints = migrateV1Document(v1Document());
    globalThis.window = {
      localStorage: storageWith([[
        ELEVATION_STORAGE_KEY,
        JSON.stringify(withoutJoints),
      ]]),
    };

    const loadedWithoutJoints = loadElevationDocument();
    expect(loadedWithoutJoints.rooms.every((room) => (
      room.walls.every((wall) => Array.isArray(wall.joints) && wall.joints.length === 0)
    ))).toBe(true);

    const joined = tbtDocument();
    globalThis.window = {
      localStorage: storageWith([[ELEVATION_STORAGE_KEY, JSON.stringify(joined)]]),
    };
    expect(isElevationDocument(joined)).toBe(true);
    expect(loadElevationDocument()).toEqual(joined);
  });

  it('61. clears missing joint anchors and rejects invalid joint offsets', () => {
    const stale = tbtDocument();
    stale.rooms[0].walls[0].runs[0].anchors.right.jointId = 'J9';
    globalThis.window = {
      localStorage: storageWith([[ELEVATION_STORAGE_KEY, JSON.stringify(stale)]]),
    };
    expect(loadElevationDocument().rooms[0].walls[0].runs[0].anchors.right).toBe(false);

    const malformed = tbtDocument();
    malformed.rooms[0].walls[0].runs[0].anchors.right.offset = 'x';
    expect(isElevationDocument(malformed)).toBe(false);
    globalThis.window = {
      localStorage: storageWith([[ELEVATION_STORAGE_KEY, JSON.stringify(malformed)]]),
    };
    expect(loadElevationDocument()).toBeNull();
  });

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

  it('43. round-trips styles, run face options and manual reveals', () => {
    const current = migrateV1Document(v1Document());
    const room = current.rooms[0];
    const run = room.walls[0].runs[0];
    const item = run.items[0];
    room.style = { cabinetStyleId: 14 };
    run.style = { beadWidth: 0.5, profiledEdge: null };
    run.upperBottom = 'flush';
    run.top = 'wood';
    item.style = { cabinetStyleId: 15, profiledEdge: true };
    item.reveals = { top: 0.1875, left: null };
    expect(isElevationDocument(current)).toBe(true);
    globalThis.window = {
      localStorage: storageWith([[ELEVATION_STORAGE_KEY, JSON.stringify(current)]]),
    };

    const loaded = loadElevationDocument();
    const loadedRun = loaded.rooms[0].walls[0].runs[0];
    expect(loaded.rooms[0].style).toEqual({ cabinetStyleId: 14 });
    expect(loadedRun).toMatchObject({ style: { beadWidth: 0.5, profiledEdge: null }, upperBottom: 'flush', top: 'wood' });
    expect(loadedRun.items[0]).toMatchObject({
      style: { cabinetStyleId: 15, profiledEdge: true },
      reveals: { top: 0.1875, left: null },
    });
  });

  it('44. rejects malformed styles, run face options and reveals', () => {
    const current = migrateV1Document(v1Document());
    const room = current.rooms[0];
    const run = room.walls[0].runs[0];
    const item = run.items[0];
    const check = (mutate, undo) => {
      mutate();
      expect(isElevationDocument(current)).toBe(false);
      undo();
      expect(isElevationDocument(current)).toBe(true);
    };
    check(() => { room.style = { cabinetStyleId: 99 }; }, () => { delete room.style; });
    check(() => { run.style = { beadWidth: -0.25 }; }, () => { run.style = null; });
    check(() => { run.upperBottom = 'floating'; }, () => { delete run.upperBottom; });
    check(() => { run.top = 'quartz'; }, () => { run.top = 'stone'; });
    check(() => { item.style = { finish: 'paint' }; }, () => { item.style = {}; });
    check(() => { item.reveals = { pair: 0.125 }; }, () => { item.reveals = null; });
  });

  it('45. defaults the style settings on documents saved before them', () => {
    const current = migrateV1Document(v1Document());
    for (const key of ['defaultStyle', 'insetFrame', 'profiledFit', 'woodTopReveal', 'capturedSingleReveal']) {
      delete current.settings[key];
    }
    globalThis.window = {
      localStorage: storageWith([[ELEVATION_STORAGE_KEY, JSON.stringify(current)]]),
    };

    const loaded = loadElevationDocument();
    expect(loaded.settings.defaultStyle).toEqual({ cabinetStyleId: 13, beadWidth: 0.25, profiledEdge: false });
    expect(loaded.settings.insetFrame).toEqual(DEFAULT_SETTINGS.insetFrame);
    expect(loaded.settings.profiledFit).toEqual(DEFAULT_SETTINGS.profiledFit);
    expect(loaded.settings.woodTopReveal).toBe(0.125);
    expect(loaded.settings.capturedSingleReveal).toBe(0.09375);
  });

  it('54. defaults the standard drawer settings on documents saved before them', () => {
    const current = migrateV1Document(v1Document());
    delete current.settings.standardDrawerHeights;
    delete current.settings.standardDrawerBelow;
    globalThis.window = {
      localStorage: storageWith([[ELEVATION_STORAGE_KEY, JSON.stringify(current)]]),
    };

    const loaded = loadElevationDocument();
    expect(loaded.settings.standardDrawerHeights).toEqual({ european: 5.875, faceFrame: 5 });
    expect(loaded.settings.standardDrawerBelow).toBe(6);
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

describe('wall side persistence', () => {
  it('105. accepts valid wall sides and rejects invalid run and joint sides', () => {
    const valid = tbtDocument();
    valid.rooms[0].walls[0].runs[0].wallSide = 'back';
    expect(isElevationDocument(valid)).toBe(true);

    const invalidRun = tbtDocument();
    invalidRun.rooms[0].walls[0].runs[0].wallSide = 'side';
    expect(isElevationDocument(invalidRun)).toBe(false);

    const invalidJoint = tbtDocument();
    invalidJoint.rooms[0].walls[0].joints[0].wallSide = 'up';
    expect(isElevationDocument(invalidJoint)).toBe(false);
  });
});

describe('wall end panel persistence', () => {
  it('125. validates complete endpoint panel shapes when present', () => {
    const valid = tbtDocument();
    valid.rooms[0].walls[0].endPanels = { start: { width: null }, end: null };
    expect(isElevationDocument(valid)).toBe(true);

    const invalidWidth = tbtDocument();
    invalidWidth.rooms[0].walls[0].endPanels = { start: { width: 'x' }, end: null };
    expect(isElevationDocument(invalidWidth)).toBe(false);

    const missingEnd = tbtDocument();
    missingEnd.rooms[0].walls[0].endPanels = { start: null };
    expect(isElevationDocument(missingEnd)).toBe(false);

    const omitted = tbtDocument();
    delete omitted.rooms[0].walls[0].endPanels;
    expect(isElevationDocument(omitted)).toBe(true);
  });
});
