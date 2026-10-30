import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { attach, auto, fixed, line, pin, room, run, wall } from '../../../test/builders.js';
import {
  jointLineLock, lineEndColumns, moveLineTo, runLineLock, runShortLabel,
} from '../index.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { moveJoint, resizeRun } from '../runJoins.js';
import { moveRun, stretchRun } from '../runMoves.js';
import { syncRoom } from '../roomSync.js';
import { layoutRun } from '../faceLayouts.js';
import { runItems, updateRootItem } from '../grid.js';
import { resolveWall } from '../room.js';
import elevationReducer, {
  createInitialElevationState, resizeRun as resizeRunAction,
} from '../../store/elevationSlice.js';

const room8 = JSON.parse(readFileSync(new URL('./fixtures/room8.json', import.meta.url), 'utf8'));
const room10 = JSON.parse(readFileSync(new URL('./fixtures/room10.json', import.meta.url), 'utf8'));
const room10c = JSON.parse(readFileSync(new URL('./fixtures/room10c.json', import.meta.url), 'utf8'));
const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const WALL8 = '14154ec7-5eeb-4511-8d78-5d3da7b09418';
const WALL10 = '2641fa48-3200-43ec-8a5f-ab8e6a514e00';
const HOOD = 'c1cb2dd4-6ec7-4d67-a1ef-1b5072bcc757';
const BASE = '8837d4ef-0f27-4ae9-aec6-2d563cadc4b3';
const OPEN = 'e77c1c0c-b386-4716-bc71-0f23ec1e585c';
const LEFT = 'c3b5d002-c0bc-421b-8d22-6bbd5ee060b6';
const RIGHT = 'd63bd233-b318-473d-a13b-23c3a2b83b49';
const JL = 'fe1b16b5-fdf8-4840-abbf-c55164603b10';
const JR = '97d7faa1-a7c5-4b71-8d7a-030d18a7b281';
const wallOf = (subject, id = WALL8) => subject.walls.find((candidate) => candidate.id === id);
const runOf = (subject, id) => wallOf(subject).runs.find((candidate) => candidate.id === id);
const r8Line = () => {
  const subject = structuredClone(room8);
  const target = wallOf(subject);
  target.lines = [line('L1', 99, { from: 'right' })];
  target.runs.find(({ id }) => id === HOOD).attach = attach('L1');
  const base = target.runs.find(({ id }) => id === BASE);
  base.autoCount = false;
  base.grid = updateRootItem(base.grid, OPEN, { attach: attach('L1') });
  return syncRoom(subject, settings);
};
const onlyRun = (result) => result.room.walls[0].runs[0];

function expectLock(result, subject, reason, message) {
  expect(result).toMatchObject({ ok: false, reason });
  expect(result.message).toBe(message);
  expect(result.room).toBe(subject);
}

describe('LL5 a moveLineTo anchors', () => {
  it('1: moves the R8 line, hood, open column, neighbours and joints together', () => {
    const subject = r8Line();
    const before = structuredClone(subject);
    const result = moveLineTo(subject, WALL8, 'L1', 134, settings);
    expect(result).toMatchObject({ ok: true, x: 134, value: 101 });
    expect(wallOf(result.room).lines[0]).toEqual(line('L1', 101, { from: 'right' }));
    expect(runOf(result.room, HOOD)).toMatchObject({ x: 94, width: 80 });
    expect(runOf(result.room, LEFT)).toMatchObject({ x: 38, width: 56 });
    expect(runOf(result.room, RIGHT)).toMatchObject({ x: 174, width: 61 });
    expect(wallOf(result.room).joints.map(({ x }) => x)).toEqual([38, 94, 174]);
    const view = resolveWall(result.room, wallOf(result.room), 'front');
    expect(layoutRun(result.room, view, runOf(result.room, BASE), settings).pieces.find(({ id }) => id === OPEN))
      .toMatchObject({ x: 110, width: 48 });
    expect(subject).toEqual(before);
  });

  it('2: snaps at openingSnap unless exact', () => {
    const subject = r8Line();
    expect(moveLineTo(subject, WALL8, 'L1', 134.3, settings)).toMatchObject({ x: 134.5, value: 100.5 });
    const result = moveLineTo(subject, WALL8, 'L1', 134.3, settings, { exact: true });
    expect(result.x).toBe(134.3);
    expect(result.value).toBeCloseTo(100.7);
    expect(wallOf(result.room).lines[0].value).toBeCloseTo(100.7);
  });

  it('3: clamps to the framed wall length, allowing a squeeze', () => {
    expect(moveLineTo(r8Line(), WALL8, 'L1', 250, settings)).toMatchObject({ ok: true, x: 235, value: 0 });
    expect(moveLineTo(r8Line(), WALL8, 'L1', -10, settings)).toMatchObject({ ok: true, x: 0, value: 235 });
  });

  it('4: matches Room 10’s window-moved golden spans and offset', () => {
    const s = { ...settings, ...room10.settingsOverrides };
    const result = moveLineTo(room10, WALL10, 'll4-r10-L1', 88, s);
    expect(result.ok).toBe(true);
    const target = wallOf(result.room, WALL10);
    expect(target.runs.map(({ x, width }) => [x, width])).toEqual([[0, 41], [129, 49], [41, 88]]);
    expect(target.openings.find(({ label }) => label === 'W1').offset).toBe(70);
    expect(target.joints.map(({ x }) => x)).toEqual([41, 129]);
    const view = resolveWall(result.room, target, 'front');
    const base = target.runs.find(({ id }) => id === 'c25ad9b4-36e3-481c-a2b4-5b5d4857ec8e');
    expect(layoutRun(result.room, view, base, s).pieces.find(({ id }) => id === '91b8a850-4450-4bc3-afbe-f9c1888a5d62'))
      .toMatchObject({ x: 73 + 11 / 32, width: 29 + 5 / 16 });
  });

  it('uses back-face coordinates, preserves from, and refuses unknown lines without changing the room', () => {
    const subject = room({ walls: [wall({ x2: 240, lines: [line('B', 40, { wallSide: 'back', from: 'right' })],
      runs: [run({ wallSide: 'back', width: 30, attach: attach('B') })],
    })] });
    const result = moveLineTo(subject, 'wall-1', 'B', 60, settings);
    expect(result).toMatchObject({ ok: true, x: 60, value: 180 });
    expect(onlyRun(result)).toMatchObject({ x: 45, width: 30 });
    for (const [wallId, lineId] of [['missing', 'B'], ['wall-1', 'missing']]) {
      expect(moveLineTo(subject, wallId, lineId, 60, settings))
        .toEqual({ ok: false, reason: 'line-not-found', room: subject });
    }
  });
});

describe('LL5 a line lock anchors', () => {
  it('5: refuses moving the attached hood before the anchored check', () => {
    const subject = r8Line();
    expectLock(moveRun(subject, WALL8, HOOD, 90, settings), subject, 'line-attached',
      `${runShortLabel(runOf(subject, HOOD))} is attached to line L1: move the line, or detach.`);
    const anchored = syncRoom(room({ walls: [wall({ x2: 240, lines: [line('L1', 50)],
      runs: [run({ width: 30, anchors: { left: true, right: false }, attach: attach('L1') })],
    })] }), settings);
    expect(moveRun(anchored, 'wall-1', 'run-1', 10, settings).reason).toBe('line-attached');
  });

  it('6: refuses moving a neighbour through the hood’s held joint', () => {
    const subject = r8Line();
    expectLock(moveRun(subject, WALL8, LEFT, 30, settings), subject, 'line-held-joint',
      `This joint follows line L1 (${runShortLabel(runOf(subject, HOOD))}): move L1, or detach that run.`);
  });

  it('7: refuses moving a held joint and returns the original room and failure shape', () => {
    const subject = r8Line();
    const result = moveJoint(subject, WALL8, JL, 90, settings);
    expectLock(result, subject, 'line-held-joint', jointLineLock(wallOf(subject), JL).message);
    expect(result).toMatchObject({ x: 90, range: null, limit: null });
  });

  it('8: refuses stretching the neighbour’s held right joint', () => {
    const subject = r8Line();
    expectLock(stretchRun(subject, WALL8, LEFT, 'right', 90, settings), subject, 'line-held-joint',
      jointLineLock(wallOf(subject), JL).message);
  });

  it('9: stretching the unheld left joint matches Room 8 without lines', () => {
    const subject = r8Line();
    const result = stretchRun(subject, WALL8, LEFT, 'left', 36, settings);
    const bare = structuredClone(subject);
    wallOf(bare).lines = [];
    delete runOf(bare, HOOD).attach;
    const base = runOf(bare, BASE);
    base.grid = updateRootItem(base.grid, OPEN, { attach: undefined });
    const expected = stretchRun(bare, WALL8, LEFT, 'left', 36, settings);
    expect(result.reason?.startsWith('line-')).not.toBe(true);
    // The non-line edit has the same outcome; line data remains only in the lined room.
    expect({ ok: result.ok, reason: result.reason }).toEqual({ ok: expected.ok, reason: expected.reason });
    expect(wallOf(result.room).joints).toEqual(wallOf(expected.room).joints);
    expect(wallOf(result.room).runs.map(({ id, x, width }) => [id, x, width]))
      .toEqual(wallOf(expected.room).runs.map(({ id, x, width }) => [id, x, width]));
  });

  it('10: resizes the attached hood without trying to drag its own held joints', () => {
    const subject = r8Line();
    const result = resizeRun(subject, WALL8, HOOD, 81, 'left', settings);
    expect(result.ok).toBe(true);
    expect(runOf(result.room, HOOD)).toMatchObject({ x: 95.5, width: 81 });
    expect(runOf(result.room, LEFT)).toMatchObject({ width: 57.5 });
    expect(runOf(result.room, RIGHT)).toMatchObject({ width: 58.5 });
    expect(wallOf(result.room).joints.filter(({ id }) => [JL, JR].includes(id)).map(({ x }) => x))
      .toEqual([95.5, 176.5]);
    expect(runOf(subject, HOOD)).toMatchObject({ x: 96, width: 80 });
  });

  it('11: Room 8 without lines still moves the joint and keeps the opposite edges', () => {
    const result = moveJoint(room8, WALL8, JL, 94, settings);
    expect(result.ok).toBe(true);
    expect(runOf(result.room, LEFT)).toMatchObject({ x: 38, width: 56 });
    expect(runOf(result.room, HOOD)).toMatchObject({ x: 94, width: 83 });
    expect(wallOf(result.room).joints.map(({ x }) => x)).toEqual([38, 94, 177]);
  });

  it('12: stretching a free centre-attached run grows it about the line', () => {
    const subject = syncRoom(room({ walls: [wall({ x2: 240, lines: [line('L1', 100)],
      runs: [run({ x: 10, width: 30, attach: attach('L1') })],
    })] }), settings);
    const result = stretchRun(subject, 'wall-1', 'run-1', 'right', 120, settings, { exact: true });
    expect(result.ok).toBe(true);
    expect(onlyRun(result)).toMatchObject({ x: 82.5, width: 35 });
  });

  it('13: locks the attached edge but permits stretching the opposite edge', () => {
    const subject = syncRoom(room({ walls: [wall({ x2: 240, lines: [line('L1', 100)],
      runs: [run({ x: 10, width: 30, attach: attach('L1', 'left') })],
    })] }), settings);
    expectLock(stretchRun(subject, 'wall-1', 'run-1', 'left', 95, settings), subject, 'line-attached-edge',
      `${runShortLabel(subject.walls[0].runs[0])}'s left edge is on line L1: drag the other edge, or move the line.`);
    const result = stretchRun(subject, 'wall-1', 'run-1', 'right', 140, settings, { exact: true });
    expect(result.ok).toBe(true);
    expect(onlyRun(result)).toMatchObject({ x: 100, width: 40 });
  });

  it('14: locks stretch and width when the line sizes a run against an anchored end', () => {
    const subject = syncRoom(room({ walls: [wall({ x2: 240, lines: [line('L1', 50)],
      runs: [run({ width: 30, anchors: { left: true, right: false }, attach: attach('L1') })],
    })] }), settings);
    expect(subject.walls[0].runs[0]).toMatchObject({ x: 0, width: 100 });
    const message = `${runShortLabel(subject.walls[0].runs[0])} gets its size from line L1 and its anchored end: move the line, or detach.`;
    expectLock(stretchRun(subject, 'wall-1', 'run-1', 'right', 110, settings), subject, 'line-sized', message);
    expectLock(resizeRun(subject, 'wall-1', 'run-1', 60, 'right', settings), subject, 'line-sized', message);
  });

  it('15: an interior column locks moving the run but allows stretching it', () => {
    const subject = syncRoom(room({ walls: [wall({ x2: 240, lines: [line('L1', 45)],
      runs: [run({ x: 0, width: 90, autoCount: false,
        items: [auto('a'), { ...auto('b'), attach: attach('L1') }, auto('c')],
      })],
    })] }), settings);
    expectLock(moveRun(subject, 'wall-1', 'run-1', 10, settings), subject, 'line-column',
      'A cabinet in this run is on line L1: move the line, or detach it.');
    expect(stretchRun(subject, 'wall-1', 'run-1', 'right', 100, settings, { exact: true }).ok).toBe(true);
    expect(resizeRun(subject, 'wall-1', 'run-1', 100, 'right', settings).ok).toBe(true);
  });

  it('17: Room 10c’s end column locks its right end and typed width, leaving the left end editable', () => {
    const target = wallOf(room10c, WALL10);
    const current = target.runs[0];
    expect(lineEndColumns(current, target)).toEqual({ right: '5ea196ac-4752-42e5-bf15-608401c0c086' });
    expectLock(stretchRun(room10c, WALL10, current.id, 'right', 80, settings), room10c, 'line-end',
      'This end follows the cabinet on line L1: move the line, or detach the cabinet.');
    expectLock(resizeRun(room10c, WALL10, current.id, 80, 'right', settings), room10c, 'line-end',
      `${runShortLabel(current)} gets its width from the cabinet on line L1: move the line, or detach the cabinet.`);
    expect(stretchRun(room10c, WALL10, current.id, 'left', 2, settings).reason?.startsWith('line-')).not.toBe(true);
  });

  it('16: return pins alone never create line locks or change run moves', () => {
    const subject = room({ walls: [wall({ x2: 240, runs: [run({ width: 60, autoCount: false,
      items: [{ ...fixed('a', 30), pin: pin(0, { from: 'return', wallId: 'other', edge: 'left' }) }],
    })] })] });
    for (const action of ['move', 'left', 'right', 'width']) {
      expect(runLineLock(subject.walls[0], 'run-1', action)).toBeNull();
    }
    expect(jointLineLock(subject.walls[0], 'missing')).toBeNull();
    const result = moveRun(subject, 'wall-1', 'run-1', 10, settings, { exact: true });
    expect(result.ok).toBe(true);
    expect(onlyRun(result)).toMatchObject({ x: 10, width: 60 });
  });
});

it('shares exact column-end rules, including fixed outer columns, both faces, and left/right symmetry', () => {
  const current = run({ x: 0, width: 90, autoCount: false, items: [
    fixed('left', 10), { ...fixed('on-line', 30), attach: attach('L1') }, fixed('right', 10),
  ] });
  const target = wall({ lines: [line('L1', 45)], runs: [current] });
  expect(lineEndColumns(current, target)).toEqual({ left: 'on-line', right: 'on-line' });
  for (const action of ['left', 'right', 'width']) expect(runLineLock(target, current.id, action).reason).toBe('line-end');
  const anchored = { ...current, anchors: { left: true, right: false } };
  expect(lineEndColumns(anchored, target)).toEqual({ right: 'on-line' });
  target.lines[0].wallSide = 'back';
  for (const action of ['move', 'left', 'right', 'width']) expect(runLineLock(target, current.id, action)).toBeNull();
  expect(lineEndColumns(current, target)).toEqual({});
  target.lines = [];
  expect(runLineLock(target, current.id, 'move')).toBeNull();
  expect(runLineLock(target, 'missing', 'move')).toBeNull();
});

it('gives joint locks priority over column-end locks and passes resize messages through the store', () => {
  const subject = r8Line();
  const target = wallOf(subject);
  const current = target.runs.find(({ id }) => id === LEFT);
  current.autoCount = false;
  current.grid = updateRootItem(current.grid, runItems(current)[0].id, { attach: attach('L1') });
  expect(runLineLock(target, LEFT, 'right')).toEqual(jointLineLock(target, JL));
  const small = syncRoom(room({ walls: [wall({ x2: 240, lines: [line('L1', 50)],
    runs: [run({ width: 30, anchors: { left: true, right: false }, attach: attach('L1') })],
  })] }), settings);
  const state = { ...createInitialElevationState(null), rooms: [small], activeRoomId: small.id };
  const next = elevationReducer(state, resizeRunAction({ wallId: 'wall-1', runId: 'run-1', width: 60 }));
  expect(next.message).toBe(runLineLock(small.walls[0], 'run-1', 'width').message);
  expect(next.rooms[0].walls[0].runs[0]).toMatchObject({ x: 0, width: 100 });
});
