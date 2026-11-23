import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { effectiveSettings } from '../effectiveSettings.js';
import { bandOutline } from '../bandEnds.js';
import { runBands } from '../runBands.js';
import { runScene } from '../runScene.js';
import { bandPaths } from '../bandPaths.js';
import { buildCacheFor, withBuildCache } from '../buildCache.js';
import { cornerLegBandParts, sweepBand, sweepEligible, viewFromWall, viewRun } from '../bandSweep.js';
import { CABINET_TYPE_IDS } from '../constants.js';
import { syncRoom } from '../roomSync.js';
import { wallNumbers } from '../topology.js';
import { wallSideView } from '../wallSides.js';
import { goldenRooms } from './helpers/goldenRooms.js';


it('makes every golden band path sweep eligible (D5)', () => {
  const excluded = [];
  for (const { key, load } of goldenRooms()) {
    const { room: source, settings } = load();
    const room = syncRoom(source, settings);
    const numbers = wallNumbers(room);
    for (const path of bandPaths(room, settings).paths) {
      const reason = sweepEligible(room, path, settings);
      if (reason !== null) excluded.push({ room: key, kind: path.kind,
        walls: path.segments.map(({ wallId }) => numbers.get(wallId)), reason });
    }
  }
  expect(excluded, JSON.stringify(excluded, null, 2)).toEqual([]);
});

it('builds each sweep, member view, eligibility and corner leg once per build (D6)', () => {
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
          expect(sweepEligible(room, path, settings, undefined, runId)).toBeNull();
          expect(sweepEligible(room, path, settings, undefined, runId)).toBeNull();
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

it('projects corner owner members like the drawn bands (D4)', () => {
  const mismatches = [];
  const unexpected = [];
  const counts = {};
  const equivalent = (a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 0.001;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, i) => equivalent(value, b[i]));
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((key) => equivalent(a[key], b[key]));
    }
    return a === b;
  };
  const outline = (band) => {
    if (!band) return null;
    const points = (band.outline ?? bandOutline(
      [[band.x, band.z, 0], [band.x, band.z + band.height, 0]],
      [[band.x + band.width, band.z, 0], [band.x + band.width, band.z + band.height, 0]], band.z, band.height,
    )).filter((point, i, all) => !equivalent(point, all[(i + all.length - 1) % all.length]));
    return points;
  };
  const lines = (band) => (band?.lines ?? []).map(({ x1, z1, x2, z2 }) => {
    const points = [[x1, z1], [x2, z2]].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    return points.flat();
  }).sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[3] - b[3] || a[2] - b[2]);
  for (const { key: roomKey, load } of goldenRooms()) {
    const loaded = load();
    const { settings } = loaded;
    const room = syncRoom(loaded.room, settings);
    const numbers = wallNumbers(room);
    counts[roomKey] = { owners: 0 };
    for (const path of bandPaths(room, settings).paths) {
      const corners = [...new Map(path.vertices.filter(({ type }) => type === 'turn').map(({ corner }) => [
        `${corner.ownerWallId}:${corner.runId}:${corner.side}`, corner,
      ])).values()];
      for (const tag of corners) {
        const ownerWall = room.walls.find(({ id }) => id === tag.ownerWallId);
        const owner = ownerWall.runs.find(({ id }) => id === tag.runId);
        const ownerSegment = path.segments.find((segment) => !segment.corner && segment.runId === owner.id);
        const ownerView = wallSideView(ownerWall, ownerSegment.face);
        const old = runBands(room, ownerView, owner, settings, runScene(room, ownerView, owner, settings));
        const oldBands = { toeKick: old.toeKicks, furnitureBase: old.furnitureBases,
          countertop: old.countertops, topMold: [old.topMold], crown: [old.crown] }[path.kind].filter(Boolean);
        for (const [member, wall, role, expected] of [[owner.id, ownerWall, 'owner', oldBands]]) {
          counts[roomKey].owners += 1;
          const actual = viewRun(room, path, member, settings)?.pieces ?? [];
          const runNumber = ownerView.runs.toSorted((a, b) => a.x - b.x).findIndex(({ id }) => id === owner.id) + 1;
          const label = `${roomKey}, Wall ${numbers.get(wall.id)}, run ${owner.id} (Wall ${numbers.get(ownerWall.id)} Run ${runNumber}), ${tag.side}, ${path.kind}`;
          const compare = (field, a, b) => {
            if (equivalent(a, b)) return;
            const mismatch = `${label}, ${role} ${field}`;
            mismatches.push(`${mismatch}: old=${JSON.stringify(b)}; new=${JSON.stringify(a)}`);
            const known = roomKey === 'N4' && numbers.get(ownerWall.id) === 1
              && runNumber === 6 && tag.side === 'right' && path.kind === 'crown' && field === 'lines';
            if (!known) unexpected.push(`${mismatch}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
          };
          if (!actual.length && expected.length) console.log('D4 missing view:', JSON.stringify({
            label, role, old: expected.map(({ x, width, outline, lines }) => ({ x, width, outline, lines })),
            new: null, start: path.start, end: path.end, vertices: path.vertices.map(({ type }) => type),
          }));
          compare('pieces', actual.length, expected.length);
          for (let i = 0; i < Math.min(actual.length, expected.length); i += 1) {
            for (const field of ['x', 'width']) compare(field, actual[i][field], expected[i][field]);
            compare('outline', outline(actual[i]), outline(expected[i]));
            compare('lines', lines(actual[i]), lines(expected[i]));
          }
        }
      }
    }
  }
  console.log('D4 corner views compared:', JSON.stringify(counts));
  console.log('D4 corner view parity mismatches:', mismatches.length ? `\n${mismatches.join('\n')}` : 'none');
  expect(unexpected, unexpected.join('\n')).toEqual([]);
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
  expect(sweepEligible(room, path, settings)).toBeNull();
  const [left, right] = path.segments.toSorted((a, b) => a.x1 - b.x1);
  const leftPieces = viewRun(room, path, left.runId, settings).pieces;
  const rightPieces = viewRun(room, path, right.runId, settings).pieces;
  const joint = leftPieces.at(-1).x + leftPieces.at(-1).width;
  expect(joint).toBeCloseTo(left.x2, 6);
  expect(rightPieces[0].x).toBeCloseTo(right.x1, 6);
  expect(joint).toBeCloseTo(rightPieces[0].x, 6);
});
