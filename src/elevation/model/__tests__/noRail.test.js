import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import {
  frameMembers, frameRegions, frameVerticalChains, groupMembers, regionOpenings,
} from '../frames.js';
import { gridFromItems } from '../grid.js';
import { resolveWall } from '../room.js';

const S = DEFAULT_SETTINGS;
const NONE = { type: 'none', width: null };
const drawer = { type: 'drawer_front', size: null };
/** A stack of `count` drawer fronts; `seams` are the ones with no rail between them (seam i: fronts i and i + 1). */
const stack = (seams = [], count = 3) => ({
  direction: 'vertical',
  size: null,
  children: Array.from({ length: count }, () => drawer),
  ...(seams.length ? { noRail: seams } : {}),
});
const round = (value) => Math.round(value * 100000) / 100000;
const shown = (faces) => faces.map(({
  path, opening, x, z, width, height,
}) => [path, opening, round(x), round(z), round(width), round(height)]);
const counts = (region, openings) => {
  const total = { stile: 0, rail: 0 };
  for (const { kind, count } of groupMembers(frameMembers(region, openings))) total[kind] += count;
  return [['stile', total.stile], ['rail', total.rail]];
};

/** SPEC-36.3 BW: a base at x 24, 48 wide, z 4, 30.5 tall, two auto cabinets; `a` carries the face. */
function layouts(style, face) {
  const run = {
    id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 24, width: 48, z: 4, height: 30.5, depth: 24,
    ends: { left: NONE, right: NONE }, autoCount: false, maxCabinetWidth: null,
    heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
    grid: gridFromItems('r', [{ id: 'a', kind: 'cabinet', width: null, face }, { id: 'b', kind: 'cabinet', width: null }]),
  };
  const wall = {
    id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
  };
  const room = {
    id: 'room-1', name: 'Room 1', profile: { ...S.defaultProfile }, walls: [wall], wallOrder: ['wall-1'],
    ...(style ? { style } : {}),
  };
  const resolved = resolveWall(room, room.walls[0]);
  const layout = layoutRun(room, resolved, run, S);
  const frames = frameRegions(room, run, cellPieces(run, layout), S);
  const faceLayouts = runFaceLayouts(room, resolved, run, S, layout);
  const region = frames.regions[0] ?? null;
  return {
    region,
    faces: faceLayouts.get('a').faces,
    openings: region ? regionOpenings(region, faceLayouts) : faceLayouts.get('a').openings,
  };
}

const INSET = { cabinetStyleId: 14 };

describe('SPEC-36.3 no rail between', () => {
  it('shares one opening across every seam of a square inset stack, with no gap', () => {
    expect(shown(layouts(INSET, stack()).faces)).toEqual([
      ['r.0', undefined, 24.75, 24.83333, 22.5, 8.16667],
      ['r.1', undefined, 24.75, 15.16667, 22.5, 8.16667],
      ['r.2', undefined, 24.75, 5.5, 22.5, 8.16667],
    ]);
    const { faces, openings } = layouts(INSET, stack([0, 1]));
    expect(shown(faces)).toEqual([
      ['r.0', 'r.0', 24.75, 23.83333, 22.5, 9.16667],
      ['r.1', 'r.0', 24.75, 14.66667, 22.5, 9.16667],
      ['r.2', 'r.0', 24.75, 5.5, 22.5, 9.16667],
    ]);
    expect(openings.map(({
      path, x, z, width, height,
    }) => [path, round(x), round(z), round(width), round(height)])).toEqual([
      ['r.0', 24.75, 5.5, 22.5, 27.5],
      ['r', 48.75, 5.5, 22.5, 27.5],
    ]);
  });

  it('fits a profiled opening once and leaves 1/16" between its faces', () => {
    const { faces } = layouts({ cabinetStyleId: 14, profiledEdge: true }, stack([0, 1]));
    expect(shown(faces)).toEqual([
      ['r.0', 'r.0', 24.84375, 23.84375, 22.3125, 9.0625],
      ['r.1', 'r.0', 24.84375, 14.71875, 22.3125, 9.0625],
      ['r.2', 'r.0', 24.84375, 5.59375, 22.3125, 9.0625],
    ]);
  });

  it('can cut any one seam: the bottom two fronts share, the top keeps its rail', () => {
    const { faces, region, openings } = layouts(INSET, stack([1]));
    expect(shown(faces)).toEqual([
      ['r.0', undefined, 24.75, 24.33333, 22.5, 8.66667],
      ['r.1', 'r.1', 24.75, 14.16667, 22.5, 8.66667],
      ['r.2', 'r.1', 24.75, 5.5, 22.5, 8.66667],
    ]);
    // Cabinet a: top, bottom and one rail between the top front and the pair; cabinet b: top and bottom.
    expect(counts(region, openings)).toEqual([['stile', 3], ['rail', 5]]);
    expect(frameVerticalChains(region, openings).map((chain) => chain.tracks.map(({ kind }) => kind))).toEqual([
      ['frame', 'frame-opening', 'frame', 'frame-opening', 'frame'],
      ['frame', 'frame-opening', 'frame'],
    ]);
  });

  it('can make two groups in one stack, each sharing an opening, with a rail between them', () => {
    const { faces, region, openings } = layouts(INSET, stack([0, 2], 4));
    expect(shown(faces)).toEqual([
      ['r.0', 'r.0', 24.75, 26.5, 22.5, 6.5],
      ['r.1', 'r.0', 24.75, 20, 22.5, 6.5],
      ['r.2', 'r.2', 24.75, 12, 22.5, 6.5],
      ['r.3', 'r.2', 24.75, 5.5, 22.5, 6.5],
    ]);
    expect(counts(region, openings)).toEqual([['stile', 3], ['rail', 5]]);
    expect(frameVerticalChains(region, openings).map((chain) => chain.tracks.length)).toEqual([5, 3]);
  });

  it('cuts a mullion between side-by-side doors the same way', () => {
    const door = { type: 'door', size: null };
    const sideBySide = { direction: 'horizontal', size: null, children: [door, door, door], noRail: [0] };
    const { faces, region, openings } = layouts(INSET, sideBySide);
    expect(shown(faces)).toEqual([
      ['r.0', 'r.0', 24.75, 5.5, 7, 27.5],
      ['r.1', 'r.0', 31.75, 5.5, 7, 27.5],
      ['r.2', undefined, 40.25, 5.5, 7, 27.5],
    ]);
    // Cabinet a's second and third doors keep a mullion between them (4 stiles in all); rails follow the openings.
    expect(counts(region, openings)).toEqual([['stile', 4], ['rail', 6]]);
  });

  it('is ignored by a European cabinet', () => {
    const plain = shown(layouts(null, stack()).faces);
    expect(shown(layouts(null, stack([0, 1])).faces)).toEqual(plain);
    expect(plain).toEqual([
      ['r.0', undefined, 24.0625, 24.29167, 23.875, 9.95833],
      ['r.1', undefined, 24.0625, 14.20833, 23.875, 9.95833],
      ['r.2', undefined, 24.0625, 4.125, 23.875, 9.95833],
    ]);
  });
});
