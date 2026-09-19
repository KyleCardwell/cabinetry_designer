import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { moveRun, stretchRun, syncRoom } from '../room.js';

function makeRun(id, overrides = {}) {
  return {
    id,
    cabinetTypeId: CABINET_TYPE_IDS.BASE,
    x: 40,
    width: 40,
    z: 4,
    height: 30.5,
    depth: 24,
    ends: {
      left: { type: 'none', width: null },
      right: { type: 'none', width: null },
    },
    autoCount: false,
    maxCabinetWidth: null,
    items: [{ id: `${id}-cabinet`, kind: 'cabinet', width: 40 }],
    heightMode: 'manual',
    overrides: {},
    anchors: { left: false, right: false },
    ...overrides,
  };
}

function makeRoom(runs = [makeRun('run')]) {
  return {
    id: 'room',
    name: 'Room',
    profile: { ...DEFAULT_SETTINGS.defaultProfile },
    wallOrder: ['A'],
    walls: [{
      id: 'A',
      name: '',
      numberOverride: null,
      x1: 0,
      y1: 0,
      x2: 120,
      y2: 0,
      height: 96,
      thickness: 4.5,
      flipped: false,
      connections: { start: null, end: null },
      profile: {},
      runs,
    }],
  };
}

function makeOutsideRoom() {
  const room = makeRoom();
  room.wallOrder = ['A', 'B'];
  room.walls[0].flipped = true;
  room.walls[0].connections.end = { wallId: 'B', endpoint: 'start' };
  room.walls.push({
    ...room.walls[0],
    id: 'B',
    x1: 120,
    y1: 0,
    x2: 120,
    y2: -96,
    flipped: false,
    connections: { start: { wallId: 'A', endpoint: 'end' }, end: null },
    runs: [],
  });
  return room;
}

function resultRun(result, id = 'run') {
  return result.room.walls[0].runs.find((run) => run.id === id);
}

describe('stretchRun', () => {
  it('14. allows stretching within the overhang limit and rejects beyond it unchanged', () => {
    const room = makeRoom();
    const allowed = stretchRun(room, 'A', 'run', 'left', -10, DEFAULT_SETTINGS);
    expect(allowed.ok).toBe(true);
    expect(resultRun(allowed)).toMatchObject({ x: -10, width: 90 });

    const rejected = stretchRun(room, 'A', 'run', 'left', -50, DEFAULT_SETTINGS);
    expect(rejected).toEqual({ ok: false, reason: 'out-of-bounds', room });
    expect(rejected.room).toBe(room);
  });

  it('17. snaps to and anchors an open wall end', () => {
    const room = makeRoom();

    const right = stretchRun(room, 'A', 'run', 'right', 87.3, DEFAULT_SETTINGS);
    expect(right.ok).toBe(true);
    expect(resultRun(right)).toMatchObject({
      x: 40,
      width: 47.5,
      anchors: { left: false, right: false },
    });

    const leftFree = stretchRun(room, 'A', 'run', 'left', 3, DEFAULT_SETTINGS);
    expect(leftFree.ok).toBe(true);
    expect(resultRun(leftFree)).toMatchObject({
      x: 3,
      width: 77,
      anchors: { left: false, right: false },
    });

    const leftOpenEnd = stretchRun(room, 'A', 'run', 'left', 1.2, DEFAULT_SETTINGS);
    expect(leftOpenEnd.ok).toBe(true);
    expect(resultRun(leftOpenEnd)).toMatchObject({
      x: 0,
      width: 80,
      anchors: { left: true, right: false },
      ends: { left: { type: 'end_panel', width: null } },
    });
  });

  it('12. snaps and anchors within two inches of an outside corner', () => {
    const result = stretchRun(
      makeOutsideRoom(),
      'A',
      'run',
      'right',
      118,
      DEFAULT_SETTINGS,
    );

    expect(result.ok).toBe(true);
    expect(resultRun(result)).toMatchObject({
      x: 40,
      width: 80,
      anchors: { left: false, right: true },
      ends: { right: { type: 'end_panel', width: null } },
    });
  });

  it('18. rejects conflicts unchanged and snaps within two inches to another run edge', () => {
    const room = makeRoom([
      makeRun('run'),
      makeRun('neighbor', {
        x: 90,
        width: 20,
        items: [{ id: 'neighbor-cabinet', kind: 'cabinet', width: 20 }],
      }),
    ]);

    const snapped = stretchRun(room, 'A', 'run', 'right', 88.5, DEFAULT_SETTINGS);
    expect(snapped.ok).toBe(true);
    expect(resultRun(snapped)).toMatchObject({ x: 40, width: 50 });

    const conflict = stretchRun(room, 'A', 'run', 'right', 95, DEFAULT_SETTINGS);
    expect(conflict).toEqual({ ok: false, reason: 'conflict', room });
    expect(conflict.room).toBe(room);
  });

  it('19. clamps a stretched run to the minimum width', () => {
    const result = stretchRun(
      makeRoom(),
      'A',
      'run',
      'right',
      42,
      DEFAULT_SETTINGS,
    );

    expect(result.ok).toBe(true);
    expect(resultRun(result)).toMatchObject({ x: 40, width: 9 });
  });

  it('re-splits an auto-count run after crossing a max-width boundary', () => {
    const room = syncRoom(makeRoom([makeRun('auto', {
      x: 10,
      width: 60,
      autoCount: true,
      items: [],
    })]), DEFAULT_SETTINGS);
    expect(room.walls[0].runs[0].items).toHaveLength(2);

    const result = stretchRun(room, 'A', 'auto', 'right', 100, DEFAULT_SETTINGS);
    expect(result.ok).toBe(true);
    expect(resultRun(result, 'auto').items).toHaveLength(3);
  });
});

describe('moveRun', () => {
  it('12. shifts x and keeps width for a clean move', () => {
    const result = moveRun(makeRoom(), 'A', 'run', 60, DEFAULT_SETTINGS);

    expect(result.ok).toBe(true);
    expect(resultRun(result)).toMatchObject({ x: 60, width: 40 });
    expect(result.snap).toBeNull();
  });

  it('13. snaps its left edge to the wall end', () => {
    const result = moveRun(makeRoom(), 'A', 'run', 1.5, DEFAULT_SETTINGS);

    expect(result.ok).toBe(true);
    expect(resultRun(result)).toMatchObject({ x: 0, width: 40 });
    expect(result.snap).toEqual({ value: 0, edge: 'left' });
  });

  it("14. snaps its right edge to a neighbour's left edge", () => {
    const room = makeRoom([
      makeRun('run'),
      makeRun('other', {
        x: 90,
        width: 20,
        items: [{ id: 'other-cabinet', kind: 'cabinet', width: 20 }],
      }),
    ]);
    const result = moveRun(room, 'A', 'run', 49, DEFAULT_SETTINGS);

    expect(result.ok).toBe(true);
    expect(resultRun(result)).toMatchObject({ x: 50, width: 40 });
    expect(result.snap).toEqual({ value: 90, edge: 'right' });
  });

  it('15. refuses conflicting and out-of-bounds moves without changing the room', () => {
    const room = makeRoom([
      makeRun('run'),
      makeRun('other', {
        x: 90,
        width: 20,
        items: [{ id: 'other-cabinet', kind: 'cabinet', width: 20 }],
      }),
    ]);

    const conflict = moveRun(room, 'A', 'run', 80, DEFAULT_SETTINGS);
    expect(conflict).toEqual({
      ok: false,
      reason: 'conflict',
      room,
      snap: null,
    });
    expect(conflict.room).toBe(room);

    const source = makeRoom();
    const outOfBounds = moveRun(source, 'A', 'run', 200, DEFAULT_SETTINGS);
    expect(outOfBounds).toEqual({
      ok: false,
      reason: 'out-of-bounds',
      room: source,
      snap: null,
    });
    expect(outOfBounds.room).toBe(source);
  });

  it('16. refuses to move an anchored run', () => {
    const room = makeRoom([
      makeRun('run', { anchors: { left: true, right: false } }),
    ]);
    const result = moveRun(room, 'A', 'run', 60, DEFAULT_SETTINGS);

    expect(result).toEqual({
      ok: false,
      reason: 'anchored',
      room,
      snap: null,
    });
    expect(result.room).toBe(room);
  });
});
