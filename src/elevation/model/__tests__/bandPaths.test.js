import { describe, expect, it } from 'vitest';
import { bandPaths } from '../bandPaths.js';
import { bandFronts } from '../bandParts.js';
import { sweepEligible } from '../bandSweep.js';
import { cornerBandTurns } from '../cornerBands.js';
import { cornerEnd } from '../cornerEnd.js';
import { CABINET_TYPE_IDS } from '../constants.js';
import { cornerLegBandsForOwner, ownerBands } from '../cornerLegBands.js';
import { cornerAt, cornerEndActive, cornerReturnPoint, cornerReturnRuns } from '../corners.js';
import { elevationToPlan, planPointToWallX } from '../geometry.js';
import { wallEndPanelPartKey } from '../parts.js';
import { recessesOn } from '../recesses.js';
import { runBandEnds, runBands, waterfallEnds } from '../runBands.js';
import { runScene } from '../runScene.js';
import { syncRoom } from '../roomSync.js';
import { wallNumbers } from '../topology.js';
import { WALL_SIDES, wallEndPanelAt, wallSideFrame, wallSideView } from '../wallSides.js';
import { goldenRooms } from './helpers/goldenRooms.js';

const loaded = goldenRooms().find(({ key }) => key === 'N4').load();
const room = syncRoom(loaded.room, loaded.settings);
const settings = loaded.settings;
const result = bandPaths(room, settings);
const numbers = wallNumbers(room);
const wall = (number) => room.walls.find(({ id }) => numbers.get(id) === number);
const runs = (number, type) => wall(number).runs.filter(({ cabinetTypeId }) => cabinetTypeId === type)
  .sort((a, b) => a.x - b.x);
const base = (number, index = 0) => runs(number, CABINET_TYPE_IDS.BASE)[index];
const uppers = runs(1, CABINET_TYPE_IDS.UPPER);
const key = (run, kind, z, side) => `${run.id}|${kind}|${z}|${side}`;
const pathFor = (run, kind) => result.paths.find((path) => path.kind === kind
  && path.segments.some(({ runId }) => runId === run.id));
const ruleFor = (run, kind, side) => {
  const path = pathFor(run, kind);
  return [path.start, path.end].find((end) => end?.runId === run.id && end.side === side);
};

describe('band paths', () => {
  it('mitres the blind tall moldings into the upper at their front intersection (D5)', () => {
    const tall = runs(5, CABINET_TYPE_IDS.TALL)[0];
    const upper = runs(4, CABINET_TYPE_IDS.UPPER)[0];
    const tallWall = wallSideView(wall(5), 'front');
    const upperFrame = wallSideFrame(room, wall(4), 'front');
    for (const [kind, start, end] of [['crown', 19.625, 53.875], ['topMold', 16.125, 57.375]]) {
      const path = pathFor(tall, kind);
      const [tallEnd] = runBandEnds(room, tallWall, tall, settings,
        runScene(room, tallWall, tall, settings), kind, path.z, path.height);
      expect(tallEnd.x).toBeCloseTo(start, 6);
      expect(planPointToWallX(wallSideFrame(room, wall(5), 'front'),
        result.ends.get(key(tall, kind, path.z, 'left')).at)).toBeCloseTo(start, 6);
      expect(result.ends.get(key(tall, kind, path.z, 'left')).type).toBe('mitre');
      const upperEnd = result.ends.get(key(upper, kind, path.z, 'right'));
      expect(upperEnd.type).toBe('mitre');
      expect(planPointToWallX(upperFrame, upperEnd.at)).toBeCloseTo(end, 6);
    }
  });

  it('accounts for every drawn run band end exactly once (D1)', () => {
    const expected = [];
    for (const source of room.walls) for (const face of WALL_SIDES) {
      const view = wallSideView(source, face);
      for (const run of view.runs) {
        const bands = runBands(room, view, run, settings, runScene(room, view, run, settings));
        for (const [kind, band] of [
          ['toeKick', bands.toeKicks[0]], ['furnitureBase', bands.furnitureBases[0]],
          ['countertop', bands.countertop], ['topMold', bands.topMold], ['crown', bands.crown],
        ]) {
          // A waterfall's final envelope reaches the floor; runBandEnds receives the main top's z.
          const z = kind === 'countertop' ? run.z + run.height : band?.z;
          if (band) for (const side of ['left', 'right']) expected.push(key(run, kind, z, side));
        }
      }
    }
    const actual = [];
    let representedEnds = 0;
    for (const path of result.paths) {
      representedEnds += (path.start ? 1 : 0) + (path.end ? 1 : 0) + path.vertices.length * 2
        - path.segments.filter(({ corner }) => corner).length * 2;
      for (const segment of path.segments.filter(({ corner }) => !corner)) for (const side of ['left', 'right']) {
        const endKey = `${segment.runId}|${path.kind}|${path.z}|${side}`;
        actual.push(endKey);
        expect(result.ends.get(endKey)?.pathId).toBe(path.id);
      }
    }
    expect(actual.sort()).toEqual(expected.sort());
    expect(new Set(actual).size).toBe(actual.length);
    expect([...result.ends.keys()].filter((key) => !key.startsWith('corner-')).sort()).toEqual(expected);
    expect(representedEnds).toBe(expected.length);
  });

  it.each([
    ['A', 7, 1, 'furnitureBase', 90, undefined],
    ['C', 2, 3, 'countertop', 45, 'miter'],
    ['D', 3, 4, 'countertop', 45, 'miter'],
  ])('mitres equal fronts at corner %s on both plan lines (D1)', (_, a, b, kind, angle, mode) => {
    const path = pathFor(base(a), kind);
    expect(result.paths.filter((candidate) => candidate.kind === kind
      && [base(a).id, base(b).id].every((id) => candidate.segments.some(({ runId }) => runId === id))))
      .toHaveLength(1);
    const index = path.segments.findIndex((segment, i) => i < path.segments.length - 1
      && [segment.runId, path.segments[i + 1].runId].includes(base(a).id)
      && [segment.runId, path.segments[i + 1].runId].includes(base(b).id));
    expect(index).toBeGreaterThanOrEqual(0);
    const vertex = path.vertices[index];
    expect(vertex.type).toBe('mitre');
    expect(Math.abs(vertex.turn)).toBeCloseTo(angle, 6);
    expect(vertex.mode).toBe(mode);
    for (const segment of path.segments.slice(index, index + 2)) {
      const source = room.walls.find(({ id }) => id === segment.wallId);
      const frame = wallSideFrame(room, source, segment.face);
      const point = elevationToPlan(frame, segment.x1, segment.front);
      const distance = Math.abs((vertex.at.x - point.x) * frame.r.y - (vertex.at.y - point.y) * frame.r.x);
      expect(distance).toBeLessThan(0.001);
      expect([segment.from, segment.to].some((end) => Math.hypot(end.x - vertex.at.x, end.y - vertex.at.y) < 0.001))
        .toBe(true);
    }
  });

  it('keeps shorter crowns and uppers across a projection in separate paths (D1)', () => {
    const [across, r1, r2] = uppers;
    expect(r1.height - r2.height).toBe(6);
    const first = pathFor(r1, 'crown');
    expect(result.ends.get(key(r1, 'crown', first.z, 'right')).type).not.toBe('joined');
    expect(first.segments.some(({ runId }) => runId === r2.id || runId === across.id)).toBe(false);
    expect(ruleFor(r2, 'crown', 'left')).toMatchObject({
      type: 'die-in', against: { kind: 'run', id: r1.id },
    });
  });

  it('dies the toe kick into the projection solid (D1)', () => {
    const run = base(1, 1);
    expect(ruleFor(run, 'toeKick', 'left')).toMatchObject({
      type: 'die-in', against: { kind: 'solid', id: run.anchors.left.recessId },
    });
  });


});

it('matches corner leg ends and turn points across golden rooms (D4)', () => {
  const counts = {};
  const failures = [];
  for (const { key: roomKey, load } of goldenRooms()) {
    counts[roomKey] = 0;
    const { room: source, settings } = load();
    const room = syncRoom(source, settings);
    const result = bandPaths(room, settings);
    const numbers = wallNumbers(room);
    const compare = (label, field, actual, expected) => {
      const equal = typeof expected === 'number' ? typeof actual === 'number' && Math.abs(actual - expected) <= 0.001
        : actual === expected;
      if (!equal) failures.push(`${label}, ${field}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
    };
    for (const ownerWall of room.walls) for (const face of WALL_SIDES) {
      const view = wallSideView(ownerWall, face);
      const ownerFrame = wallSideFrame(room, ownerWall, face);
      for (const owner of view.runs) for (const side of ['left', 'right']) {
        if (!cornerEndActive(room, view, owner, side).active) continue;
        const point = cornerReturnPoint(room, view, owner, side);
        const returnWall = room.walls.find(({ id }) => id === point.wallId);
        const returnView = wallSideView(returnWall, point.wallSide);
        const returnFrame = wallSideFrame(room, returnWall, point.wallSide);
        const corner = cornerEnd(room, view, owner, side, settings);
        const oldLegs = cornerLegBandsForOwner(room, returnView, view, owner, side, settings);
        for (const band of ownerBands(room, view, owner, settings)) {
          const { kind, z, height, front } = band;
          const label = `${roomKey}, Wall ${numbers.get(ownerWall.id)} ${face}, run ${owner.id}, ${side}, ${kind}`;
          const old = oldLegs.find((leg) => leg.kind === kind);
          // Invalid corner geometry has no drawn leg to compare.
          if (!corner.shape || !corner.columnId) continue;
          counts[roomKey] += 1;
          compare(label, 'legacy leg', Boolean(old), true);
          const ownerEnd = result.ends.get(key(owner, kind, z, side));
          const path = result.paths.find(({ id }) => id === ownerEnd?.pathId);
          compare(label, 'owner path', Boolean(path), true);
          if (!path || !old) continue;
          compare(label, 'eligibility', sweepEligible(room, path, settings), null);
          const matches = (tag) => tag?.ownerWallId === ownerWall.id && tag.runId === owner.id && tag.side === side;
          const turns = path.vertices.filter(({ type, corner }) => type === 'turn' && matches(corner));
          compare(label, 'turn count', turns.length, corner.kind === 90 ? 1 : 2);
          const turn = cornerBandTurns(corner, kind, front);
          const a = elevationToPlan(ownerFrame, corner.cornerX + corner.dir * turn.a[0], turn.frontA);
          const b = elevationToPlan(returnFrame, point.at + point.dir * turn.b[1], turn.frontB);
          const diagonalDirection = { x: b.x - a.x, y: b.y - a.y };
          const towardCorner = side === 'left' ? -1 : 1;
          const incoming = { x: ownerFrame.r.x * towardCorner, y: ownerFrame.r.y * towardCorner };
          const outgoing = { x: returnFrame.r.x * point.dir, y: returnFrame.r.y * point.dir };
          const angles = corner.kind === 90 ? [90]
            : [[incoming, diagonalDirection], [diagonalDirection, outgoing]].map(([from, to]) => Math.abs(Math.atan2(
              from.x * to.y - from.y * to.x, from.x * to.x + from.y * to.y,
            ) * 180 / Math.PI));
          if (corner.kind === 45) {
            compare(label, 'total turn degrees', Math.abs(turns.reduce((sum, vertex) => sum + vertex.turn, 0)), 90);
          }
          for (const [i, expected] of (corner.kind === 90 ? [a] : [a, b]).entries()) {
            const vertex = turns.find(({ at }) => Math.hypot(at.x - expected.x, at.y - expected.y) <= 0.001);
            compare(label, `turn ${i + 1} point`, Boolean(vertex), true);
            if (vertex) {
              compare(label, `turn ${i + 1} degrees`, Math.abs(vertex.turn), angles[i]);
              compare(label, `turn ${i + 1} wood mode`, vertex.mode, undefined);
              compare(label, `turn ${i + 1} kind`, vertex.corner.kind, corner.kind);
            }
          }
          const ownerSegment = path.segments.find((segment) => !segment.corner && segment.runId === owner.id);
          const ownerAt = ownerSegment?.[side === 'left' ? 'from' : 'to'];
          compare(label, 'owner turn x', ownerAt?.x, a.x);
          compare(label, 'owner turn y', ownerAt?.y, a.y);
          const diagonal = path.segments.find((segment) => segment.diagonal && matches(segment.corner));
          compare(label, 'diagonal', Boolean(diagonal), corner.kind === 45);
          if (diagonal) for (const [field, expected] of [['from', a], ['to', b]]) {
            compare(label, `diagonal ${field} x`, diagonal[field].x, expected.x);
            compare(label, `diagonal ${field} y`, diagonal[field].y, expected.y);
          }
          const leg = path.segments.find((segment) => segment.corner?.leg === 'b' && matches(segment.corner));
          const far = old.near === 'left' ? 'right' : 'left';
          const zeroLeg = Math.abs(old.jointX - (point.at + point.dir * turn.b[1])) <= 1e-6;
          compare(label, 'leg segment', Boolean(leg), !zeroLeg);
          let legEnd;
          if (leg) {
            compare(label, 'leg wall', leg.wallId, returnWall.id);
            compare(label, 'leg face', leg.face, point.wallSide);
            compare(label, 'leg front', leg.front, turn.frontB);
            compare(label, 'leg jointX', planPointToWallX(returnFrame, leg[far === 'left' ? 'from' : 'to']), old.jointX);
            const nearAt = leg[old.near === 'left' ? 'from' : 'to'];
            compare(label, 'leg turn x', nearAt.x, b.x);
            compare(label, 'leg turn y', nearAt.y, b.y);
            legEnd = result.ends.get(`${leg.memberKey}|${kind}|${z}|${far}`);
          } else if (diagonal) {
            legEnd = result.ends.get(`${diagonal.memberKey}|${kind}|${z}|right`);
          }
          const { runs } = cornerReturnRuns(room, view, owner, side);
          const blocked = !['toeKick', 'furnitureBase'].includes(kind)
            && runs.some((run) => run.z + run.height > z + height + 1e-6);
          const deepest = Math.max(...old.carriers.map((run) => bandFronts(room, returnView, run, settings)[kind]));
          const expectedType = blocked ? 'die-in' : old.returned ? 'return' : old.edge ? 'turn'
            : Math.abs(old.part.front - deepest) <= 1e-6 ? 'joined' : 'square';
          compare(label, 'leg end type', legEnd?.type, expectedType);
          const newJointX = legEnd?.jointX ?? (legEnd?.at && planPointToWallX(returnFrame, legEnd.at));
          compare(label, 'jointX', newJointX, old.jointX);
          if (blocked) compare(label, 'blocking run', runs.some((run) => run.id === legEnd?.against?.id
            && run.z + run.height > z + height + 1e-6), true);
        }
      }
    }
  }
  console.log('D4 corner ends compared:', JSON.stringify(counts));
  expect(failures, failures.join('\n')).toEqual([]);
});

it.each(goldenRooms().map(({ key, load }) => [key, load]))(
  'allows only specified band end transitions in %s (D1)', (roomKey, load) => {
    const { room: source, settings } = load();
    const room = syncRoom(source, settings);
    const numbers = wallNumbers(room);
    const result = bandPaths(room, settings);
    const records = new Map();
    const partners = new Map();
    const joints = [];
    for (const path of result.paths) {
      for (const segment of path.segments.filter(({ corner }) => !corner)) {
        const wall = room.walls.find(({ id }) => id === segment.wallId);
        const view = wallSideView(wall, segment.face);
        const run = view.runs.find(({ id }) => id === segment.runId);
        const scene = runScene(room, view, run, settings);
        const old = runBandEnds(room, view, run, settings, scene, path.kind, path.z, path.height);
        const front = bandFronts(room, view, run, settings)[path.kind];
        for (const [index, side] of ['left', 'right'].entries()) {
          const anchor = run.anchors?.[side];
          const projection = anchor?.to === 'recess' && run._plane?.recessId !== anchor.recessId
            ? recessesOn(view).find(({ id, kind }) => id === anchor.recessId && kind === 'projection') : null;
          records.set(key(run, path.kind, path.z, side), {
            old: old[index].type,
            corner: cornerEndActive(room, view, run, side).active
              || Boolean(result.ends.get(key(run, path.kind, path.z, side))?.corner
                || result.ends.get(key(run, path.kind, path.z, side))?.against?.kind === 'corner'),
            label: `${roomKey}, Wall ${numbers.get(wall.id)} ${segment.face}, run ${run.id}, ${path.kind}, ${side}`,
            wall: numbers.get(wall.id), face: segment.face, side,
            angle: cornerAt(room, view, side).angle,
            runId: run.id, kind: path.kind, front, projection,
            waterfall: Boolean(waterfallEnds(room, view, run, settings)[side]),
            wallPanel: anchor === true ? wallEndPanelAt(room, view, side, settings) : null,
            wallId: wall.id,
            rule: [path.start, path.end].find((end) => end?.runId === run.id && end.side === side),
          });
        }
      }
      path.vertices.forEach((vertex, index) => {
        if (vertex.type !== 'mitre') return;
        const pair = [path.segments[index], path.segments[(index + 1) % path.segments.length]];
        const ends = pair.map((segment) => {
          const side = ['left', 'right'].find((side) => {
            const point = side === 'left' ? segment.from : segment.to;
            return Math.hypot(point.x - vertex.at.x, point.y - vertex.at.y) < 1e-6;
          });
          expect(side, `${roomKey}: mitre must meet a segment end`).toBeDefined();
          return `${segment.runId}|${path.kind}|${path.z}|${side}`;
        });
        const equalFronts = Math.abs(pair[0].front - pair[1].front) <= 1 / 32;
        partners.set(ends[0], { other: ends[1], equalFronts });
        partners.set(ends[1], { other: ends[0], equalFronts });
        joints.push({ ends, kind: path.kind, z: path.z, equalFronts });
      });
    }
    const counts = {};
    const failures = [];
    const classB = [];
    const classW = [];
    for (const [endKey, { type }] of result.ends) {
      if (endKey.startsWith('corner-')) continue;
      const record = records.get(endKey);
      expect(record, `${roomKey}: missing legacy end ${endKey}`).toBeDefined();
      const pair = `${record.old} → ${type}`;
      counts[pair] = (counts[pair] ?? 0) + 1;
      const partner = partners.get(endKey);
      const classA = record.old === 'cope' && type === 'mitre' && partner?.equalFronts
        && records.get(partner.other)?.old === 'cope'
        && result.ends.get(partner.other)?.type === 'mitre';
      const blockedProjection = record.old === 'return' && type === 'die-in'
        && record.projection && record.front <= record.projection.depth
        && record.rule?.against?.kind === 'solid' && record.rule.against.id === record.projection.id;
      const waterfall = record.old === 'return' && type === 'waterfall' && record.waterfall;
      const allowed = record.old === 'mitre' ? type === 'mitre' : record.corner || record.old === 'miter'
        ? ['turn', 'joined', 'square', 'return', 'die-in'].includes(type)
        : record.old === 'square' ? ['joined', 'die-in', 'square', 'waterfall'].includes(type)
          : record.old === 'return' ? type === 'return' || blockedProjection || waterfall
            : record.old === 'cope' && (type === 'cope' || classA);
      if (!allowed) failures.push(`${record.label}: ${pair}`);
      if (blockedProjection) classB.push({ end: record.label, front: record.front, depth: record.projection.depth });
      if (waterfall) classW.push(record.label);
      if (record.projection && record.front > record.projection.depth) {
        expect(record.rule, record.label).toMatchObject({
          type: 'return', returnLength: record.front - record.projection.depth,
        });
      }
      if (record.kind === 'toeKick' && record.wallPanel && !record.waterfall && !record.corner) {
        expect(record.rule, record.label).toMatchObject({
          type: 'die-in', against: { kind: 'panel', id: wallEndPanelPartKey(record.wallId, record.wallPanel.endpoint) },
        });
      }
    }
    if (process.env.PERF) {
      const classA = joints.filter(({ ends, equalFronts }) => equalFronts
        && ends.every((end) => records.get(end).old === 'cope' && !records.get(end).corner))
        .map(({ ends, kind, z }) => ({ kind, z,
          walls: ends.map((end) => {
            const { wall, face, side, angle } = records.get(end);
            return { wall, face, side, angle };
          }),
        }));
      console.log('D1 parity:', JSON.stringify({ room: roomKey, counts, classA, classB, classW, failures }));
      if (roomKey === 'N1') {
        bandPaths(room, settings);
        const start = performance.now();
        bandPaths(room, settings);
        console.log('D1 N1 warm bandPaths (ms):', performance.now() - start);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  },
);
