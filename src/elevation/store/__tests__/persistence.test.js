import { afterEach, describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { gridFromItems, rootItems } from '../../model/grid.js';
import { resolvePinTarget } from '../../model/room.js';
import {
  ELEVATION_STORAGE_KEY,
  isElevationDocument,
  loadElevationDocument,
  normalizeElevationDocument,
  toElevationDocument,
} from '../persistence.js';
import { createInitialElevationState } from '../elevationSlice.js';

function storageWith(entries) {
  const values = new Map(entries);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function currentRun(id, x, z, height) {
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
    heightMode: 'manual',
    overrides: {},
    anchors: { left: false, right: false },
    grid: gridFromItems(id, [{ id: `${id}-cab`, kind: 'cabinet', width: 45 }]),
  };
}

function currentWall(id, y, length, height, runs) {
  return {
    id,
    name: '',
    numberOverride: null,
    elevationForced: false,
    x1: 0,
    y1: y,
    x2: length,
    y2: y,
    height,
    thickness: 4.5,
    flipped: false,
    connections: { start: null, end: null },
    profile: {},
    openings: [],
    runs,
  };
}

function currentDocument() {
  const settings = structuredClone(DEFAULT_SETTINGS);
  return {
    schemaVersion: 4,
    settings,
    rooms: [{
      id: 'room-1',
      name: 'Room 1',
      profile: { ...settings.defaultProfile },
      partNumberStart: 1,
      partNumberOverrides: {},
      wallOrder: ['wall-a', 'wall-b'],
      walls: [
        currentWall('wall-a', 0, 144, 96, [currentRun('a', 12, 4, 30.5)]),
        currentWall('wall-b', 60, 96, 90, [currentRun('b', 7, 10, 20)]),
      ],
    }],
    activeRoomId: 'room-1',
    activeWallId: 'wall-b',
    view: 'elevation',
  };
}

function tbtDocument() {
  const document = currentDocument();
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
    grid: gridFromItems(id, [{ id: `${id}-cabinet`, kind: 'cabinet', width: null }]),
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
    const withoutJoints = currentDocument();
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

  it('defaults new optional wall fields and normalizes generated names on current load', () => {
    const current = currentDocument();
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
    const current = currentDocument();
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
    const current = currentDocument();
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
    const current = currentDocument();
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
    const current = currentDocument();
    const column = current.rooms[0].walls[0].runs[0].grid.cols[0];
    column.pin = {
      anchor: 'center',
      from: 'opening',
      openingId: 'deleted-opening',
      openingAnchor: 'casing-left',
      value: 0,
    };
    column.absorb = true;
    expect(isElevationDocument(current)).toBe(true);
    globalThis.window = {
      localStorage: storageWith([[ELEVATION_STORAGE_KEY, JSON.stringify(current)]]),
    };

    const loaded = loadElevationDocument();
    expect(rootItems(loaded.rooms[0].walls[0].runs[0].grid)[0]).toMatchObject({
      pin: { openingId: 'deleted-opening' },
      absorb: true,
    });
    expect(resolvePinTarget(
      loaded.rooms[0].walls[0].runs[0].grid.cols[0].pin,
      loaded.rooms[0].walls[0],
      144,
      loaded.settings,
    )).toBeNull();

    column.pin.anchor = 'top';
    expect(isElevationDocument(current)).toBe(false);
  });

  it('21. round-trips a valid cabinet face and rejects a malformed one', () => {
    const current = currentDocument();
    const item = current.rooms[0].walls[0].runs[0].grid.cells[0].node;
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
    expect(loaded.rooms[0].walls[0].runs[0].grid.cells[0].node).toMatchObject({ face });

    item.face = { type: 'shelf', size: null };
    expect(isElevationDocument(current)).toBe(false);
    item.face = null;
    expect(isElevationDocument(current)).toBe(true);
  });

  it('22. defaults the face settings on documents saved before them', () => {
    const current = currentDocument();
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
    const current = currentDocument();
    const room = current.rooms[0];
    const run = room.walls[0].runs[0];
    const item = run.grid.cells[0].node;
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
    expect(loadedRun.grid.cells[0].node).toMatchObject({
      style: { cabinetStyleId: 15, profiledEdge: true },
      reveals: { top: 0.1875, left: null },
    });
  });

  it('44. rejects malformed styles, run face options and reveals', () => {
    const current = currentDocument();
    const room = current.rooms[0];
    const run = room.walls[0].runs[0];
    const item = run.grid.cells[0].node;
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
    const current = currentDocument();
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
    const current = currentDocument();
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
    const current = currentDocument();
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
    const current = currentDocument();
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

describe('wall landing persistence', () => {
  it('142. validates wall landings and wall run anchors', () => {
    const empty = tbtDocument();
    empty.rooms[0].walls[0].landings = { start: null, end: null };
    expect(isElevationDocument(empty)).toBe(true);

    const landed = tbtDocument();
    landed.rooms[0].walls[0].landings = {
      start: { wallId: 'x', side: 'front', ref: 'left', to: 'near', offset: 60 },
      end: null,
    };
    expect(isElevationDocument(landed)).toBe(true);

    const invalidLanding = tbtDocument();
    invalidLanding.rooms[0].walls[0].landings = {
      start: { wallId: 'x', side: 'front', ref: 'left', to: 'edge', offset: 60 },
      end: null,
    };
    expect(isElevationDocument(invalidLanding)).toBe(false);

    const anchored = tbtDocument();
    anchored.rooms[0].walls[0].runs[0].anchors.left = { to: 'wall', wallId: 'x' };
    expect(isElevationDocument(anchored)).toBe(true);

    const invalidAnchor = tbtDocument();
    invalidAnchor.rooms[0].walls[0].runs[0].anchors.left = { to: 'wall' };
    expect(isElevationDocument(invalidAnchor)).toBe(false);
  });
});

describe('SPEC-19 soffit persistence', () => {
  const SF = (overrides = {}) => ({
    id: 'SF',
    wallSide: 'front',
    x: 40,
    width: 60,
    bottom: 84,
    depth: 14,
    molding: 'crown',
    anchors: { left: false, right: false },
    ...overrides,
  });

  it('164. validates soffits and soffit anchors and defaults older settings', () => {
    const valid = tbtDocument();
    valid.rooms[0].walls[0].soffits = [SF()];
    expect(isElevationDocument(valid)).toBe(true);

    const invalid = tbtDocument();
    invalid.rooms[0].walls[0].soffits = [SF({ molding: 'cove' })];
    expect(isElevationDocument(invalid)).toBe(false);

    const anchored = tbtDocument();
    anchored.rooms[0].walls[0].runs[0].anchors.left = {
      to: 'soffit', soffitId: 'SF', offset: 0,
    };
    expect(isElevationDocument(anchored)).toBe(true);

    const older = tbtDocument();
    delete older.settings.defaultSoffitDepth;
    globalThis.window = {
      localStorage: storageWith([[ELEVATION_STORAGE_KEY, JSON.stringify(older)]]),
    };
    expect(loadElevationDocument().settings.defaultSoffitDepth).toBe(14);
  });
});

describe('SPEC-23 part number persistence', () => {
  it('194. validates, defaults and preserves room part number fields', () => {
    const omitted = tbtDocument();
    delete omitted.rooms[0].partNumberStart;
    delete omitted.rooms[0].partNumberOverrides;
    expect(isElevationDocument(omitted)).toBe(true);
    expect(normalizeElevationDocument(omitted).rooms[0]).toMatchObject({
      partNumberStart: 1,
      partNumberOverrides: {},
    });

    const present = tbtDocument();
    present.rooms[0].partNumberStart = 100;
    present.rooms[0].partNumberOverrides = { 'piece-1': 7 };
    expect(normalizeElevationDocument(present).rooms[0]).toMatchObject({
      partNumberStart: 100,
      partNumberOverrides: { 'piece-1': 7 },
    });

    for (const partNumberStart of [0, 1.5]) {
      const invalid = tbtDocument();
      invalid.rooms[0].partNumberStart = partNumberStart;
      expect(isElevationDocument(invalid)).toBe(false);
    }
    const invalidOverride = tbtDocument();
    invalidOverride.rooms[0].partNumberOverrides = { 'piece-1': 0 };
    expect(isElevationDocument(invalidOverride)).toBe(false);
  });

  it('195. validates, defaults and preserves the part number visibility setting', () => {
    expect(DEFAULT_SETTINGS.showPartNumbers).toBe(true);

    const omitted = tbtDocument();
    delete omitted.settings.showPartNumbers;
    expect(isElevationDocument(omitted)).toBe(true);
    expect(normalizeElevationDocument(omitted).settings.showPartNumbers).toBe(true);

    const hidden = tbtDocument();
    hidden.settings.showPartNumbers = false;
    expect(normalizeElevationDocument(hidden).settings.showPartNumbers).toBe(false);

    const invalid = tbtDocument();
    invalid.settings.showPartNumbers = 'yes';
    expect(isElevationDocument(invalid)).toBe(false);
  });
});

describe('SPEC-25 blind corner persistence', () => {
  it('206. validates optional blind widths and round-trips them unchanged', () => {
    const omitted = tbtDocument();
    expect(isElevationDocument(omitted)).toBe(true);

    const present = tbtDocument();
    present.rooms[0].walls[0].runs[0].grid.cells[0].node.blind = { left: 42 };
    globalThis.window = {
      localStorage: storageWith([[ELEVATION_STORAGE_KEY, JSON.stringify(present)]]),
    };
    expect(loadElevationDocument()).toEqual(present);

    for (const blind of [{ left: 0 }, { left: -42 }, []]) {
      const invalid = tbtDocument();
      invalid.rooms[0].walls[0].runs[0].grid.cells[0].node.blind = blind;
      expect(isElevationDocument(invalid)).toBe(false);
    }
  });
});

describe('SPEC-27 end filler persistence', () => {
  it('215. defaults return settings and validates optional end filler details', () => {
    expect(DEFAULT_SETTINGS.fillerReturnDepth).toBe(2.5);
    expect(DEFAULT_SETTINGS.fillerReturnThickness).toBe(0.75);

    const older = tbtDocument();
    delete older.settings.fillerReturnDepth;
    delete older.settings.fillerReturnThickness;
    const normalized = normalizeElevationDocument(older);
    expect(isElevationDocument(normalized)).toBe(true);
    expect(normalized.settings).toMatchObject({
      fillerReturnDepth: 2.5,
      fillerReturnThickness: 0.75,
    });

    const omitted = tbtDocument();
    expect(isElevationDocument(omitted)).toBe(true);

    const present = tbtDocument();
    present.rooms[0].walls[0].runs[0].endFiller = {
      left: { width: 6, returnDepth: 3 },
      right: null,
    };
    globalThis.window = {
      localStorage: storageWith([[ELEVATION_STORAGE_KEY, JSON.stringify(present)]]),
    };
    expect(loadElevationDocument()).toEqual(present);

    for (const endFiller of [{ left: { width: 0 } }, { left: [] }]) {
      const invalid = tbtDocument();
      invalid.rooms[0].walls[0].runs[0].endFiller = endFiller;
      expect(isElevationDocument(invalid)).toBe(false);
    }
  });
});

describe('SPEC-28 blind end persistence', () => {
  it('221. defaults and validates blind ends and zero return depth', () => {
    expect(DEFAULT_SETTINGS.blindFillerWidth).toBe(6);

    const older = tbtDocument();
    delete older.settings.blindFillerWidth;
    expect(normalizeElevationDocument(older).settings.blindFillerWidth).toBe(6);

    const blindEnd = tbtDocument();
    blindEnd.rooms[0].walls[0].runs[0].ends.left = { type: 'blind', width: null };
    expect(isElevationDocument(blindEnd)).toBe(true);

    const invalidEnd = tbtDocument();
    invalidEnd.rooms[0].walls[0].runs[0].ends.left = { type: 'corner', width: null };
    expect(isElevationDocument(invalidEnd)).toBe(false);

    const zeroReturn = tbtDocument();
    zeroReturn.rooms[0].walls[0].runs[0].endFiller = {
      left: { returnDepth: 0 },
      right: null,
    };
    globalThis.window = {
      localStorage: storageWith([[ELEVATION_STORAGE_KEY, JSON.stringify(zeroReturn)]]),
    };
    expect(loadElevationDocument()).toEqual(zeroReturn);

    for (const endFiller of [{ left: { width: 0 } }, { left: { returnDepth: -1 } }]) {
      const invalid = tbtDocument();
      invalid.rooms[0].walls[0].runs[0].endFiller = endFiller;
      expect(isElevationDocument(invalid)).toBe(false);
    }
  });

});

describe('SPEC-32 grid persistence', () => {
  const PIN = {
    anchor: 'center',
    from: 'left',
    openingId: null,
    openingAnchor: 'center',
    value: 60,
  };

  it('ignores saves under the old keys', () => {
    expect(ELEVATION_STORAGE_KEY).toBe('cd.elevationLab.v4');
    globalThis.window = {
      localStorage: storageWith([[
        'cd.elevationLab.v3',
        JSON.stringify({ ...currentDocument(), schemaVersion: 3 }),
      ]]),
    };
    expect(loadElevationDocument()).toBeNull();

    const current = currentDocument();
    globalThis.window = {
      localStorage: storageWith([[ELEVATION_STORAGE_KEY, JSON.stringify(current)]]),
    };
    expect(loadElevationDocument()).toEqual(normalizeElevationDocument(currentDocument()));
  });

  it('rejects v4 runs that keep items or blind, or hold a malformed grid', () => {
    expect(isElevationDocument(currentDocument())).toBe(true);
    const rejects = (mutate) => {
      const document = currentDocument();
      mutate(document.rooms[0].walls[0].runs[0]);
      expect(isElevationDocument(document)).toBe(false);
    };

    rejects((run) => { run.items = []; });
    rejects((run) => { run.blind = { left: 36, right: null }; });
    rejects((run) => { delete run.grid; });
    rejects((run) => { run.grid.cols[0].pin = { ...PIN, anchor: 'top' }; });
    rejects((run) => { run.grid.cells[0].node.blind = { left: 0 }; });
    rejects((run) => { run.grid.cells[0].node.blind = []; });
    rejects((run) => { run.grid.cells[0].node.blind = { top: 36 }; });
    rejects((run) => { run.grid.cells[0].node.kind = 'shelves'; });
    rejects((run) => { run.grid.cells[0].node.face = { type: 'shelf', size: null }; });
    rejects((run) => {
      run.grid.rows.push({ id: 'r2', size: null, sizeMode: 'auto' });
    });
  });

  it('the store keeps grids and saves them unchanged', () => {
    const document = currentDocument();
    document.rooms[0].walls[0].runs[0].grid = gridFromItems('a', [
      { id: 'p', kind: 'cabinet', width: null, pin: PIN },
      { id: 'l', kind: 'cabinet', width: 30 },
      { id: 'f', kind: 'filler', width: 3 },
    ], { left: 36, right: null });
    expect(isElevationDocument(document)).toBe(true);

    const state = createInitialElevationState(document);
    const storeRun = state.rooms[0].walls[0].runs[0];
    expect(storeRun.grid).toEqual(document.rooms[0].walls[0].runs[0].grid);
    expect(storeRun).not.toHaveProperty('items');
    expect(storeRun).not.toHaveProperty('blind');
    expect(toElevationDocument(state).rooms).toEqual(document.rooms);
  });
});
