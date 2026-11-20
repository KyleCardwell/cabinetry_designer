import { describe, expect, it } from 'vitest';
import { bandPaths } from '../bandPaths.js';
import { CABINET_TYPE_IDS } from '../constants.js';
import { elevationToPlan } from '../geometry.js';
import { runBands } from '../runBands.js';
import { runScene } from '../runScene.js';
import { syncRoom } from '../roomSync.js';
import { wallNumbers } from '../topology.js';
import { WALL_SIDES, wallSideFrame, wallSideView } from '../wallSides.js';
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
      representedEnds += (path.start ? 1 : 0) + (path.end ? 1 : 0) + path.vertices.length * 2;
      for (const segment of path.segments) for (const side of ['left', 'right']) {
        const endKey = `${segment.runId}|${path.kind}|${path.z}|${side}`;
        actual.push(endKey);
        expect(result.ends.get(endKey)?.pathId).toBe(path.id);
      }
    }
    expect(actual.sort()).toEqual(expected.sort());
    expect(new Set(actual).size).toBe(actual.length);
    expect([...result.ends.keys()].sort()).toEqual(expected);
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

  it('leaves active corner cabinet ends as corner placeholders (D1)', () => {
    for (const [run, side, cornerKind] of [[uppers[3], 'right', 45], [base(7), 'left', 90]]) {
      expect(run.ends[side].corner.kind).toBe(cornerKind);
      const paths = result.paths.filter((path) => path.segments.some(({ runId }) => runId === run.id));
      expect(paths.length).toBeGreaterThan(0);
      for (const path of paths) expect(result.ends.get(key(run, path.kind, path.z, side)).type).toBe('corner');
    }
  });
});
