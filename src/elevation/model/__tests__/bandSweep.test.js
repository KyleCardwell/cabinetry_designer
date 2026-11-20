import { describe, expect, it } from 'vitest';
import { bandOutline } from '../bandEnds.js';
import { bandPaths } from '../bandPaths.js';
import { sweepBand, viewFromWall } from '../bandSweep.js';
import { cornerEnd } from '../cornerEnd.js';
import { ownerBandTurnLines } from '../cornerBands.js';
import { ownerBands } from '../cornerLegBands.js';
import { runBandEnds, runBands, waterfallEnds } from '../runBands.js';
import { runScene } from '../runScene.js';
import { syncRoom } from '../roomSync.js';
import { wallNumbers } from '../topology.js';
import { wallSideFrame, wallSideView } from '../wallSides.js';
import { goldenRooms } from './helpers/goldenRooms.js';

const KINDS = new Set(['toeKick', 'topMold', 'crown']);
const EPSILON = 1e-3;
const flatOutline = ({ x, z, width, height }) => bandOutline(
  [[x, z, 0], [x, z + height, 0]], [[x + width, z, 0], [x + width, z + height, 0]], z, height,
);

// bandOutline crosses from the right cap to the left cap at the band's top.
function edgesOf(band) {
  const outline = band.outline ?? flatOutline(band);
  let bridge = -1;
  let longest = -Infinity;
  outline.forEach(([x, z], index) => {
    const [nextX, nextZ] = outline[(index + 1) % outline.length];
    if (Math.abs(z - band.z - band.height) > 1e-6 || Math.abs(nextZ - z) > 1e-6) return;
    if (x - nextX > longest) { bridge = index; longest = x - nextX; }
  });
  expect(bridge, 'legacy outline top bridge').toBeGreaterThan(0);
  return [[outline[0], ...outline.slice(bridge + 1).toReversed()], outline.slice(1, bridge + 1)];
}

function hasTurnLines(room, view, run, settings, scene, kind, band) {
  for (const side of ['left', 'right']) {
    if (run.ends?.[side]?.corner?.kind !== 45) continue;
    const corner = cornerEnd(room, view, run, side, settings, scene.result);
    if (!corner?.active || !corner.shape || !corner.columnId) continue;
    if (ownerBands(room, view, run, settings).filter((entry) => entry.kind === kind)
      .some((entry) => ownerBandTurnLines(corner, entry, band).length)) return true;
  }
  return false;
}

function skipReason(path, records) {
  const first = path.segments[0];
  if (path.segments.some(({ wallId, face }) => wallId !== first.wallId || face !== first.face)) return 'multiple faces';
  if (path.closed || path.vertices.some(({ type }) => type !== 'joined')) return 'non-joined vertices';
  if ([path.start, path.end].some((end) => end?.type === 'corner')) return 'corner caps';
  if (records.some(({ bands }) => bands.topSegments.length)) return 'top segments';
  if (records.some(({ bands }) => path.kind === 'toeKick' && bands.toeKicks.length !== 1)) return 'floor openings';
  if (records.some(({ waterfall }) => waterfall.left || waterfall.right)) return 'waterfall run';
  if (records.some(({ turnLines }) => turnLines)) return 'Corner 45 turn lines';
  for (const rule of [path.start, path.end]) {
    const record = records.find(({ run }) => run.id === rule.runId);
    const old = record.ends[rule.side === 'left' ? 0 : 1].type;
    const current = rule.type === 'die-in' ? 'square' : rule.type;
    if (old !== current) return `cap type ${old} → ${rule.type}`;
  }
  return null;
}

function compare(old, current, label, field, failures) {
  if (typeof old === 'number' && typeof current === 'number') {
    if (!Number.isFinite(current) || Math.abs(old - current) > EPSILON) failures.push(`${label}: ${field} ${old} → ${current}`);
  } else if (Array.isArray(old) && Array.isArray(current)) {
    if (old.length !== current.length) failures.push(`${label}: ${field}.length ${old.length} → ${current.length}`);
    old.forEach((value, index) => compare(value, current[index], label, `${field}[${index}]`, failures));
  } else if (old && current && typeof old === 'object' && typeof current === 'object') {
    for (const key of Object.keys(old)) compare(old[key], current[key], label, `${field}.${key}`, failures);
  } else if (old !== current) failures.push(`${label}: ${field} ${JSON.stringify(old)} → ${JSON.stringify(current)}`);
}

describe('band sweep wall views', () => {
  it.each(goldenRooms().map(({ key, load }) => [key, load]))(
    'matches eligible straight band outlines and lines in %s (D2)', (roomKey, load) => {
      const loaded = load();
      const { settings } = loaded;
      const room = syncRoom(loaded.room, settings);
      const numbers = wallNumbers(room);
      const { paths } = bandPaths(room, settings);
      const counts = { compared: 0, skipped: {} };
      const failures = [];
      for (const path of paths.filter(({ kind }) => KINDS.has(kind))) {
        const records = path.segments.map((segment) => {
          const wall = room.walls.find(({ id }) => id === segment.wallId);
          const frame = wallSideFrame(room, wall, segment.face);
          const view = { ...wallSideView(wall, segment.face), length: frame.length };
          const run = view.runs.find(({ id }) => id === segment.runId);
          const scene = runScene(room, view, run, settings);
          const bands = runBands(room, view, run, settings, scene);
          const band = path.kind === 'toeKick' ? bands.toeKicks[0] : bands[path.kind];
          return { wall, view, run, bands, band,
            ends: runBandEnds(room, view, run, settings, scene, path.kind, path.z, path.height),
            waterfall: waterfallEnds(room, view, run, settings),
            turnLines: band && hasTurnLines(room, view, run, settings, scene, path.kind, band) };
        });
        const reason = skipReason(path, records);
        if (reason) { counts.skipped[reason] = (counts.skipped[reason] ?? 0) + 1; continue; }
        counts.compared += 1;
        const { wall, view } = records[0];
        const label = `${roomKey}, Wall ${numbers.get(wall.id)} ${view.side}, ${path.id}, ${path.kind}`;
        const sweep = sweepBand(room, path, settings);
        const actual = viewFromWall(room, sweep, wall, view.side);
        if (!actual) { failures.push(`${label}: view band → null`); continue; }
        records.sort((a, b) => a.run.x - b.run.x);
        const bands = records.map(({ band }) => band);
        if (bands.some((band) => !band)) { failures.push(`${label}: legacy band missing`); continue; }
        const first = bands[0];
        const last = bands.at(-1);
        const x = Math.min(...bands.map((band) => band.x));
        const end = Math.max(...bands.map((band) => band.x + band.width));
        const expected = { x, z: first.z, width: end - x, height: first.height,
          outline: bands.length === 1 ? first.outline ?? flatOutline(first)
            : bandOutline(edgesOf(first)[0], edgesOf(last)[1], first.z, first.height),
          lines: (first.lines ?? []).map((line, index) => ({ ...line, x2: last.lines[index]?.x2 })) };
        for (const band of bands) {
          compare((first.lines ?? []).map(({ z1, z2 }) => [z1, z2]),
            (band.lines ?? []).map(({ z1, z2 }) => [z1, z2]), label, 'member line heights', failures);
        }
        compare(expected, actual, label, 'view', failures);
      }
      if (process.env.PERF) console.log('D2 parity:', JSON.stringify({ room: roomKey, ...counts }));
      expect(failures, failures.join('\n')).toEqual([]);
      if (process.env.PERF && roomKey === 'N1') {
        bandPaths(room, settings);
        let start = performance.now();
        bandPaths(room, settings);
        const pathsMs = performance.now() - start;
        const draw = () => paths.forEach((path) => {
          const sweep = sweepBand(room, path, settings);
          if (sweep) viewFromWall(room, sweep, room.walls.find(({ id }) => id === path.segments[0].wallId), path.segments[0].face);
        });
        draw();
        start = performance.now();
        draw();
        console.log('D2 N1 warm (ms):', JSON.stringify({ bandPaths: pathsMs, sweepsAndViews: performance.now() - start }));
      }
    },
  );
});
