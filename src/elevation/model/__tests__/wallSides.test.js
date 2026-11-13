import { describe, expect, it } from 'vitest';
import { auto, opening, room as buildRoom, run as buildRun, wall as buildWall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { cornerAt } from '../corners.js';
import { horizontalChains, openingChain } from '../dimensions.js';
import { findCollisions, footprintsAtPoint, runFootprint } from '../footprints.js';
import { openingGeometry } from '../openings.js';
import {
  compensateRuns,
  describeAnchor,
  joinEdges,
  joinTouchingEdges,
  moveRun,
  resolveWall,
  roomDiagnostics,
  stretchRun,
  syncRoom,
  tryPlaceRun,
} from '../room.js';
import { createRun } from '../runDefaults.js';
import { splitRun } from '../splitRun.js';
import { wallEndPanelPolygon, wallEndPanels } from '../wallEndPanels.js';
import {
  featuresOn,
  mirrorOpening,
  wallSideFrame,
  wallSideOf,
  wallSideView,
} from '../wallSides.js';

// Keep these layout anchors independent of run flex (RF3).
const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const ROOM = { id: 'room', name: 'Room', profile: { ...DEFAULT_SETTINGS.defaultProfile } };
const BASE = { width: 96, autoCount: false, wallSide: 'front',
  ends: { left: { type: 'end_panel', width: null }, right: { type: 'end_panel', width: null } } };
const byId = (wall, id) => wall.runs.find((run) => run.id === id);

function isl(overrides = {}) {
  const F = buildRun({ ...BASE, id: 'F', items: [auto('F-cabinet')], anchors: { left: true, right: true } });
  const K = buildRun({ ...BASE, id: 'K', items: [auto('K-cabinet')], anchors: { left: true, right: true }, wallSide: 'back' });
  return buildRoom({ ...ROOM, wallOrder: ['I'], walls: [buildWall({ id: 'I', x1: 0, y1: 0, x2: 96, y2: 0,
    thickness: 0,
    runs: [F, K],
    ...overrides,
  })] });
}

function isp() {
  const room = isl({ endPanels: { start: { width: null }, end: null } });
  byId(room.walls[0], 'K').depth = 12;
  return room;
}

function square() {
  return buildRoom({ ...ROOM, wallOrder: ['A', 'B', 'C', 'D'], walls: [
    buildWall({ id: 'A', x1: 0, y1: 0, x2: 120, y2: 0, thickness: 4.5,
      connections: {
        start: { wallId: 'D', endpoint: 'end' },
        end: { wallId: 'B', endpoint: 'start' },
      },
    }),
    buildWall({ id: 'B', x1: 120, y1: 0, x2: 120, y2: 96, thickness: 4.5,
      connections: {
        start: { wallId: 'A', endpoint: 'end' },
        end: { wallId: 'C', endpoint: 'start' },
      },
    }),
    buildWall({ id: 'C', x1: 120, y1: 96, x2: 0, y2: 96, thickness: 4.5,
      connections: {
        start: { wallId: 'B', endpoint: 'end' },
        end: { wallId: 'D', endpoint: 'start' },
      },
    }),
    buildWall({ id: 'D', x1: 0, y1: 96, x2: 0, y2: 0, thickness: 4.5,
      connections: {
        start: { wallId: 'C', endpoint: 'end' },
        end: { wallId: 'A', endpoint: 'start' },
      },
    }),
  ] });
}

export function flippedL(pRuns = [], qRuns = []) {
  return buildRoom({ ...ROOM, wallOrder: ['P', 'Q'], walls: [
    buildWall({ id: 'P', x1: 0, y1: 0, x2: 96, y2: 0, thickness: 4.5,
      flipped: true,
      connections: { start: null, end: { wallId: 'Q', endpoint: 'start' } },
      runs: pRuns,
    }),
    buildWall({ id: 'Q', x1: 96, y1: 0, x2: 96, y2: 96, thickness: 4.5,
      flipped: true,
      connections: { start: { wallId: 'P', endpoint: 'end' }, end: null },
      runs: qRuns,
    }),
  ] });
}

describe('wall sides', () => {
  it('reads missing and stored wall sides', () => {
    expect(wallSideOf({})).toBe('front');
    expect(wallSideOf({ wallSide: 'back' })).toBe('back');
    expect(wallSideOf({ wallSide: 'front' })).toBe('front');
  });

  it('builds front and back wall views', () => {
    const W = buildWall({ id: 'W', x1: 0, y1: 0, x2: 120, y2: 0, thickness: 4.5,
      openings: [opening({ id: 'D1', label: 'D1' })],
      joints: [{ id: 'JF', x: 10 }, { id: 'JB', x: 20, wallSide: 'back' }],
      runs: [buildRun({ ...BASE, id: 'F', items: [auto('F-cabinet')] }), buildRun({ ...BASE, id: 'K', items: [auto('K-cabinet')], wallSide: 'back' })],
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

  it('mirrors edge and center anchored openings', () => {
    expect(openingGeometry(mirrorOpening(opening({ id: 'D1', label: 'D1' })), 120, settings).jamb.x).toBe(60);
    const centered = opening({ id: 'D1', label: 'D1', offset: 42, offsetFrom: 'right', offsetAnchor: 'center' });
    expect(openingGeometry(centered, 120, settings).jamb.x).toBe(60);
    expect(openingGeometry(mirrorOpening(centered), 120, settings).jamb.x).toBe(24);
  });

  it('resolves wall side frames and back face offsets', () => {
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

  it('creates runs on the wall view side', () => {
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

  it('resolves and diagnoses island runs independently per side', () => {
    const room = isl();
    const synced = syncRoom(room, settings);
    const I = synced.walls[0];

    expect(byId(I, 'F')).toMatchObject({ x: 0, width: 96 });
    expect(byId(I, 'K')).toMatchObject({ x: 0, width: 96 });
    expect(roomDiagnostics(room, settings).F.errors).toEqual([]);
    expect(roomDiagnostics(room, settings).K.errors).toEqual([]);
  });

  it('allows overlap across wall sides but not on the same side', () => {
    const room = isl();
    const I = room.walls[0];
    const K = byId(I, 'K');
    I.runs = [byId(I, 'F')];

    expect(tryPlaceRun(room, 'I', K, settings).ok).toBe(true);
    expect(tryPlaceRun(room, 'I', buildRun({ ...BASE, id: 'G', items: [auto('G-cabinet')], x: 10, width: 30 }), settings))
      .toMatchObject({ ok: false, reason: 'conflict' });
  });

  it('anchors back runs to mirrored openings', () => {
    const room = buildRoom({ ...ROOM, wallOrder: ['W'], walls: [buildWall({ id: 'W', x1: 0, y1: 0, x2: 120, y2: 0, thickness: 4.5,
      openings: [opening({ id: 'D1', label: 'D1' })],
      runs: [buildRun({ ...BASE, id: 'BK', items: [auto('BK-cabinet')],
        x: 70,
        width: 40,
        wallSide: 'back',
        anchors: {
          left: false,
          right: { to: 'opening', openingId: 'D1', edge: 'casing', clearance: 0 },
        },
       })],
    })] });
    const BK = byId(syncRoom(room, settings).walls[0], 'BK');

    expect(BK).toMatchObject({ x: 17, width: 40 });
  });

  it('classifies square corners on each wall side', () => {
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

  it('resolves the neighboring side at flipped inside corners', () => {
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

  it('reserves corners from neighboring runs on the facing side only', () => {
    const PB = buildRun({ ...BASE, id: 'PB', items: [auto('PB-cabinet')],
      wallSide: 'back',
      anchors: { left: false, right: true },
      ends: {
        left: { type: 'end_panel', width: null },
        right: { type: 'filler', width: null },
      },
     });
    const QB = buildRun({ ...BASE, id: 'QB', items: [auto('QB-cabinet')],
      width: 60,
      wallSide: 'back',
      anchors: { left: true, right: false },
      ends: {
        left: { type: 'none', width: null },
        right: { type: 'end_panel', width: null },
      },
     });
    const QF = buildRun({ ...BASE, id: 'QF', items: [auto('QF-cabinet')], width: 60 });
    // Run flex off: this pins down the corner reserves, not the box rounding (SPEC-RF1).
    const synced = syncRoom(flippedL([PB], [QB, QF]), { ...settings, runFlex: 0 });

    expect(byId(synced.walls[0], 'PB')).toMatchObject({ x: 0, width: 71.125 });
    expect(byId(synced.walls[1], 'QB')).toMatchObject({ x: 24.875, width: 60 });
    expect(byId(synced.walls[1], 'QF')).toMatchObject({ x: 0, width: 60 });

    const withoutQB = syncRoom(flippedL([PB], [QF]), settings);
    expect(byId(withoutQB.walls[0], 'PB').width).toBe(96);
  });

  it('resolves back wall views for openings and dimensions', () => {
    const room = syncRoom(buildRoom({ ...ROOM, wallOrder: ['W'], walls: [buildWall({ id: 'W', x1: 0, y1: 0, x2: 120, y2: 0, thickness: 4.5,
      openings: [opening({ id: 'D1', label: 'D1' })],
      runs: [
        buildRun({ ...BASE, id: 'FR', items: [auto('FR-cabinet')], x: 70, width: 40 }),
        buildRun({ ...BASE, id: 'BK', items: [auto('BK-cabinet')], width: 30, wallSide: 'back' }),
      ],
    })] }), settings);
    const W = room.walls[0];
    const backView = resolveWall(room, W, 'back');

    expect(backView.runs.map((run) => run.id)).toEqual(['BK']);
    expect(backView.length).toBe(120);
    // DM3: a face with runs has no openings row; without its run the back view mirrors the door.
    expect(openingChain(room, backView, settings)).toEqual([]);
    expect(openingChain(room, { ...backView, runs: [] }, settings).map(({ kind, start, end }) => (
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

  it('joins run edges on the same wall side only', () => {
    const room = buildRoom({ ...ROOM, wallOrder: ['J'], walls: [buildWall({ id: 'J', x1: 0, y1: 0, x2: 96, y2: 0,
      thickness: 0,
      runs: [
        buildRun({ ...BASE, id: 'P', items: [auto('P-cabinet')], width: 48 }),
        buildRun({ ...BASE, id: 'Q', items: [auto('Q-cabinet')], x: 48, width: 48, wallSide: 'back' }),
        buildRun({ ...BASE, id: 'R', items: [auto('R-cabinet')], x: 48, width: 48 }),
      ],
    })] });

    expect(joinEdges(
      room,
      'J',
      { runId: 'P', side: 'right' },
      { runId: 'Q', side: 'left' },
      settings,
    )).toMatchObject({ ok: false, reason: 'joint-other-side' });
    const joined = joinEdges(
      room,
      'J',
      { runId: 'P', side: 'right' },
      { runId: 'R', side: 'left' },
      settings,
    );
    expect(joined.room.walls[0].joints.map(({ x, wallSide }) => [x, wallSide]))
      .toEqual([[48, 'front']]);
  });

  it('joins touching edges on the same wall side only', () => {
    const room = buildRoom({ ...ROOM, wallOrder: ['J'], walls: [buildWall({ id: 'J', x1: 0, y1: 0, x2: 96, y2: 0,
      thickness: 0,
      runs: [
        buildRun({ ...BASE, id: 'P', items: [auto('P-cabinet')], width: 48 }),
        buildRun({ ...BASE, id: 'Q', items: [auto('Q-cabinet')], x: 48, width: 48, wallSide: 'back' }),
      ],
    })] });
    const joined = joinTouchingEdges(room, 'J', 'Q', settings);

    expect(joined.joined).toEqual([]);
    expect(joined.room.walls[0].joints).toEqual([]);
  });

  it('snaps stretched and moved runs on their own wall side only', () => {
    const room = buildRoom({ ...ROOM, wallOrder: ['W'], walls: [buildWall({ id: 'W', x1: 0, y1: 0, x2: 96, y2: 0,
      thickness: 0,
      runs: [
        buildRun({ ...BASE, id: 'F', items: [auto('F-cabinet')], width: 40 }),
        buildRun({ ...BASE, id: 'K', items: [auto('K-cabinet')], width: 30, wallSide: 'back' }),
      ],
    })] });
    const stretched = stretchRun(room, 'W', 'K', 'right', 39, settings);
    const moved = moveRun(room, 'W', 'K', 11, settings);

    expect(byId(stretched.room.walls[0], 'K')).toMatchObject({ x: 0, width: 39 });
    expect(byId(moved.room.walls[0], 'K')).toMatchObject({ x: 11 });
    expect(moved.snap).toBeNull();
  });

  it('compensates run positions independently on each wall side', () => {
    const before = buildRoom({ ...ROOM, wallOrder: ['W'], walls: [buildWall({ id: 'W', x1: 0, y1: 0, x2: 120, y2: 0,
      thickness: 0,
      runs: [
        buildRun({ ...BASE, id: 'f1', items: [auto('f1-cabinet')], x: 10, width: 30 }),
        buildRun({ ...BASE, id: 'b1', items: [auto('b1-cabinet')], x: 10, width: 30, wallSide: 'back' }),
      ],
    })] });
    const after = buildRoom({ ...ROOM, wallOrder: ['W'], walls: [buildWall({ id: 'W', x1: -12, y1: 0, x2: 120, y2: 0,
      thickness: 0,
      runs: [
        buildRun({ ...BASE, id: 'f1', items: [auto('f1-cabinet')], x: 10, width: 30 }),
        buildRun({ ...BASE, id: 'b1', items: [auto('b1-cabinet')], x: 10, width: 30, wallSide: 'back' }),
      ],
    })] });

    expect(compensateRuns(before, after).walls[0].runs.map(({ id, x }) => [id, x]))
      .toEqual([['f1', 22], ['b1', 10]]);
  });

  it('resolves island run footprints on each wall side', () => {
    const room = syncRoom(isl(), settings);
    const I = room.walls[0];
    const F = byId(I, 'F');
    const K = byId(I, 'K');

    expect(runFootprint(wallSideFrame(room, I, 'front'), F, settings)).toEqual([
      { x: 0, y: 0 },
      { x: 96, y: 0 },
      { x: 96, y: 24.875 },
      { x: 0, y: 24.875 },
    ]);
    expect(runFootprint(wallSideFrame(room, I, 'back'), K, settings)).toEqual([
      { x: 96, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: -24.875 },
      { x: 96, y: -24.875 },
    ]);
    expect(footprintsAtPoint(room, { x: 48, y: 10 }, settings)).toEqual(['F']);
    expect(footprintsAtPoint(room, { x: 48, y: -10 }, settings)).toEqual(['K']);
    expect(findCollisions(room, settings)).toEqual([]);
  });

  it('offsets back-side footprints by wall thickness', () => {
    const room = square();
    const A = room.walls[0];
    const Z = buildRun({ ...BASE, id: 'Z', items: [auto('Z-cabinet')], width: 30, wallSide: 'back' });

    expect(runFootprint(wallSideFrame(room, A, 'back'), Z, settings)).toEqual([
      { x: 120, y: -4.5 },
      { x: 90, y: -4.5 },
      { x: 90, y: -29.375 },
      { x: 120, y: -29.375 },
    ]);
  });

  it('reserves wall end panels and sets run end types', () => {
    const room = syncRoom(isp(), settings);
    const I = room.walls[0];
    const F = byId(I, 'F');
    const K = byId(I, 'K');

    expect(F).toMatchObject({ x: 0.8125, width: 95.1875 });
    expect(K).toMatchObject({ x: 0, width: 95.1875 });
    expect(F.ends.left).toEqual({ type: 'none', width: null, auto: true });
    expect(F.ends.right).toEqual({ type: 'end_panel', width: null });
    expect(K.ends.right).toEqual({ type: 'none', width: null, auto: true });
    expect(splitRun(F, settings, {}).pieces.map(({ kind, width }) => [kind, width]))
      .toEqual([['cabinet', 94.375], ['end_panel', 0.8125]]);
  });

  it('restores run end panels when a wall end panel is removed', () => {
    const room = syncRoom(isp(), settings);
    room.walls[0].endPanels = { start: null, end: null };
    const F = byId(syncRoom(room, settings).walls[0], 'F');

    expect(F).toMatchObject({
      x: 0,
      width: 96,
      ends: { left: { type: 'end_panel', width: null } },
    });
    expect(F.ends.left.auto).toBeUndefined();
  });

  it('reserves custom-width wall end panels on both ends', () => {
    const room = syncRoom(isl({
      endPanels: { start: { width: 1 }, end: { width: 1 } },
    }), settings);
    const I = room.walls[0];

    expect(byId(I, 'F')).toMatchObject({ x: 1, width: 94 });
    expect(byId(I, 'K')).toMatchObject({ x: 1, width: 94 });
  });

  it('builds wall end panel elevation and plan geometry', () => {
    const room = syncRoom(isp(), settings);
    const I = room.walls[0];
    const panels = wallEndPanels(room, I, settings);

    expect(panels).toEqual([{
      endpoint: 'start', width: 0.8125, top: 34.5, bottom: 0, thickness: 0,
      front: { side: 'left', x: 0, depth: 24.875, top: 34.5, runIds: ['F'] },
      back: { side: 'right', x: 95.1875, depth: 12.875, top: 34.5, runIds: ['K'] },
    }]);
    expect(wallEndPanelPolygon(room, I, panels[0])).toEqual([
      { x: 0, y: -12.875 },
      { x: 0.8125, y: -12.875 },
      { x: 0.8125, y: 24.875 },
      { x: 0, y: 24.875 },
    ]);
  });

  it('keeps custom clearance ahead of wall end panel reserve', () => {
    const room = isp();
    byId(room.walls[0], 'F').cornerClearance = { left: 2, right: 'auto' };
    const synced = syncRoom(room, settings);
    const F = byId(synced.walls[0], 'F');
    const panelRoom = syncRoom(isp(), settings);
    const I = panelRoom.walls[0];

    expect(F).toMatchObject({ x: 2, width: 94 });
    expect(describeAnchor(panelRoom, I, byId(I, 'F'), 'left', settings))
      .toBe('Wall end panel 13/16"');
  });

  it('ignores a wall end panel at a connected endpoint', () => {
    const PB = buildRun({ ...BASE, id: 'PB', items: [auto('PB-cabinet')],
      wallSide: 'back',
      anchors: { left: false, right: true },
     });
    const room = flippedL([PB]);
    room.walls[0].endPanels = { start: null, end: { width: null } };
    const synced = syncRoom(room, settings);
    const P = synced.walls[0];

    expect(wallEndPanels(synced, P, settings)).toEqual([]);
    expect(byId(P, 'PB').width).toBe(96);
  });
});

describe('featuresOn (AU8)', () => {
  it('filters one wall list by face, for a wall and side or a side view', () => {
    const front = { id: 'f' };
    const back = { id: 'b', wallSide: 'back' };
    const wall = { id: 'w', soffits: [front, back] };
    expect(featuresOn('soffits', wall)).toEqual([front]);
    expect(featuresOn('soffits', wall, 'back')).toEqual([back]);
    expect(featuresOn('soffits', { side: 'back', sideSource: wall })).toEqual([back]);
    expect(featuresOn('recesses', wall)).toEqual([]);
  });
});
