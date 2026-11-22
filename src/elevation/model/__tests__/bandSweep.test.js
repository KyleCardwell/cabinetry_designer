import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { effectiveSettings } from '../effectiveSettings.js';
import { bandOutline, endEdgeX } from '../bandEnds.js';
import { cornerLegBandsForOwner } from '../cornerLegBands.js';
import { cornerReturnPoint } from '../corners.js';
import { runBands } from '../runBands.js';
import { runScene } from '../runScene.js';
import { bandPaths } from '../bandPaths.js';
import { mitreEdge, mitreMemberEdge, sweepBand, sweepEligible, viewFromWall, viewRun } from '../bandSweep.js';
import { CABINET_TYPE_IDS } from '../constants.js';
import { syncRoom } from '../roomSync.js';
import { wallNumbers } from '../topology.js';
import { wallSideView } from '../wallSides.js';
import { outlineBounds } from '../sectionProfileOutline.js';
import { goldenRooms } from './helpers/goldenRooms.js';

const PART_KINDS = { toeKick: 'toe_kick', furnitureBase: 'furniture_base', countertop: 'countertop',
  topMold: 'top_mold', crown: 'crown' };

it('compares every mitre member contour with today’s end (D5)', () => {
  const mismatches = [];
  const unexpected = [];
  const turns = {};
  let members = 0;
  const equivalent = (a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 0.001;
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length
      && a.every((value, i) => equivalent(value, b[i]));
  };
  for (const { key, load } of goldenRooms()) {
    const loaded = load();
    const { settings } = loaded;
    const room = syncRoom(loaded.room, settings);
    const numbers = wallNumbers(room);
    for (const path of bandPaths(room, settings).paths) {
      if (!path.vertices.some(({ type }) => type === 'mitre')) continue;
      const sweep = sweepBand(room, path, settings);
      sweep.vertices.forEach((vertex, index) => {
        if (vertex.type !== 'mitre') return;
        const turn = Math.round(Math.abs(vertex.turn));
        turns[turn] = (turns[turn] ?? 0) + 1;
        const pair = sweep.segments.slice(index, index + 2);
        const walls = pair.map(({ wallId }) => numbers.get(wallId));
        for (const member of pair) {
          members += 1;
          const wall = room.walls.find(({ id }) => id === member.wallId);
          const view = wallSideView(wall, member.face);
          const run = view.runs.find(({ id }) => id === member.runId);
          const side = Math.hypot(vertex.at.x - member.from.x, vertex.at.y - member.from.y) < 1e-6
            ? 'left' : 'right';
          const old = mitreMemberEdge(room, sweep, view, run, side, member.frame, settings);
          const actual = mitreEdge(sweep, index, member, member.frame);
          const compare = (field, before, after) => {
            if (equivalent(before, after)) return;
            const mismatch = `${key}, ${path.kind}, W${walls.join('→W')} (W${numbers.get(wall.id)} ${side}), turn=${vertex.turn}, ${field}, old=${JSON.stringify(before)}, new=${JSON.stringify(after)}`;
            mismatches.push(mismatch);
            const allowed = key === 'N4' && Math.abs(Math.abs(vertex.turn) - 45) < 1e-6
              && ['2,3', '3,4'].includes(walls.join(','));
            if (!allowed) unexpected.push(mismatch);
          };
          const front = side === 'left' ? 'maxX' : 'minX';
          compare('front x', outlineBounds(old)[front], outlineBounds(actual)[front]);
          compare('outline end points', old, actual);
          const facing = side === 'left' ? -1 : 1;
          const heights = [...new Set(member.section?.lineHeights ?? [])]
            .filter((z) => z > sweep.z + 1e-6 && z < sweep.z + sweep.height - 1e-6);
          for (const z of heights) compare(`line end x at z=${z}`,
            endEdgeX(old, z, facing), endEdgeX(actual, z, facing));
        }
      });
    }
  }
  console.log('D5 mitre members compared:', members, 'vertices by absolute turn:', JSON.stringify(turns));
  console.log('D5 mitre parity mismatches:', mismatches.length ? `\n${mismatches.join('\n')}` : 'none');
  expect(unexpected, unexpected.join('\n')).toEqual([]);
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
      expect(strip.front).toBeLessThanOrEqual(16 + 5 / 8);
      if (index) expect(strip.z1).toBe(crown.strips[index - 1].z2);
    });
    expect(crown.strips.at(-1).front).toBe(Math.max(...crown.strips.map(({ front }) => front)));
    expect(crown.strips.at(-1).front).toBeGreaterThan(crown.strips[0].front);
    const toePath = paths.find((path) => path.kind === 'toeKick'
      && path.segments.some(({ runId }) => runId === base2.id));
    // This toe-kick path turns onto other walls; isolate its straight segment for D2's wall view.
    const straightToe = { ...toePath,
      segments: toePath.segments.filter(({ runId }) => runId === base2.id), vertices: [],
      end: { type: 'square', runId: base2.id, side: 'right' },
    };
    const toe = viewFromWall(room, sweepBand(room, straightToe, settings), wall, 'front');
    expect(toe.strips).toEqual([{ z1: toe.z, z2: toe.z + toe.height, front: 21 }]);
  });
});

it('projects corner owners and leg members like the drawn bands (D4)', () => {
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
    counts[roomKey] = { owners: 0, legs: 0 };
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
        const point = cornerReturnPoint(room, ownerView, owner, tag.side);
        const returnWall = room.walls.find(({ id }) => id === point.wallId);
        const returnView = wallSideView(returnWall, point.wallSide);
        const oldLeg = cornerLegBandsForOwner(room, returnView, ownerView, owner, tag.side, settings)
          .find(({ kind }) => kind === path.kind);
        const legKey = `corner-leg:${ownerWall.id}:${owner.id}:${tag.side}:${PART_KINDS[path.kind]}`;
        for (const [member, wall, role, expected] of [
          [owner.id, ownerWall, 'owner', oldBands], [legKey, returnWall, 'leg', oldLeg ? [oldLeg.part] : []],
        ]) {
          counts[roomKey][role === 'owner' ? 'owners' : 'legs'] += 1;
          const actual = viewRun(room, path, member, settings)?.pieces ?? [];
          const runNumber = ownerView.runs.toSorted((a, b) => a.x - b.x).findIndex(({ id }) => id === owner.id) + 1;
          const label = `${roomKey}, Wall ${numbers.get(wall.id)}, run ${owner.id} (Wall ${numbers.get(ownerWall.id)} Run ${runNumber}), ${tag.side}, ${path.kind}`;
          const compare = (field, a, b) => {
            if (equivalent(a, b)) return;
            const mismatch = `${label}, ${role} ${field}`;
            mismatches.push(`${mismatch}: old=${JSON.stringify(b)}; new=${JSON.stringify(a)}`);
            const known = roomKey === 'N4' && ((role === 'owner' && numbers.get(ownerWall.id) === 1
              && runNumber === 6 && tag.side === 'right' && path.kind === 'crown' && field === 'lines')
              || (role === 'leg' && numbers.get(ownerWall.id) === 7 && runNumber === 1 && tag.side === 'left'
                && numbers.get(wall.id) === 6 && ['furnitureBase', 'countertop'].includes(path.kind)
                && ['width', 'outline', 'lines'].includes(field)));
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
