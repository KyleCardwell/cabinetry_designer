import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { moveRun, stretchRun, syncRoom } from '../room.js';
import { auto, fixed, room as buildRoom, run, wall } from '../../../test/builders.js';
import { normalizeCornerEnd } from '../cornerEnd.js';
import { runItems } from '../grid.js';

const runDefaults = {
  x: 40, width: 40, autoCount: false,
  ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
  items: [fixed('run-cabinet', 40)],
};
let subject;
beforeEach(() => {
  subject = buildRoom({ id: 'room', wallOrder: ['A'], walls: [wall({
    id: 'A', x2: 120, runs: [run({ ...runDefaults, id: 'run' })],
  })] });
});

function resultRun(result, id = 'run') {
  return result.room.walls[0].runs.find((run) => run.id === id);
}

describe('stretchRun', () => {
  it('allows stretching within the overhang limit and rejects beyond it unchanged', () => {
    const room = subject;
    const allowed = stretchRun(room, 'A', 'run', 'left', -10, DEFAULT_SETTINGS);
    expect(allowed.ok).toBe(true);
    expect(resultRun(allowed)).toMatchObject({ x: -10, width: 90 });

    const rejected = stretchRun(room, 'A', 'run', 'left', -50, DEFAULT_SETTINGS);
    expect(rejected).toEqual({ ok: false, reason: 'out-of-bounds', room });
    expect(rejected.room).toBe(room);
  });

  it('snaps to and anchors an open wall end', () => {
    const room = subject;

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

  it('snaps and anchors within two inches of an outside corner', () => {
    subject.walls[0].flipped = true;
    subject.walls[0].connections.end = { wallId: 'B', endpoint: 'start' };
    subject.walls.push(wall({ id: 'B', x1: 120, y1: 0, x2: 120, y2: -96,
      connections: { start: { wallId: 'A', endpoint: 'end' }, end: null },
    }));
    subject.wallOrder = ['A', 'B'];
    const result = stretchRun(
      subject,
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

  it('rejects conflicts unchanged and snaps within two inches to another run edge', () => {
    subject.walls[0].runs = [
      run({ ...runDefaults, id: 'run' }),
      run({ ...runDefaults, id: 'neighbor',
        x: 90,
        width: 20,
        items: [{ id: 'neighbor-cabinet', kind: 'cabinet', width: 20 }],
      }),
    ];
    const room = subject;

    const snapped = stretchRun(room, 'A', 'run', 'right', 88.5, DEFAULT_SETTINGS);
    expect(snapped.ok).toBe(true);
    expect(resultRun(snapped)).toMatchObject({ x: 40, width: 50 });

    const conflict = stretchRun(room, 'A', 'run', 'right', 95, DEFAULT_SETTINGS);
    expect(conflict).toEqual({ ok: false, reason: 'conflict', room });
    expect(conflict.room).toBe(room);
  });

  it('clamps a stretched run to the minimum width', () => {
    const result = stretchRun(
      subject,
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
    subject.walls[0].runs = [run({ ...runDefaults, id: 'auto',
      x: 10,
      width: 60,
      autoCount: true,
      items: [],
    })];
    const room = syncRoom(subject, DEFAULT_SETTINGS);
    expect(runItems(room.walls[0].runs[0])).toHaveLength(2);

    const result = stretchRun(room, 'A', 'auto', 'right', 100, DEFAULT_SETTINGS);
    expect(result.ok).toBe(true);
    expect(runItems(resultRun(result, 'auto'))).toHaveLength(3);
  });
});

describe('moveRun', () => {
  it('shifts x and keeps width for a clean move', () => {
    const result = moveRun(subject, 'A', 'run', 60, DEFAULT_SETTINGS);

    expect(result.ok).toBe(true);
    expect(resultRun(result)).toMatchObject({ x: 60, width: 40 });
    expect(result.snap).toBeNull();
  });

  it('snaps its left edge to the wall end', () => {
    const result = moveRun(subject, 'A', 'run', 1.5, DEFAULT_SETTINGS);

    expect(result.ok).toBe(true);
    expect(resultRun(result)).toMatchObject({ x: 0, width: 40 });
    expect(result.snap).toEqual({ value: 0, edge: 'left' });
  });

  it("snaps its right edge to a neighbour's left edge", () => {
    subject.walls[0].runs = [
      run({ ...runDefaults, id: 'run' }),
      run({ ...runDefaults, id: 'other',
        x: 90,
        width: 20,
        items: [{ id: 'other-cabinet', kind: 'cabinet', width: 20 }],
      }),
    ];
    const room = subject;
    const result = moveRun(room, 'A', 'run', 49, DEFAULT_SETTINGS);

    expect(result.ok).toBe(true);
    expect(resultRun(result)).toMatchObject({ x: 50, width: 40 });
    expect(result.snap).toEqual({ value: 90, edge: 'right' });
  });

  it('refuses conflicting and out-of-bounds moves without changing the room', () => {
    subject.walls[0].runs = [
      run({ ...runDefaults, id: 'run' }),
      run({ ...runDefaults, id: 'other',
        x: 90,
        width: 20,
        items: [{ id: 'other-cabinet', kind: 'cabinet', width: 20 }],
      }),
    ];
    const room = subject;

    const conflict = moveRun(room, 'A', 'run', 80, DEFAULT_SETTINGS);
    expect(conflict).toEqual({
      ok: false,
      reason: 'conflict',
      room,
      snap: null,
    });
    expect(conflict.room).toBe(room);

    const source = buildRoom({ id: 'room', wallOrder: ['A'], walls: [wall({
      id: 'A', x2: 120, runs: [run({ ...runDefaults, id: 'run' })],
    })] });
    const outOfBounds = moveRun(source, 'A', 'run', 200, DEFAULT_SETTINGS);
    expect(outOfBounds).toEqual({
      ok: false,
      reason: 'out-of-bounds',
      room: source,
      snap: null,
    });
    expect(outOfBounds.room).toBe(source);
  });

  it('refuses to move an anchored run', () => {
    subject.walls[0].runs = [
      run({ ...runDefaults, id: 'run', anchors: { left: true, right: false } }),
    ];
    const room = subject;
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

describe('corner return snap defaults (CC2)', () => {
  beforeEach(() => {
    subject = buildRoom({ walls: [
      wall({ runs: [run({ id: 'owner', z: 0, autoCount: false,
        items: [fixed('cc', 36), auto('a')], anchors: { left: true, right: false },
        ends: { left: normalizeCornerEnd({}), right: { type: 'none' } },
      })], connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null } }),
      wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0,
        connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } },
        runs: [run({ id: 'return', z: 0, width: 100,
          ends: { left: { type: 'none' }, right: { type: 'end_panel' } },
        })],
      }),
    ] });
  });

  it.each([
    [7, { type: 'end_panel', width: null }, { type: 'none', width: null }, 108],
    ['typed filler', { type: 'filler', width: 2 }, { type: 'filler', width: 2 }, 108],
    ['none', { type: 'none', width: null }, { type: 'none', width: null }, 108],
    ['own corner', normalizeCornerEnd({}), normalizeCornerEnd({}), 144],
  ])('anchor %s: snaps the return edge into the corner and keeps explicit choices', (_case, end, expected, edge) => {
    subject.walls[1].runs[0].ends.right = end;
    const before = structuredClone(subject);
    const result = stretchRun(subject, 'wall-2', 'return', 'right', edge - 1, DEFAULT_SETTINGS);
    expect(result.ok).toBe(true);
    const stored = result.room.walls[1].runs[0];
    expect(stored.anchors.right).toBe(true);
    expect(stored.ends.right).toEqual(expected);
    expect(stored.x + stored.width).toBe(edge);
    expect(subject).toEqual(before);
  });
});
