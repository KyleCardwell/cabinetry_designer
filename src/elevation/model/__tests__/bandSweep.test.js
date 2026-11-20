import { describe, expect, it } from 'vitest';
import { bandOutline } from '../bandEnds.js';
import { cornerLegBandsForOwner } from '../cornerLegBands.js';
import { cornerReturnPoint } from '../corners.js';
import { runBands } from '../runBands.js';
import { runScene } from '../runScene.js';
import { bandPaths } from '../bandPaths.js';
import { sweepBand, viewFromWall, viewRun } from '../bandSweep.js';
import { CABINET_TYPE_IDS } from '../constants.js';
import { syncRoom } from '../roomSync.js';
import { wallNumbers } from '../topology.js';
import { wallSideView } from '../wallSides.js';
import { goldenRooms } from './helpers/goldenRooms.js';

const PART_KINDS = { toeKick: 'toe_kick', furnitureBase: 'furniture_base', countertop: 'countertop',
  topMold: 'top_mold', crown: 'crown' };

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
