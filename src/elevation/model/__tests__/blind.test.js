import { describe, expect, it } from 'vitest';
import {
  blindEntries,
  blindPartWidths,
  isBlindCovered,
  panelDepth,
} from '../blind.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
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

const blindRoom = (runs) => syncRoom({
  id: 'K',
  name: 'Room K',
  profile: { ...DEFAULT_SETTINGS.defaultProfile },
  partNumberStart: 1,
  partNumberOverrides: {},
  wallOrder: ['K1'],
  walls: [makeWall('K1', 0, 0, 120, 0, { runs })],
}, DEFAULT_SETTINGS);

const cornerRoom = (hostRun, neighborRuns) => syncRoom({
  id: 'K',
  name: 'Room K',
  profile: { ...DEFAULT_SETTINGS.defaultProfile },
  partNumberStart: 1,
  partNumberOverrides: {},
  wallOrder: ['K1', 'K2'],
  walls: [
    makeWall('K1', 0, 0, 120, 0, {
      connections: { start: { wallId: 'K2', endpoint: 'start' }, end: null },
      runs: [hostRun],
    }),
    makeWall('K2', 0, 0, 0, 96, {
      connections: { start: { wallId: 'K1', endpoint: 'start' }, end: null },
      runs: neighborRuns,
    }),
  ],
}, DEFAULT_SETTINGS);

const neighborBase = () => base('N', { anchors: { left: false, right: true } });
const neighborUpper = () => run('U', CABINET_TYPE_IDS.UPPER, 12, {
  z: 54, height: 36, heightMode: 'manual', anchors: { left: false, right: true },
});

const tallBlind = () => run('T', CABINET_TYPE_IDS.TALL, 24, {
  x: 25, width: 24, z: 4, height: 86, heightMode: 'manual',
  ends: { left: { type: 'blind', width: 3 }, right: { type: 'none', width: null } },
  autoCount: false,
  items: [{ id: 't1', kind: 'cabinet', width: 21 }],
  blind: { left: 42, right: null },
});

const lowUpperBlind = () => run('P', CABINET_TYPE_IDS.UPPER, 12, {
  x: 25, width: 24, z: 40, height: 50, heightMode: 'manual',
  ends: { left: { type: 'blind', width: 3 }, right: { type: 'none', width: null } },
  autoCount: false,
  items: [{ id: 'p1', kind: 'cabinet', width: 21 }],
  blind: { left: 42, right: null },
});

const leftRun = (blind) => base('L', {
  x: 12,
  width: 24,
  ends: { left: { type: 'blind', width: 3 }, right: { type: 'none', width: null } },
  autoCount: false,
  items: [{ id: 'w1', kind: 'cabinet', width: 21 }],
  blind,
});

const rightRun = (blind) => base('R', {
  x: 84,
  width: 24,
  ends: { left: { type: 'none', width: null }, right: { type: 'blind', width: 3 } },
  autoCount: false,
  items: [{ id: 'w2', kind: 'cabinet', width: 21 }],
  blind,
});

describe('blind overlay model', () => {
  it('208. builds exposed left and right blind entries', () => {
    const room = blindRoom([
      leftRun({ left: 42, right: null }),
      rightRun({ left: null, right: 42 }),
    ]);
    const wall = wallSideView(room.walls[0], 'front');
    const [runL, runR] = wall.runs;

    expect(blindEntries(room, wall, runL, DEFAULT_SETTINGS)).toEqual({
      entries: [{
        side: 'left',
        pieceId: 'w1',
        boxWidth: 42,
        boxX: -6,
        extension: 21,
        visibleWidth: 21,
        cornerX: 0,
        covered: false,
        endPieceId: 'L:left',
        panel: null,
      }],
      warnings: [],
    });
    expect(blindEntries(room, wall, runR, DEFAULT_SETTINGS)).toEqual({
      entries: [{
        side: 'right',
        pieceId: 'w2',
        boxWidth: 42,
        boxX: 84,
        extension: 21,
        visibleWidth: 21,
        cornerX: 120,
        covered: false,
        endPieceId: 'R:right',
        panel: null,
      }],
      warnings: [],
    });
  });

  it('209. reports blind width and missing end-piece warnings', () => {
    const shortRoom = blindRoom([leftRun({ left: 21, right: null })]);
    const shortWall = wallSideView(shortRoom.walls[0], 'front');
    expect(blindEntries(shortRoom, shortWall, shortWall.runs[0], DEFAULT_SETTINGS)).toMatchObject({
      entries: [{ extension: 0 }],
      warnings: [{ code: 'blind-not-past', side: 'left' }],
    });

    const missingEnd = tallBlind();
    missingEnd.items = [{ id: 't1', kind: 'cabinet', width: 24 }];
    const missingRoom = cornerRoom(missingEnd, [neighborBase()]);
    const missingWall = wallSideView(missingRoom.walls[0], 'front');
    expect(blindEntries(
      missingRoom,
      missingWall,
      missingWall.runs[0],
      DEFAULT_SETTINGS,
      { pieces: [{ id: 't1', kind: 'cabinet', x: 25, width: 24 }] },
    )).toMatchObject({
      entries: [{ panel: null, endPieceId: null }],
      warnings: [{ code: 'blind-needs-end', side: 'left' }],
    });

    const plainRoom = blindRoom([leftRun({ left: null, right: null })]);
    const plainWall = wallSideView(plainRoom.walls[0], 'front');
    expect(blindEntries(plainRoom, plainWall, plainWall.runs[0], DEFAULT_SETTINGS)).toEqual({
      entries: [],
      warnings: [],
    });
  });

  it('210. determines whether merged ranges cover a blind', () => {
    expect(isBlindCovered([[4, 34.5]], 4, 34.5)).toBe(true);
    expect(isBlindCovered([[4, 34.5]], 4, 90)).toBe(false);
    expect(isBlindCovered([[4, 34.5], [54, 90]], 4, 90)).toBe(false);
    expect(isBlindCovered([[4, 54], [50, 90]], 4, 90)).toBe(true);
    expect(isBlindCovered([], 4, 34.5)).toBe(false);
    expect(isBlindCovered([[0, 96]], 4, 34.5)).toBe(true);
  });

  it('211. returns blind cabinet and panel part widths', () => {
    const room = blindRoom([leftRun({ left: 42, right: null })]);
    const wall = wallSideView(room.walls[0], 'front');
    expect(blindPartWidths(room, wall, wall.runs[0], DEFAULT_SETTINGS)).toEqual(
      new Map([['w1', 42], ['L:left', 6]]),
    );

    const plainRoom = blindRoom([leftRun({ left: null, right: null })]);
    const plainWall = wallSideView(plainRoom.walls[0], 'front');
    expect(blindPartWidths(
      plainRoom,
      plainWall,
      plainWall.runs[0],
      DEFAULT_SETTINGS,
    )).toEqual(new Map());
  });

  it('220. uses ordered filler width only for a covered blind', () => {
    const coveredRun = leftRun({ left: 42, right: null });
    coveredRun.endFiller = { left: { width: 6 }, right: null };
    const coveredRoom = syncRoom({
      id: 'K',
      name: 'Room K',
      profile: { ...DEFAULT_SETTINGS.defaultProfile },
      partNumberStart: 1,
      partNumberOverrides: {},
      wallOrder: ['K1', 'K2'],
      walls: [
        makeWall('K1', 0, 0, 120, 0, {
          connections: { start: { wallId: 'K2', endpoint: 'start' }, end: null },
          runs: [coveredRun],
        }),
        makeWall('K2', 0, 0, 0, 96, {
          connections: { start: { wallId: 'K1', endpoint: 'start' }, end: null },
          runs: [base('N', { anchors: { left: false, right: true } })],
        }),
      ],
    }, DEFAULT_SETTINGS);
    const coveredWall = wallSideView(coveredRoom.walls[0], 'front');
    expect(blindPartWidths(
      coveredRoom,
      coveredWall,
      coveredWall.runs[0],
      DEFAULT_SETTINGS,
    ).get('L:left')).toBe(6);

    const exposedRun = tallBlind();
    exposedRun.endFiller = { left: { width: 6 }, right: null };
    const exposedRoom = cornerRoom(exposedRun, [neighborBase(), neighborUpper()]);
    const exposedWall = wallSideView(exposedRoom.walls[0], 'front');
    expect(blindPartWidths(
      exposedRoom,
      exposedWall,
      exposedWall.runs[0],
      DEFAULT_SETTINGS,
    ).get('T:left')).toBe(27.875);
  });

  it('225. defaults covered blind ordered width without changing exposed width', () => {
    const coveredRun = leftRun({ left: 42, right: null });
    const coveredRoom = syncRoom({
      id: 'K',
      name: 'Room K',
      profile: { ...DEFAULT_SETTINGS.defaultProfile },
      partNumberStart: 1,
      partNumberOverrides: {},
      wallOrder: ['K1', 'K2'],
      walls: [
        makeWall('K1', 0, 0, 120, 0, {
          connections: { start: { wallId: 'K2', endpoint: 'start' }, end: null },
          runs: [coveredRun],
        }),
        makeWall('K2', 0, 0, 0, 96, {
          connections: { start: { wallId: 'K1', endpoint: 'start' }, end: null },
          runs: [base('N', { anchors: { left: false, right: true } })],
        }),
      ],
    }, DEFAULT_SETTINGS);
    const coveredWall = wallSideView(coveredRoom.walls[0], 'front');
    expect(blindPartWidths(
      coveredRoom,
      coveredWall,
      coveredWall.runs[0],
      DEFAULT_SETTINGS,
    ).get('L:left')).toBe(6);

    const exposedRun = tallBlind();
    const exposedRoom = cornerRoom(exposedRun, [neighborBase(), neighborUpper()]);
    const exposedWall = wallSideView(exposedRoom.walls[0], 'front');
    expect(blindPartWidths(
      exposedRoom,
      exposedWall,
      exposedWall.runs[0],
      DEFAULT_SETTINGS,
    ).get('T:left')).toBe(27.875);
  });

  it('230. sizes the panel from the deepest overlapping neighbour plus the filler', () => {
    const room = cornerRoom(tallBlind(), [neighborBase(), neighborUpper()]);
    const wall = wallSideView(room.walls[0], 'front');
    const host = wall.runs[0];

    expect(blindEntries(room, wall, host, DEFAULT_SETTINGS)).toEqual({
      entries: [{
        side: 'left',
        pieceId: 't1',
        boxWidth: 42,
        boxX: 7,
        extension: 21,
        visibleWidth: 21,
        cornerX: 0,
        covered: false,
        endPieceId: 'T:left',
        panel: { x: 0, width: 27.875 },
      }],
      warnings: [],
    });
    expect(panelDepth(room, wall, host, 'left', DEFAULT_SETTINGS)).toBe(24.875);
    expect(panelDepth(room, wall, host, 'right', DEFAULT_SETTINGS)).toBe(0);
  });

  it('231. uses vertical overlap to choose panel neighbours', () => {
    const room = cornerRoom(lowUpperBlind(), [neighborBase(), neighborUpper()]);
    const wall = wallSideView(room.walls[0], 'front');
    const host = wall.runs[0];
    expect(blindEntries(room, wall, host, DEFAULT_SETTINGS).entries[0].panel).toEqual(
      { x: 0, width: 15.875 },
    );
    expect(panelDepth(room, wall, host, 'left', DEFAULT_SETTINGS)).toBe(12.875);

    const baseRoom = cornerRoom(lowUpperBlind(), [neighborBase()]);
    const baseWall = wallSideView(baseRoom.walls[0], 'front');
    const baseHost = baseWall.runs[0];
    expect(blindEntries(baseRoom, baseWall, baseHost, DEFAULT_SETTINGS)).toMatchObject({
      entries: [{ panel: null }],
      warnings: [],
    });
    expect(panelDepth(baseRoom, baseWall, baseHost, 'left', DEFAULT_SETTINGS)).toBe(0);
    expect(blindPartWidths(baseRoom, baseWall, baseHost, DEFAULT_SETTINGS).get('P:left')).toBe(6);
  });
});
