import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { effectiveSettings } from '../effectiveSettings.js';
import { bandPaths } from '../bandPaths.js';
import { buildCacheFor, withBuildCache } from '../buildCache.js';
import { cornerLegBandParts, sweepBand, viewFromWall, viewRun } from '../bandSweep.js';
import { CABINET_TYPE_IDS } from '../constants.js';
import { syncRoom } from '../roomSync.js';
import { wallNumbers } from '../topology.js';
import { wallSideView } from '../wallSides.js';
import { goldenRooms } from './helpers/goldenRooms.js';


it('builds each sweep, member view and corner leg once per build (D6)', () => {
  const { room: source, settings } = goldenRooms().find(({ key }) => key === 'N4').load();
  const room = syncRoom(source, settings);
  let first;
  withBuildCache(() => {
    const cache = buildCacheFor(room);
    const byPath = cache.byPath;
    const byRoom = cache.byRoom;
    const counts = new Map();
    cache.byRoom = (name, room, settings, build) => byRoom(name, room, settings, () => {
      counts.set(name, (counts.get(name) ?? 0) + 1);
      return build();
    });
    cache.byPath = (name, room, path, settings, member, build) => byPath(name, room, path, settings, member, () => {
      const key = `${name}:${path.id}:${member ?? ''}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return build();
    });
    try {
      for (const path of bandPaths(room, settings).paths) {
        const sweep = sweepBand(room, path, settings);
        first ??= { path, sweep };
        expect(sweepBand(room, path, settings)).toBe(sweep);
        for (const runId of new Set(path.segments.filter(({ corner }) => !corner).map(({ runId }) => runId))) {
          const view = viewRun(room, path, runId, settings);
          expect(viewRun(room, path, runId, settings)).toBe(view);
        }
      }
      for (const { segments } of bandPaths(room, settings).paths) {
        for (const { corner } of segments.filter(({ corner }) => corner)) {
          const owner = room.walls.find(({ id }) => id === corner.ownerWallId).runs
            .find(({ id }) => id === corner.runId);
          const parts = cornerLegBandParts(room, corner.ownerWallId, owner, corner.side, settings);
          expect(cornerLegBandParts(room, corner.ownerWallId, { ...owner }, corner.side, settings)).toBe(parts);
        }
      }
      expect([...counts.values()].every((count) => count === 1)).toBe(true);
    } finally {
      cache.byPath = byPath;
      cache.byRoom = byRoom;
    }
    // A derived path may retain its id while cutting its segments for a particular view.
    expect(sweepBand(room, { ...first.path }, settings)).not.toBe(first.sweep);
    const runId = first.path.segments.find(({ corner }) => !corner).runId;
    const view = viewRun(room, first.path, runId, settings);
    const freshRoom = syncRoom(source, settings);
    const changedSettings = { ...settings };
    expect(sweepBand(freshRoom, first.path, settings)).not.toBe(first.sweep);
    expect(viewRun(freshRoom, first.path, runId, settings)).not.toBe(view);
    expect(sweepBand(room, first.path, changedSettings)).not.toBe(first.sweep);
    expect(viewRun(room, first.path, runId, changedSettings)).not.toBe(view);
  }, room);
  withBuildCache(() => expect(sweepBand(room, first.path, settings)).not.toBe(first.sweep), room);
});

describe('band sweep wall views', () => {
  it('covers profiled crowns and plain toe kicks with conservative hiding strips (D2)', () => {
    const loaded = goldenRooms().find(({ key }) => key === 'N4').load();
    const { settings } = loaded;
    const room = syncRoom(loaded.room, settings);
    const numbers = wallNumbers(room);
    const wall = room.walls.find(({ id }) => numbers.get(id) === 1);
    const runs = wallSideView(wall, 'front').runs.toSorted((a, b) => a.x - b.x);
    const r1 = runs.filter(({ cabinetTypeId }) => cabinetTypeId === CABINET_TYPE_IDS.UPPER)[1];
    const base2 = runs.filter(({ cabinetTypeId }) => cabinetTypeId === CABINET_TYPE_IDS.BASE)[1];
    const { paths } = bandPaths(room, settings);
    const crownPath = paths.find((path) => path.kind === 'crown'
      && path.segments.some(({ runId }) => runId === r1.id));
    const crown = viewFromWall(room, sweepBand(room, crownPath, settings), wall, 'front');
    expect(crownPath.segments[0].front).toBe(16 + 5 / 8);
    expect(crown.strips.length).toBeGreaterThan(1);
    expect(crown.strips[0].z1).toBe(crown.z);
    expect(crown.strips.at(-1).z2).toBe(crown.z + crown.height);
    crown.strips.forEach((strip, index) => {
      expect(strip.z2).toBeGreaterThan(strip.z1);
      if (index) expect(strip.z1).toBe(crown.strips[index - 1].z2);
    });
    expect(crown.strips.some(({ inset }) => inset > 0)).toBe(true);
    expect(crown.strips.every(({ inset }) => inset >= 0)).toBe(true);
    const toePath = paths.find((path) => path.kind === 'toeKick'
      && path.segments.some(({ runId }) => runId === base2.id));
    // This toe-kick path turns onto other walls; isolate its straight segment for D2's wall view.
    const straightToe = { ...toePath,
      segments: toePath.segments.filter(({ runId }) => runId === base2.id), vertices: [],
      end: { type: 'square', runId: base2.id, side: 'right' },
    };
    const toe = viewFromWall(room, sweepBand(room, straightToe, settings), wall, 'front');
    expect(toe.strips).toEqual([{ z1: toe.z, z2: toe.z + toe.height, inset: 0 }]);
  });
});

// Forced uneven Corner 45 (shippingListCorners.test.js setup): the owner piece runs to the diagonal's far end.
it.each([
  { kind: 'toeKick', piece: 1, end: 151, line: 128.527 },
  { kind: 'countertop', piece: 0, end: 146.375, line: 126.793 },
])('runs the $kind owner piece to the uneven Corner 45 diagonal end (D4 c.0)', ({ kind, piece, end, line }) => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/room8cc.json', import.meta.url), 'utf8'));
  const storedWall = source.walls.find(({ name }) => name === 'Wall 3');
  for (const run of storedWall.runs) {
    for (const side of Object.values(run.ends ?? {})) if (side?.type === 'corner') side.corner.kind = 45;
  }
  const BASE = 'b0505231-35e6-4630-8a1e-e9b2181d443c';
  const stored = storedWall.runs.find((run) => run.grid.cells.some(({ node }) => node.id === BASE));
  stored.ends.right.corner.depthB = 15;
  const settings = effectiveSettings({ settings: { ...DEFAULT_SETTINGS } }, source);
  const room = syncRoom(source, settings);
  const path = bandPaths(room, settings).paths.find((candidate) => candidate.kind === kind
    && candidate.vertices.some(({ type }) => type === 'turn')
    && candidate.segments.some(({ runId, corner }) => runId === stored.id && !corner));
  const view = viewRun(room, path, stored.id, settings).pieces[piece];
  expect(view.x + view.width).toBeCloseTo(end, 3);
  const vertical = view.lines.filter(({ x1, x2 }) => Math.abs(x1 - x2) < 1e-6);
  expect(vertical.map(({ x1 }) => x1).some((x) => Math.abs(x - line) < 0.001)).toBe(true);
});

it.each(['toeKick', 'crown'])('cuts each joined %s member at its run edge (D3)', (kind) => {
  const { room: source, settings } = goldenRooms().find(({ key }) => key === 'S4').load();
  const room = syncRoom(source, settings);
  const path = bandPaths(room, settings).paths.find((candidate) => candidate.kind === kind);
  expect(path.segments).toHaveLength(2);
  expect(path.vertices).toMatchObject([{ type: 'joined', turn: 0 }]);
  const [left, right] = path.segments.toSorted((a, b) => a.x1 - b.x1);
  const leftPieces = viewRun(room, path, left.runId, settings).pieces;
  const rightPieces = viewRun(room, path, right.runId, settings).pieces;
  const joint = leftPieces.at(-1).x + leftPieces.at(-1).width;
  expect(joint).toBeCloseTo(left.x2, 6);
  expect(rightPieces[0].x).toBeCloseTo(right.x1, 6);
  expect(joint).toBeCloseTo(rightPieces[0].x, 6);
});

function sweepEnd({ room: key, wall, face = 'front', run, kind, side }) {
  const { room: source, settings } = goldenRooms().find((room) => room.key === key).load();
  const room = syncRoom(source, settings);
  const numbers = wallNumbers(room);
  const path = bandPaths(room, settings).paths.find((path) => path.kind === kind
    && [path.start, path.end].some((rule) => rule.runId.startsWith(run) && rule.side === side)
    && path.segments.some((segment) => segment.runId.startsWith(run)
      && segment.face === face && numbers.get(segment.wallId) === wall));
  const index = [path.start, path.end].findIndex((rule) => rule.runId.startsWith(run) && rule.side === side);
  return { rule: [path.start, path.end][index], cap: sweepBand(room, path, settings).caps[index] };
}

it.each([
  { room: 'N4', wall: 1, run: 'e006a1de', kind: 'countertop', side: 'left', x: 83, joint: 84, facing: -1 },
  { room: 'N4', wall: 1, run: 'f7f82190', kind: 'topMold', side: 'right', x: 54.25, joint: 54, facing: 1 },
  { room: 'N4', wall: 1, run: 'f7f82190', kind: 'crown', side: 'right', x: 57.75, joint: 54, facing: 1 },
])('returns the $room $run $kind $side cap at a solid on a mitre path (D9)', (anchor) => {
  const { rule, cap } = sweepEnd(anchor);
  expect(rule).toMatchObject({ type: 'die-in', against: { kind: 'solid' } });
  expect(cap).toMatchObject({ type: 'return', x: anchor.x, side: anchor.joint, facing: anchor.facing });
  expect(cap.source.loop.length).toBeGreaterThan(0);
});

it.each([
  { room: 'N1', wall: 5, run: '1dd86015', face: 'front', side: 'left', x: 0.8125 },
  { room: 'N1', wall: 5, run: 'eb5f40b0', face: 'back', side: 'right', x: 46.4375 },
  { room: 'N4', wall: 4, run: '100fcdd9', face: 'front', side: 'right', x: 42.5 },
])('squares the $room $run $side floor cap at a waterfall (D9)', (anchor) => {
  const { rule, cap } = sweepEnd({ ...anchor, kind: 'toeKick' });
  expect(rule.type).toBe('waterfall');
  expect(cap).toEqual({ type: 'waterfall', x: anchor.x, source: {} });
});

it.each([
  { room: 'S3', wall: 4, run: '0f8a2992', face: 'front', side: 'left', x: 19.625, joint: 18.8125, facing: 1 },
  { room: 'S3', wall: 4, run: 'c3e90115', face: 'back', side: 'right', x: 59.375, joint: 60.1875, facing: -1 },
])('copes the $room $run $side base cap against its corner neighbor (D9)', (anchor) => {
  const { rule, cap } = sweepEnd({ ...anchor, kind: 'furnitureBase' });
  expect(rule).toMatchObject({ type: 'cope', neighbor: { kind: 'corner', x: anchor.x } });
  expect(rule.neighbor.runId.startsWith('0cc425d0')).toBe(true);
  expect(cap).toEqual({ type: 'cope', x: anchor.x, side: anchor.joint, facing: anchor.facing,
    source: { outline: rule.neighbor.outline } });
});
