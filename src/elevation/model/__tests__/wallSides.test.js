import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { cornerAt } from '../corners.js';
import { horizontalChains, openingChain } from '../dimensions.js';
import { openingGeometry } from '../openings.js';
import {
  resolveWall,
  roomDiagnostics,
  syncRoom,
  tryPlaceRun,
} from '../room.js';
import { createRun } from '../runDefaults.js';
import {
  mirrorOpening,
  wallSideFrame,
  wallSideOf,
  wallSideView,
} from '../wallSides.js';

const settings = DEFAULT_SETTINGS;
function base(id, overrides = {}) {
  return {
    id, cabinetTypeId: CABINET_TYPE_IDS.BASE,
    x: 0, width: 96, z: 4, height: 30.5, depth: 24,
    ends: { left: { type: 'end_panel', width: null }, right: { type: 'end_panel', width: null } },
    autoCount: false, maxCabinetWidth: null,
    items: [{ id: `${id}-cabinet`, kind: 'cabinet', width: null }],
    heightMode: 'manual', overrides: {},
    anchors: { left: false, right: false },
    wallSide: 'front',
    ...overrides,
  };
}
function makeWall(id, x1, y1, x2, y2, overrides = {}) {
  return {
    id, name: '', numberOverride: null, elevationForced: false,
    x1, y1, x2, y2, height: 96, thickness: 4.5, flipped: false,
    connections: { start: null, end: null }, profile: {},
    openings: [], joints: [], runs: [], endPanels: { start: null, end: null },
    ...overrides,
  };
}
function makeRoom(walls) {
  return { id: 'room', name: 'Room', profile: { ...DEFAULT_SETTINGS.defaultProfile },
    wallOrder: walls.map((wall) => wall.id), walls };
}
function door(overrides = {}) {
  return { id: 'D1', kind: 'door', label: 'D1', measureMode: 'jamb', width: 36, height: 80,
    sillZ: 0, offset: 24, offsetFrom: 'left', offsetAnchor: 'edge',
    casing: { width: 3, thickness: 0.75 }, ...overrides };
}
const byId = (wall, id) => wall.runs.find((run) => run.id === id);

function isl(overrides = {}) {
  const F = base('F', { anchors: { left: true, right: true } });
  const K = base('K', { anchors: { left: true, right: true }, wallSide: 'back' });
  return makeRoom([makeWall('I', 0, 0, 96, 0, {
    thickness: 0,
    runs: [F, K],
    ...overrides,
  })]);
}

function square() {
  return makeRoom([
    makeWall('A', 0, 0, 120, 0, {
      connections: {
        start: { wallId: 'D', endpoint: 'end' },
        end: { wallId: 'B', endpoint: 'start' },
      },
    }),
    makeWall('B', 120, 0, 120, 96, {
      connections: {
        start: { wallId: 'A', endpoint: 'end' },
        end: { wallId: 'C', endpoint: 'start' },
      },
    }),
    makeWall('C', 120, 96, 0, 96, {
      connections: {
        start: { wallId: 'B', endpoint: 'end' },
        end: { wallId: 'D', endpoint: 'start' },
      },
    }),
    makeWall('D', 0, 96, 0, 0, {
      connections: {
        start: { wallId: 'C', endpoint: 'end' },
        end: { wallId: 'A', endpoint: 'start' },
      },
    }),
  ]);
}

export function flippedL(pRuns = [], qRuns = []) {
  return makeRoom([
    makeWall('P', 0, 0, 96, 0, {
      flipped: true,
      connections: { start: null, end: { wallId: 'Q', endpoint: 'start' } },
      runs: pRuns,
    }),
    makeWall('Q', 96, 0, 96, 96, {
      flipped: true,
      connections: { start: { wallId: 'P', endpoint: 'end' }, end: null },
      runs: qRuns,
    }),
  ]);
}

describe('wall sides', () => {
  it('100. reads missing and stored wall sides', () => {
    expect(wallSideOf({})).toBe('front');
    expect(wallSideOf({ wallSide: 'back' })).toBe('back');
    expect(wallSideOf({ wallSide: 'front' })).toBe('front');
  });

  it('101. builds front and back wall views', () => {
    const W = makeWall('W', 0, 0, 120, 0, {
      openings: [door()],
      joints: [{ id: 'JF', x: 10 }, { id: 'JB', x: 20, wallSide: 'back' }],
      runs: [base('F'), base('K', { wallSide: 'back' })],
    });
    const front = wallSideView(W, 'front');
    const back = wallSideView(W, 'back');
    const spreadBack = { ...back, length: 120 };

    expect(front.runs.map((run) => run.id)).toEqual(['F']);
    expect(front.joints.map((joint) => joint.id)).toEqual(['JF']);
    expect(front.flipped).toBe(false);
    expect(back.runs.map((run) => run.id)).toEqual(['K']);
    expect(back.joints.map((joint) => joint.id)).toEqual(['JB']);
    expect(back.flipped).toBe(true);
    expect(back.openings[0].offsetFrom).toBe('right');
    expect(W.openings[0].offsetFrom).toBe('left');
    expect(wallSideView(back, 'back')).toBe(back);
    expect(wallSideView(spreadBack, 'back')).toBe(spreadBack);
    expect(wallSideView(back, 'front').runs.map((run) => run.id)).toEqual(['F']);
  });

  it('102. mirrors edge and center anchored openings', () => {
    expect(openingGeometry(mirrorOpening(door()), 120, settings).jamb.x).toBe(60);
    const centered = door({ offset: 42, offsetFrom: 'right', offsetAnchor: 'center' });
    expect(openingGeometry(centered, 120, settings).jamb.x).toBe(60);
    expect(openingGeometry(mirrorOpening(centered), 120, settings).jamb.x).toBe(24);
  });

  it('103. resolves wall side frames and back face offsets', () => {
    const island = isl();
    const I = island.walls[0];
    expect(wallSideFrame(island, I, 'back')).toMatchObject({
      leftEndpoint: 'end',
      leftPoint: { x: 96, y: 0 },
      r: { x: -1, y: 0 },
      n: { x: 0, y: -1 },
    });

    const SQ = square();
    const A = SQ.walls[0];
    expect(wallSideFrame(SQ, A, 'back').leftPoint).toEqual({ x: 120, y: -4.5 });
  });

  it('104. creates runs on the wall view side', () => {
    const room = isl();
    const I = room.walls[0];
    const bounds = { x: 10, width: 30, bottomZ: 4, topZ: 34.5 };

    expect(createRun(bounds, {
      settings,
      room,
      wall: wallSideView(I, 'back'),
    }).wallSide).toBe('back');
    expect(createRun(bounds, { settings, room, wall: I }).wallSide).toBe('front');
    expect(byId(I, 'F').wallSide).toBe('front');
  });

  it('106. resolves and diagnoses island runs independently per side', () => {
    const room = isl();
    const synced = syncRoom(room, settings);
    const I = synced.walls[0];

    expect(byId(I, 'F')).toMatchObject({ x: 0, width: 96 });
    expect(byId(I, 'K')).toMatchObject({ x: 0, width: 96 });
    expect(roomDiagnostics(room, settings).F.errors).toEqual([]);
    expect(roomDiagnostics(room, settings).K.errors).toEqual([]);
  });

  it('107. allows overlap across wall sides but not on the same side', () => {
    const room = isl();
    const I = room.walls[0];
    const K = byId(I, 'K');
    I.runs = [byId(I, 'F')];

    expect(tryPlaceRun(room, 'I', K, settings).ok).toBe(true);
    expect(tryPlaceRun(room, 'I', base('G', { x: 10, width: 30 }), settings))
      .toMatchObject({ ok: false, reason: 'conflict' });
  });

  it('108. anchors back runs to mirrored openings', () => {
    const room = makeRoom([makeWall('W', 0, 0, 120, 0, {
      openings: [door()],
      runs: [base('BK', {
        x: 70,
        width: 40,
        wallSide: 'back',
        anchors: {
          left: false,
          right: { to: 'opening', openingId: 'D1', edge: 'casing', clearance: 0 },
        },
      })],
    })]);
    const BK = byId(syncRoom(room, settings).walls[0], 'BK');

    expect(BK).toMatchObject({ x: 17, width: 40 });
  });

  it('109. classifies square corners on each wall side', () => {
    const room = square();
    const A = room.walls[0];

    expect(cornerAt(room, wallSideView(A, 'front'), 'left')).toMatchObject({
      type: 'inside', angle: 90, neighborWallId: 'D',
    });
    expect(cornerAt(room, wallSideView(A, 'front'), 'right')).toMatchObject({
      type: 'inside', angle: 90, neighborWallId: 'B',
    });
    expect(cornerAt(room, wallSideView(A, 'back'), 'left')).toMatchObject({
      type: 'outside', angle: 270, neighborWallId: 'B',
    });
    expect(cornerAt(room, wallSideView(A, 'back'), 'right')).toMatchObject({
      type: 'outside', angle: 270, neighborWallId: 'D',
    });
  });

  it('110. resolves the neighboring side at flipped inside corners', () => {
    const room = flippedL();
    const P = room.walls[0];

    expect(cornerAt(room, wallSideView(P, 'back'), 'right')).toEqual({
      type: 'inside',
      angle: 90,
      neighborWallId: 'Q',
      neighborSide: 'left',
      neighborWallSide: 'back',
    });
    expect(cornerAt(room, wallSideView(P, 'front'), 'left').type).toBe('outside');
  });

  it('111. reserves corners from neighboring runs on the facing side only', () => {
    const PB = base('PB', {
      wallSide: 'back',
      anchors: { left: false, right: true },
      ends: {
        left: { type: 'end_panel', width: null },
        right: { type: 'filler', width: null },
      },
    });
    const QB = base('QB', {
      width: 60,
      wallSide: 'back',
      anchors: { left: true, right: false },
      ends: {
        left: { type: 'none', width: null },
        right: { type: 'end_panel', width: null },
      },
    });
    const QF = base('QF', { width: 60 });
    const synced = syncRoom(flippedL([PB], [QB, QF]), settings);

    expect(byId(synced.walls[0], 'PB')).toMatchObject({ x: 0, width: 71.125 });
    expect(byId(synced.walls[1], 'QB')).toMatchObject({ x: 24.875, width: 60 });
    expect(byId(synced.walls[1], 'QF')).toMatchObject({ x: 0, width: 60 });

    const withoutQB = syncRoom(flippedL([PB], [QF]), settings);
    expect(byId(withoutQB.walls[0], 'PB').width).toBe(96);
  });

  it('112. resolves back wall views for openings and dimensions', () => {
    const room = syncRoom(makeRoom([makeWall('W', 0, 0, 120, 0, {
      openings: [door()],
      runs: [
        base('FR', { x: 70, width: 40 }),
        base('BK', { width: 30, wallSide: 'back' }),
      ],
    })]), settings);
    const W = room.walls[0];
    const backView = resolveWall(room, W, 'back');

    expect(backView.runs.map((run) => run.id)).toEqual(['BK']);
    expect(backView.length).toBe(120);
    expect(openingChain(room, backView, settings).map(({ kind, start, end }) => (
      [kind, start, end]
    ))).toEqual([
      ['gap', 0, 60],
      ['opening', 60, 96],
      ['gap', 96, 120],
    ]);
    expect(horizontalChains(room, backView, 'lower', settings).inner
      .filter((segment) => segment.kind === 'piece')
      .every((segment) => segment.runId === 'BK')).toBe(true);
  });
});
