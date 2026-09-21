import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { openingGeometry } from '../openings.js';
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
});
