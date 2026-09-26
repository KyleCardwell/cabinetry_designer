import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { resolveProfile } from '../profile.js';
import { joinStack, syncRoom } from '../room.js';
import {
  describeStack,
  outerBottom,
  outerTop,
  stackCreatesCycle,
  stackFollowersOf,
  stackOf,
} from '../stacks.js';

const S = DEFAULT_SETTINGS;
const { BASE, UPPER, TALL } = CABINET_TYPE_IDS;
const CAP = { id: 'cap', kind: 'bottom_cap', height: 1.5, doors: 'visible' };
const link = (runId, offset = 0) => ({ runId, offset });

function makeRun(id, cabinetTypeId, overrides = {}) {
  return {
    id, cabinetTypeId, x: 0, width: 60, z: 4, height: 30.5, depth: cabinetTypeId === UPPER ? 12 : 24,
    ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
    autoCount: false, maxCabinetWidth: null,
    items: [{ id: `${id}-cabinet`, kind: 'cabinet', width: null }],
    heightMode: 'auto', overrides: {}, anchors: { left: false, right: false },
    ...overrides,
  };
}

function rawRoom(runs) {
  return {
    id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: ['A'],
    walls: [{
      id: 'A', name: '', numberOverride: null, x1: 0, y1: 0, x2: 120, y2: 0,
      height: 96, thickness: 4.5, flipped: false,
      connections: { start: null, end: null }, profile: {}, openings: [], runs,
    }],
  };
}

const base = (overrides) => makeRun('B', BASE, overrides);
const upper = (overrides) => makeRun('U', UPPER, { bottom: [CAP], ...overrides });
const middle = (stack, overrides) => makeRun('M', UPPER, {
  heightMode: 'manual', z: 40, height: 10, stack, ...overrides,
});
/** The budgeted room: base with a countertop, upper with a cap, a middle run between them. */
const budgeted = (overrides = {}) => rawRoom([
  base(overrides.base), upper(overrides.upper),
  middle({ below: link('B'), above: link('U') }, overrides.middle),
]);
const runOf = (room, id) => room.walls[0].runs.find((run) => run.id === id);

describe('SPEC-35 stacked runs', () => {
  it('fills between a countertop and a cap, and refits when either moves', () => {
    const synced = syncRoom(budgeted(), S);
    expect(runOf(synced, 'B')).toMatchObject({ z: 4, height: 30.5 });
    expect(runOf(synced, 'U')).toMatchObject({ z: 54, height: 36 });
    expect(runOf(synced, 'M')).toMatchObject({ z: 36, height: 16.5 });

    const moved = syncRoom(budgeted({
      base: { overrides: { baseBoxHeight: 32 } },
      upper: { overrides: { upperClearance: 20 } },
    }), S);
    expect(runOf(moved, 'B')).toMatchObject({ z: 4, height: 32 });
    expect(runOf(moved, 'U')).toMatchObject({ z: 57.5, height: 32.5 });
    expect(runOf(moved, 'M')).toMatchObject({ z: 37.5, height: 18.5 });
  });

  it('keeps a manual height or an auto edge when only one side is linked', () => {
    const onBase = syncRoom(rawRoom([base(), upper(), middle({ below: link('B', 1), above: null })]), S);
    expect(runOf(onBase, 'M')).toMatchObject({ z: 37, height: 10 });

    const underUpper = syncRoom(rawRoom([base(), upper(), middle({ below: null, above: link('U', 2) })]), S);
    expect(runOf(underUpper, 'M')).toMatchObject({ z: 40.5, height: 10 });

    const hutch = syncRoom(rawRoom([base(), upper({ stack: { below: link('B'), above: null } })]), S);
    expect(runOf(hutch, 'U')).toMatchObject({ z: 37.5, height: 52.5 });
  });

  it('frees links to missing or other-side runs, and leaves a loop where it was', () => {
    const missing = runOf(syncRoom(rawRoom([middle({ below: link('X'), above: null })]), S), 'M');
    expect(missing.stack.below).toBeNull();
    expect(missing).toMatchObject({ z: 40, height: 10 });

    const otherSide = syncRoom(rawRoom([
      base({ wallSide: 'back' }), middle({ below: link('B'), above: null }),
    ]), S);
    expect(runOf(otherSide, 'M').stack.below).toBeNull();

    const loop = syncRoom(rawRoom([
      makeRun('P', UPPER, { heightMode: 'manual', z: 40, height: 10, stack: { below: link('Q'), above: null } }),
      makeRun('Q', UPPER, { heightMode: 'manual', z: 60, height: 10, stack: { below: link('P'), above: null } }),
    ]), S);
    expect(runOf(loop, 'P')).toMatchObject({ z: 40, height: 10 });
    expect(runOf(loop, 'Q')).toMatchObject({ z: 60, height: 10 });
  });

  it('finds stacks, followers and loops, and describes a link', () => {
    const room = syncRoom(budgeted(), S);
    const wall = room.walls[0];
    const profile = resolveProfile(S, room, wall);
    expect(outerTop(wall, runOf(room, 'B'), profile)).toBe(36);
    expect(outerBottom(runOf(room, 'U'))).toBe(52.5);
    expect(stackOf(wall, 'U').map((run) => run.id)).toEqual(['B', 'M', 'U']);
    expect(stackFollowersOf(wall, ['B'])).toEqual(['M']);
    expect(stackFollowersOf(wall, ['U'])).toEqual(['M']);
    expect(stackCreatesCycle(wall, 'B', 'M')).toBe(true);
    expect(stackCreatesCycle(wall, 'M', 'B')).toBe(false);
    expect(stackCreatesCycle(wall, 'M', 'M')).toBe(true);
    expect(describeStack(wall, runOf(room, 'M'), 'below')).toBe('Sits on Base 0"–60" · flush');

    const gapped = syncRoom(budgeted({ middle: { stack: { below: link('B'), above: link('U', 1) } } }), S);
    expect(describeStack(gapped.walls[0], runOf(gapped, 'M'), 'above')).toBe('Held under Upper 0"–60" · 1" gap');
  });

  it('joins a stack, and refuses a loop, no overlap or a collision', () => {
    const room = rawRoom([base(), upper(), middle(undefined)]);
    const first = joinStack(room, 'A', 'M', 'below', 'B', S);
    expect(first.ok).toBe(true);
    expect(runOf(first.room, 'M')).toMatchObject({ z: 36, height: 10 });
    expect(runOf(first.room, 'M').stack).toEqual({ below: link('B'), above: null });

    const second = joinStack(first.room, 'A', 'M', 'above', 'U', S);
    expect(second.ok).toBe(true);
    expect(runOf(second.room, 'M')).toMatchObject({ z: 36, height: 16.5 });

    expect(joinStack(second.room, 'A', 'B', 'below', 'M', S)).toMatchObject({ ok: false, reason: 'stack-cycle' });
    expect(joinStack(room, 'A', 'U', 'below', 'B', S)).toMatchObject({ ok: false, reason: 'conflict' });
    expect(joinStack(rawRoom([base(), makeRun('X', UPPER, { x: 70, width: 24 })]), 'A', 'X', 'below', 'B', S))
      .toMatchObject({ ok: false, reason: 'stack-no-overlap' });

    const tall = joinStack(
      rawRoom([base(), makeRun('T', TALL, { heightMode: 'manual', z: 40, height: 20 })]),
      'A', 'T', 'below', 'B', S,
    );
    expect(tall.ok).toBe(true);
    expect(runOf(tall.room, 'T')).toMatchObject({ z: 36, height: 20 });
  });
});
