import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { partNumbers, wallBadgeGroups, wallMoldingBadges } from '../partNumbers.js';
import { syncRoom } from '../room.js';
import { wallSideView } from '../wallSides.js';

function makeWall(id, x1, y1, x2, y2, overrides = {}) {
  return {
    id,
    name: '',
    numberOverride: null,
    elevationForced: false,
    x1,
    y1,
    x2,
    y2,
    height: 108,
    thickness: 4.5,
    flipped: false,
    connections: { start: null, end: null },
    profile: {},
    openings: [],
    joints: [],
    runs: [],
    endPanels: { start: null, end: null },
    landings: { start: null, end: null },
    soffits: [],
    ...overrides,
  };
}

const run = (id, cabinetTypeId, depth, overrides = {}) => ({
  id,
  cabinetTypeId,
  x: 0,
  width: 30,
  z: 0,
  height: 30,
  depth,
  ends: {
    left: { type: 'end_panel', width: null },
    right: { type: 'end_panel', width: null },
  },
  autoCount: true,
  maxCabinetWidth: null,
  items: [],
  heightMode: 'auto',
  overrides: {},
  anchors: { left: false, right: false },
  wallSide: 'front',
  ...overrides,
});

const base = (id, overrides = {}) => run(id, CABINET_TYPE_IDS.BASE, 24, {
  z: 4,
  height: 30.5,
  heightMode: 'manual',
  ...overrides,
});

const aBase = () => base('A-base', {
  width: 60,
  ends: {
    left: { type: 'end_panel', width: 0.75 },
    right: { type: 'filler', width: 3 },
  },
  autoCount: false,
  items: [
    { id: 'a1', kind: 'cabinet', width: 28.125 },
    { id: 'a2', kind: 'cabinet', width: 28.125 },
  ],
});

const aUpper = (overrides = {}) => run('A-upper', CABINET_TYPE_IDS.UPPER, 12, {
  width: 48,
  z: 54,
  height: 36,
  ends: {
    left: { type: 'none', width: null },
    right: { type: 'none', width: null },
  },
  autoCount: false,
  heightMode: 'manual',
  items: [{ id: 'a3', kind: 'cabinet', width: 48 }],
  ...overrides,
});

const bBase = () => base('B-base', {
  width: 30,
  ends: {
    left: { type: 'filler', width: 1.5 },
    right: { type: 'filler', width: 1.5 },
  },
  autoCount: false,
  items: [{ id: 'b1', kind: 'cabinet', width: 27 }],
});

const partWalls = ({ wallA = {}, wallB = {}, upper = {} } = {}) => [
  makeWall('A', 0, 0, 120, 0, {
    connections: { start: null, end: { wallId: 'B', endpoint: 'start' } },
    runs: [aBase(), aUpper(upper)],
    ...wallA,
  }),
  makeWall('B', 120, 0, 120, 96, {
    connections: { start: { wallId: 'A', endpoint: 'end' }, end: null },
    runs: [bBase()],
    ...wallB,
  }),
];

const partRoom = (overrides = {}) => syncRoom({
  id: 'P',
  name: 'Room P',
  profile: { ...DEFAULT_SETTINGS.defaultProfile },
  partNumberStart: 1,
  partNumberOverrides: {},
  wallOrder: ['A', 'B'],
  walls: partWalls(),
  ...overrides,
}, DEFAULT_SETTINGS);

const panelRoom = () => {
  const wBase = () => base('W-base', {
    width: 120,
    anchors: { left: true, right: true },
    ends: {
      left: { type: 'filler', width: 1.5 },
      right: { type: 'filler', width: 1.5 },
    },
    autoCount: false,
    items: [{ id: 'w1', kind: 'cabinet', width: 120 }],
  });
  return syncRoom({
    id: 'E',
    name: 'Room E',
    profile: { ...DEFAULT_SETTINGS.defaultProfile },
    partNumberStart: 1,
    partNumberOverrides: {},
    wallOrder: ['W'],
    walls: [makeWall('W', 0, 0, 120, 0, {
      endPanels: { start: { width: 0.75 }, end: { width: 0.75 } },
      runs: [wBase()],
    })],
  }, DEFAULT_SETTINGS);
};

describe('partNumbers', () => {
  it('198. walks walls, bands, runs, and pieces in shop order', () => {
    const result = partNumbers(partRoom(), DEFAULT_SETTINGS);

    expect(result.parts.map(({ key }) => key)).toEqual([
      'A-base:left', 'a1', 'a2', 'A-base:right', 'a3',
      'B-base:left', 'b1', 'B-base:right', 'molding:toeKick',
    ]);
    expect(result.parts.map(({ number }) => number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.parts.map(({ kind }) => kind)).toEqual([
      'end_panel', 'cabinet', 'cabinet', 'filler', 'cabinet',
      'filler', 'cabinet', 'filler', 'molding',
    ]);
    expect(result.parts[0]).toMatchObject({
      wallId: 'A', side: 'front', runId: 'A-base', pieceId: 'A-base:left',
      molding: null, width: 0.75,
    });
    expect(result.parts[8]).toMatchObject({
      wallId: null, side: null, runId: null, pieceId: null, molding: 'toeKick', width: null,
    });
    expect(result.byKey.get('b1')).toBe(7);
    expect(result.overrideKeys.size).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it('199. starts numbering at the room setting', () => {
    const result = partNumbers(partRoom({ partNumberStart: 101 }), DEFAULT_SETTINGS);
    expect(result.parts.map(({ number }) => number))
      .toEqual([101, 102, 103, 104, 105, 106, 107, 108, 109]);
  });

  it('200. reserves matched overrides before filling the remaining numbers', () => {
    const overridden = partNumbers(partRoom({
      partNumberOverrides: { a1: 5, 'A-base:right': 1 },
    }), DEFAULT_SETTINGS);
    expect(overridden.parts.map(({ number }) => number)).toEqual([2, 5, 3, 1, 4, 6, 7, 8, 9]);
    expect(overridden.overrideKeys).toEqual(new Set(['a1', 'A-base:right']));
    expect(overridden.warnings).toEqual([]);

    const duplicate = partNumbers(partRoom({
      partNumberOverrides: { a1: 5, a2: 5 },
    }), DEFAULT_SETTINGS);
    expect(duplicate.byKey.get('a1')).toBe(5);
    expect(duplicate.byKey.get('a2')).toBe(5);
    expect(duplicate.warnings).toEqual([
      { code: 'duplicate-part-number', number: 5, keys: ['a1', 'a2'] },
    ]);

    const stale = partNumbers(partRoom({
      partNumberOverrides: { 'no-such-part': 3 },
    }), DEFAULT_SETTINGS);
    expect(stale.parts.map(({ number }) => number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(stale.overrideKeys.size).toBe(0);
  });

  it('201. follows wall number overrides when ordering walls', () => {
    const room = partRoom({ walls: partWalls({ wallB: { numberOverride: 1 } }) });
    const result = partNumbers(room, DEFAULT_SETTINGS);

    expect(result.parts.map(({ key }) => key)).toEqual([
      'B-base:left', 'b1', 'B-base:right', 'A-base:left', 'a1',
      'a2', 'A-base:right', 'a3', 'molding:toeKick',
    ]);
    expect(result.parts.map(({ number }) => number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('202. numbers present moldings and places one badge per elevation', () => {
    const room = partRoom({ walls: partWalls({ upper: { heightMode: 'auto' } }) });
    const result = partNumbers(room, DEFAULT_SETTINGS);
    const wallA = room.walls.find(({ id }) => id === 'A');
    const wallB = room.walls.find(({ id }) => id === 'B');

    expect(result.parts.slice(-3).map(({ key }) => key))
      .toEqual(['molding:toeKick', 'molding:topMold', 'molding:crown']);
    expect(result.parts.slice(-3).map(({ number }) => number)).toEqual([9, 10, 11]);
    expect(wallMoldingBadges(
      room, wallSideView(wallA, 'front'), DEFAULT_SETTINGS, result.byKey,
    )).toEqual([
      { molding: 'toeKick', slot: 0, key: 'molding:toeKick', number: 9, label: 'TK', x: 3, z: 0, width: 54, height: 4 },
      { molding: 'topMold', slot: -1, key: 'molding:topMold', number: 10, label: 'TM', x: 0, z: 90, width: 48, height: 3 },
      { molding: 'crown', slot: 1, key: 'molding:crown', number: 11, label: 'CR', x: 0, z: 91.5, width: 48, height: 4.5 },
    ]);
    expect(wallMoldingBadges(
      room, wallSideView(wallB, 'front'), DEFAULT_SETTINGS, result.byKey,
    )).toEqual([
      { molding: 'toeKick', slot: 0, key: 'molding:toeKick', number: 9, label: 'TK', x: 3, z: 0, width: 24, height: 4 },
    ]);
  });

  it('203. brackets a wall with its left and right wall end panels', () => {
    const room = panelRoom();
    const result = partNumbers(room, DEFAULT_SETTINGS);

    expect(result.parts.map(({ key }) => key))
      .toEqual(['W:endPanel:start', 'w1', 'W:endPanel:end', 'molding:toeKick']);
    expect(result.parts.map(({ number }) => number)).toEqual([1, 2, 3, 4]);
    expect(result.parts[0]).toMatchObject({
      kind: 'wall_end_panel', wallId: 'W', side: null, runId: null,
      pieceId: null, width: 0.75,
    });
  });

  it('205. groups run and wall end-panel badges in elevation draw order', () => {
    const roomP = partRoom();
    const wallA = roomP.walls.find(({ id }) => id === 'A');
    const groupsA = wallBadgeGroups(
      roomP, wallSideView(wallA, 'front'), DEFAULT_SETTINGS,
    );

    expect(groupsA.map(({ key }) => key)).toEqual(['run:A-base', 'run:A-upper']);
    expect(groupsA.map(({ lift }) => lift)).toEqual([0, 0]);
    expect(groupsA.map(({ pieces }) => pieces.map(({ id }) => id))).toEqual([
      ['A-base:left', 'a1', 'a2', 'A-base:right'],
      ['a3'],
    ]);

    const roomE = panelRoom();
    const wallW = roomE.walls.find(({ id }) => id === 'W');
    const groupsW = wallBadgeGroups(
      roomE, wallSideView(wallW, 'front'), DEFAULT_SETTINGS,
    );

    expect(groupsW.map(({ key }) => key))
      .toEqual(['run:W-base', 'panel:start', 'panel:end']);
    expect(groupsW.map(({ lift }) => lift)).toEqual([0, 1, 1]);
    expect(groupsW.find(({ key }) => key === 'panel:start').pieces).toEqual([
      { id: 'W:endPanel:start', x: 0, z: 0, width: 0.75, height: 34.5 },
    ]);
    expect(groupsW.find(({ key }) => key === 'panel:end').pieces).toEqual([
      { id: 'W:endPanel:end', x: 119.25, z: 0, width: 0.75, height: 34.5 },
    ]);
  });

  it('212. reports blind cabinet and filler part widths without changing numbering', () => {
    const room = syncRoom({
      id: 'K',
      name: 'Room K',
      profile: { ...DEFAULT_SETTINGS.defaultProfile },
      partNumberStart: 1,
      partNumberOverrides: {},
      wallOrder: ['K1'],
      walls: [makeWall('K1', 0, 0, 120, 0, {
        runs: [base('L', {
          x: 12,
          width: 24,
          ends: { left: { type: 'blind', width: 3 }, right: { type: 'none', width: null } },
          autoCount: false,
          items: [{ id: 'w1', kind: 'cabinet', width: 21 }],
          blind: { left: 42, right: null },
        })],
      })],
    }, DEFAULT_SETTINGS);
    const result = partNumbers(room, DEFAULT_SETTINGS);

    expect(result.parts.find(({ key }) => key === 'L:left').width).toBe(6);
    expect(result.parts.find(({ key }) => key === 'w1').width).toBe(42);
    expect(result.parts.map(({ key }) => key))
      .toEqual(['L:left', 'w1', 'molding:toeKick']);
    expect(result.parts.map(({ number }) => number)).toEqual([1, 2, 3]);
  });
});
