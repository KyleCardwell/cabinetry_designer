import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { verticalChains } from '../dimensions.js';
import { runFaceLayouts } from '../faceLayouts.js';
import { partNumbers } from '../partNumbers.js';
import { resolveProfile } from '../profile.js';
import { resolveWall, syncRoom } from '../room.js';
import { cabinetReveals } from '../styles.js';
import { runTop } from '../tops.js';

const S = DEFAULT_SETTINGS;
const { BASE, UPPER, TALL } = CABINET_TYPE_IDS;
const EURO = { cabinetStyleId: 13, beadWidth: 0.25, profiledEdge: false };
const DOOR = { type: 'door', size: null };

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

/** One 120" × 96" wall, default profile. */
function makeRoom(runs) {
  return syncRoom({
    id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: ['A'],
    walls: [{
      id: 'A', name: '', numberOverride: null, x1: 0, y1: 0, x2: 120, y2: 0,
      height: 96, thickness: 4.5, flipped: false,
      connections: { start: null, end: null }, profile: {}, openings: [], runs,
    }],
  }, S);
}

function topsOf(room) {
  const wall = room.walls[0];
  const profile = resolveProfile(S, room, wall);
  return Object.fromEntries(wall.runs.map((run) => [run.id, runTop(wall, run, profile)]));
}

describe('SPEC-35 run tops', () => {
  it('defaults to today: stone on a base, crown on an auto upper, none on a manual tall or under a run', () => {
    const tops = topsOf(makeRoom([
      makeRun('B', BASE),
      makeRun('U', UPPER),
      makeRun('T', TALL, { x: 70, width: 24, heightMode: 'manual', z: 4, height: 80 }),
      makeRun('C', BASE, { x: 96, width: 24, overrides: { countertopThickness: 3 } }),
      makeRun('M', UPPER, {
        heightMode: 'manual', z: 40, height: 10,
        stack: { below: null, above: { runId: 'U', offset: 0 } },
      }),
    ]));
    expect(tops.B).toEqual({ kind: 'stone', height: 1.5 });
    expect(tops.U).toEqual({ kind: 'crown', height: 6 });
    expect(tops.T).toEqual({ kind: 'none', height: 0 });
    expect(tops.C).toEqual({ kind: 'stone', height: 3 });
    expect(tops.M).toEqual({ kind: 'none', height: 0 });
  });

  it('takes any top on any type', () => {
    const tops = topsOf(makeRoom([
      makeRun('B', BASE, { top: 'crown' }),
      makeRun('U', UPPER, { top: 'wood' }),
      makeRun('T', TALL, { x: 70, width: 24, top: 'topMold' }),
      makeRun('N', UPPER, { x: 96, width: 24, top: 'none' }),
    ]));
    expect(tops.B).toEqual({ kind: 'crown', height: 6 });
    expect(tops.U).toEqual({ kind: 'wood', height: 1.5 });
    expect(tops.T).toEqual({ kind: 'topMold', height: 3 });
    expect(tops.N).toEqual({ kind: 'none', height: 0 });
  });

  it('REV-002 follows a wood top on any type, at the run top only', () => {
    const tall = cabinetReveals({ style: EURO, cabinetTypeId: TALL, run: { top: 'wood' }, face: DOOR, settings: S });
    expect(tall.sources.top).toBe('rule:wood-top');
    const inner = cabinetReveals({
      style: EURO, cabinetTypeId: BASE, run: { top: 'wood' }, face: DOOR,
      runEdges: { top: false, bottom: true }, settings: S,
    });
    expect(inner.values.top).toBe(0.25);
    expect(inner.sources.top).toBe('style');
  });

  it('gives the top cell of a split run the wood top reveal', () => {
    const run = {
      id: 'run-2', cabinetTypeId: BASE, top: 'wood', x: 24, width: 19.5, z: 4, height: 60, depth: 24,
      ends: { left: { type: 'end_panel', width: null }, right: { type: 'end_panel', width: null } },
      autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
      anchors: { left: false, right: false },
      grid: {
        id: 'run-2:grid', cols: [{ id: 's:col', size: 18, sizeMode: 'manual' }],
        rows: [{ id: 'run-2:row', size: null, sizeMode: 'auto' }],
        cells: [{ col: 0, row: 0, colSpan: 1, rowSpan: 1, node: {
          id: 's', cols: [{ id: 's:c', size: null, sizeMode: 'auto' }],
          rows: [{ id: 's:r0', size: null, sizeMode: 'auto' }, { id: 's:r1', size: 30, sizeMode: 'manual' }],
          cells: [
            { col: 0, row: 0, colSpan: 1, rowSpan: 1, node: { id: 't', kind: 'cabinet' } },
            { col: 0, row: 1, colSpan: 1, rowSpan: 1, node: { id: 'b', kind: 'cabinet' } },
          ],
        } }],
      },
    };
    const room = {
      id: 'room-1', name: 'Room 1', profile: { ...S.defaultProfile }, wallOrder: ['wall-1'],
      walls: [{
        id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
        flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
      }],
    };
    const layouts = runFaceLayouts(room, resolveWall(room, room.walls[0]), run, S);
    expect(layouts.get('t').reveals.sources.top).toBe('rule:wood-top');
    expect(layouts.get('t').reveals.values.top).toBe(0.125);
    expect(layouts.get('b').reveals.sources.top).toBe('rule:stacked-seam');
  });
});

describe('SPEC-35 tops in chains and part numbers', () => {
  const kindsAndLengths = (chain) => chain.inner.map(({ kind, start, end }) => [kind, end - start]);

  it('chains the top each run carries', () => {
    const plain = makeRoom([makeRun('B', BASE), makeRun('U', UPPER, { top: 'none' })]);
    const wall = plain.walls[0];
    expect(kindsAndLengths(verticalChains(plain, wall, { lowerRun: wall.runs[0], upperRun: wall.runs[1] }, S)))
      .toEqual([['toe-kick', 4], ['box', 30.5], ['countertop', 1.5], ['clearance', 18], ['box', 36], ['open', 6]]);

    const tall = makeRoom([makeRun('T', TALL, { heightMode: 'manual', z: 4, height: 80, top: 'crown' })]);
    const tallWall = tall.walls[0];
    expect(kindsAndLengths(verticalChains(tall, tallWall, { lowerRun: tallWall.runs[0], upperRun: null }, S)))
      .toEqual([['toe-kick', 4], ['box', 80], ['molding', 6], ['open', 6]]);
  });

  it('numbers the moldings a top brings', () => {
    const moldings = (room) => partNumbers(room, S).parts
      .filter((part) => part.kind === 'molding')
      .map((part) => part.molding);
    expect(moldings(makeRoom([makeRun('B', BASE)]))).toEqual(['toeKick']);
    expect(moldings(makeRoom([makeRun('B', BASE, { top: 'crown' })]))).toEqual(['toeKick', 'topMold', 'crown']);
    expect(moldings(makeRoom([makeRun('B', BASE), makeRun('U', UPPER, { top: 'none' })]))).toEqual(['toeKick']);
  });
});
