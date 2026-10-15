import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bandOutline, endEdgeX, frontContour, placeAtEnd } from '../bandEnds.js';
import { bandParts } from '../bandParts.js';
import { cornerBandEdge, lazyCornerShapes } from '../cornerBands.js';
import { toDrawingPayload } from '../drawingPayload.js';
import { resolveWall, syncRoom } from '../room.js';
import { runBands } from '../runBands.js';
import { runScene } from '../runScene.js';
import { sectionProfileOutline, transformOutline } from '../sectionProfileOutline.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const document = normalizeElevationDocument(load('golden'));
const tm3 = load('sectionProfiles').profiles.find(({ id }) => id === 'tm3');
const cove35 = {
  id: 'cove35', name: 'Cove 3 1/2', kind: 'crown',
  geometry: {
    units: 'in',
    points: { a: [0, 0], b: [3, 0], c: [3, -0.5], d: [0.5, -3], e: [0.5, -3.5], f: [0, -3.5] },
    loops: [{ closed: true, segs: [
      { type: 'line', from: 'a', to: 'b' }, { type: 'line', from: 'b', to: 'c' },
      { type: 'arc', from: 'c', to: 'd', center: [3, -3], ccw: true },
      { type: 'line', from: 'd', to: 'e' }, { type: 'line', from: 'e', to: 'f' },
      { type: 'line', from: 'f', to: 'a' },
    ] }],
  },
  drawnPoints: { elevation: ['c', 'd'] },
};
const settings = { ...document.settings, sectionProfiles: [tm3, cove35] };
const picks = { topMoldProfileId: 'tm3', crownProfileId: 'cove35' };
const upper = document.rooms[0].walls[0].runs.find(({ id }) => id.startsWith('434f1164'));
const CROWN = [[29.25, 92.5, 0], [66.75, 92.5, 0], [66.75, 93, -0.414214], [69.25, 95.5, 0],
  [69.25, 96, 0], [26.75, 96, 0], [26.75, 95.5, -0.414214], [29.25, 93, 0]];
const TOP = [[29.75, 90, 0], [66.25, 90, 0], [66.25, 90.75, 0], [66.125, 90.75, 0],
  [66.125, 93, 0], [29.875, 93, 0], [29.875, 90.75, 0], [29.75, 90.75, 0]];
const line = (x1, x2, z) => ({ x1, z1: z, x2, z2: z });

function setup({ profile = picks, runs = [{}], corner = false, neighborProfile = {}, endPanels } = {}, using = settings) {
  const stored = structuredClone(document.rooms[0]);
  stored.profile = { ...stored.profile, ...profile };
  const wall = { ...stored.walls[1], x1: 0, y1: 0, x2: 120, y2: 0,
    connections: { start: null, end: null }, openings: [], joints: [],
    endPanels: endPanels ?? { start: null, end: null },
    runs: runs.map((props, i) => ({ ...structuredClone(upper), id: `upper-${i}`, x: 30, width: 36,
      depth: 12, anchors: {}, ends: {}, ...props })),
  };
  stored.walls = [wall];
  if (corner) {
    const right = corner === 'right';
    const neighbor = { ...document.rooms[0].walls[0],
      ...(right ? { x1: 120, y1: 0, x2: 120, y2: 120 } : { x1: 0, y1: 120, x2: 0, y2: 0 }),
      connections: right ? { start: { wallId: wall.id, endpoint: 'end' }, end: null }
        : { start: null, end: { wallId: wall.id, endpoint: 'start' } }, openings: [], joints: [],
      profile: neighborProfile,
      runs: [{ ...structuredClone(upper), id: 'neighbor', x: right ? 0 : 84, width: 36, depth: 12,
        anchors: right ? { left: true } : { right: true }, ends: {} }],
    };
    wall.connections[right ? 'end' : 'start'] = { wallId: neighbor.id, endpoint: right ? 'start' : 'end' };
    wall.runs[0].anchors[right ? 'right' : 'left'] = true;
    stored.walls.push(neighbor);
  }
  const room = syncRoom(stored, using);
  // Test the specified x=30 band end; syncing an anchor normally moves the run to the corner.
  if (corner) room.walls[0].runs[0].x = runs[0].x ?? 30;
  const view = resolveWall(room, room.walls[0]);
  const bandsOf = (run, scene = runScene(room, view, run, using)) => runBands(room, view, run, using, scene);
  return { room, wall: view, bands: view.runs.map((run) => bandsOf(run)), bandsOf };
}

describe('SPEC-50.3 step 476 profiled band ends', () => {
  it('returns a cove at both free ends, preserving arcs and stopping lines on its contour (anchor 1)', () => {
    const { bands: [{ crown }] } = setup();
    expect(crown).toEqual({ x: 26.75, z: 92.5, width: 42.5, height: 3.5,
      ends: [expect.objectContaining({ type: 'return' }), expect.objectContaining({ type: 'return' })], outline: CROWN,
      lines: [line(26.75, 69.25, 95.5), line(29.25, 66.75, 93)] });
  });

  it('returns a top mold along its stepped front and sends both band outlines in the payload (anchor 2)', () => {
    const { room, bands: [{ topMold, crown }] } = setup();
    expect(topMold).toEqual({ x: 29.75, z: 90, width: 36.5, height: 3,
      ends: [expect.objectContaining({ type: 'return' }), expect.objectContaining({ type: 'return' })], outline: TOP,
      lines: [line(29.75, 66.25, 90.75)] });
    const parts = bandParts(room, room.walls[0], 'front', settings);
    expect(parts.map(({ outline }) => outline)).toEqual([TOP, CROWN]);
    const payload = toDrawingPayload(room, settings);
    for (const part of parts) expect(payload.elevations[0].parts).toContainEqual(part);
    expect(parts.map(({ lines }) => lines)).toEqual([topMold.lines, crown.lines]);
  });

  it('returns the deeper run and copes the shallower onto that same contour (anchor 3)', () => {
    const { bands: [deeper, shallow] } = setup({ runs: [{ depth: 15 }, { x: 66 }] });
    expect(deeper.crown.outline).toEqual(CROWN);
    expect(shallow.crown.outline).toEqual([[66.75, 92.5, 0], [102.75, 92.5, 0], [102.75, 93, -0.414214],
      [105.25, 95.5, 0], [105.25, 96, 0], [69.25, 96, 0], [69.25, 95.5, 0.414214], [66.75, 93, 0]]);
    expect(shallow.crown.lines).toEqual([line(69.25, 105.25, 95.5), line(66.75, 102.75, 93)]);
    const mirrored = setup({ runs: [{}, { x: 66, depth: 15 }] }).bands[0].crown;
    expect(mirrored.outline.slice(1, 5)).toEqual([[65.25, 92.5, 0], [65.25, 93, 0.414214], [62.75, 95.5, 0], [62.75, 96, 0]]);
    expect(mirrored.lines).toEqual([line(26.75, 62.75, 95.5), line(29.25, 65.25, 93)]);
  });

  it('copes on the actual inside corner return, measured from the corner at zero (anchor 4)', () => {
    const { room, wall, bands: [{ crown }] } = setup({ corner: true });
    expect(crown.outline).toEqual([[13.625, 92.5, 0], ...CROWN.slice(1, 5),
      [16.125, 96, 0], [16.125, 95.5, 0.414214], [13.625, 93, 0]]);
    expect(crown.lines).toEqual([line(16.125, 69.25, 95.5), line(13.625, 66.75, 93)]);
    const end = cornerBandEdge(lazyCornerShapes(room, wall, settings), wall.runs[0], 'left', 'crown', 92.5);
    expect(end).toMatchObject({ type: 'cope', x: 16.125 });
    expect(end.outline).toEqual([[13.125, 96, 0], [16.125, 96, 0], [16.125, 95.5, 0.414214],
      [13.625, 93, 0], [13.625, 92.5, 0], [13.125, 92.5, 0]]);
  });

  it('keeps every unpicked band and line equal to the existing rectangles (anchor 5)', () => {
    const { bands: [bands] } = setup({ profile: { topMoldProfileId: null, crownProfileId: null } });
    expect(bands).toEqual({ top: { kind: 'crown', height: 6 }, toeKicks: [], furnitureBases: [], countertop: null,
      topMold: { x: 29.75, z: 90, width: 36.5, height: 3, lines: [],
        ends: [expect.objectContaining({ type: 'return' }), expect.objectContaining({ type: 'return' })] },
      crown: { x: 27, z: 91.5, width: 42, height: 4.5, lines: [],
        ends: [expect.objectContaining({ type: 'return' }), expect.objectContaining({ type: 'return' })] }, bottomParts: [], chipLines: [] });
  });

  it('keeps an anchored wall end square at its current x (anchor 6), including two square ends', () => {
    const { wall, bandsOf } = setup();
    const run = wall.runs[0];
    const crown = bandsOf({ ...run, anchors: { right: true } }).crown;
    expect(crown.outline).toEqual([CROWN[0], [66, 92.5, 0], [66, 96, 0], ...CROWN.slice(5)]);
    expect(crown.lines).toEqual([line(26.75, 66, 95.5), line(29.25, 66, 93)]);
    expect(bandsOf({ ...run, anchors: { left: true, right: true } }).crown.outline)
      .toEqual([[30, 92.5, 0], [66, 92.5, 0], [66, 96, 0], [30, 96, 0]]);
  });

  it('uses the other corner profile, with a square fallback when that band is unpicked', () => {
    const otherCove = structuredClone(cove35);
    otherCove.id = 'other-cove';
    for (const id of ['b', 'c', 'd', 'e']) otherCove.geometry.points[id][0] += 1;
    otherCove.geometry.loops[0].segs[2].center[0] += 1;
    const using = { ...settings, sectionProfiles: [...settings.sectionProfiles, otherCove] };
    const picked = setup({ corner: true, neighborProfile: { crownProfileId: otherCove.id } }, using).bands[0].crown;
    expect(picked.outline[0]).toEqual([14.625, 92.5, 0]);
    expect(picked.outline.slice(-3)).toEqual([[17.125, 96, 0], [17.125, 95.5, 0.414214], [14.625, 93, 0]]);
    const { bands: [{ crown }] } = setup({ corner: true, neighborProfile: { crownProfileId: null, crownHeight: 3.5 } });
    expect(crown.outline).toEqual([[15.875, 92.5, 0], ...CROWN.slice(1, 5), [15.875, 96, 0]]);
    const other = setup({ corner: true, neighborProfile: { topMoldProfileId: null } }).bands[0].topMold;
    expect(other.outline.slice(0, 2)).toEqual([[13.125, 90, 0], TOP[1]]);
    expect(other.outline.at(-1)).toEqual([13.125, 93, 0]);
  });

  it('mirrors the right corner return and preserves the cope arc direction', () => {
    const crown = setup({ corner: 'right' }).bands[0].crown;
    expect(crown.outline).toEqual([CROWN[0], [106.375, 92.5, 0], [106.375, 93, 0.414214],
      [103.875, 95.5, 0], [103.875, 96, 0], ...CROWN.slice(5)]);
    expect(crown.lines).toEqual([line(26.75, 103.875, 95.5), line(29.25, 106.375, 93)]);
  });

  it('keeps equal-depth and taller joints, recess sides and blind panels square; returns over a wall end panel', () => {
    expect(setup({ runs: [{}, { x: 66 }] }).bands[0].crown.outline.slice(1, 3))
      .toEqual([[66, 92.5, 0], [66, 96, 0]]);
    expect(setup({ runs: [{}, { x: 66, depth: 10, heightMode: 'manual', z: 54, height: 40 }] }).bands[0].crown.outline.slice(1, 3))
      .toEqual([[66, 92.5, 0], [66, 96, 0]]);
    const { wall, bandsOf } = setup();
    const run = wall.runs[0];
    expect(bandsOf({ ...run, _plane: { recessId: 'recess' }, anchors: { right: { to: 'recess', recessId: 'recess' } } }).crown.outline.slice(1, 3))
      .toEqual([[66, 92.5, 0], [66, 96, 0]]);
    const scene = runScene({}, wall, run, settings);
    scene.panelBySide.right = { x: 66, width: 54 };
    expect(bandsOf(run, scene).crown.outline.slice(1, 3)).toEqual([[120, 92.5, 0], [120, 96, 0]]);
    const paneled = setup({ endPanels: { start: null, end: { width: 0.75 } } });
    expect(paneled.bandsOf({ ...paneled.wall.runs[0], anchors: { right: true } }).crown.outline.slice(1, 5))
      .toEqual([[120.75, 92.5, 0], [120.75, 93, -0.414214], [123.25, 95.5, 0], [123.25, 96, 0]]);
  });
});

describe('band end contour helpers', () => {
  it('chooses front chains in either facing and loop direction, moving reversed arc bulges', () => {
    const loop = sectionProfileOutline(cove35.geometry);
    const front = [[0.5, -3.5, 0], [0.5, -3, -0.414214], [3, -0.5, 0], [3, 0, 0]];
    expect(frontContour(loop, 1)).toEqual(front);
    const reversed = loop.toReversed().map(([x, z], i) => [x, z, -loop[(loop.length - 2 - i + loop.length) % loop.length][2] || 0]);
    expect(frontContour(reversed, 1)).toEqual(front);
    expect(frontContour(transformOutline(loop, ([x, z]) => [-x, z], true), -1))
      .toEqual(front.map(([x, z, b]) => [-x, z, -b || 0]));
    expect(placeAtEnd(loop, 30, 0.25, 96, -1)).toEqual(transformOutline(loop, ([x, z]) => [29.75 - x, z + 96], true));
  });

  it('stops drawn lines at exact arc intersections and the outward side of horizontal steps', () => {
    const edge = frontContour(sectionProfileOutline(cove35.geometry), 1);
    expect(endEdgeX(edge, -2, 1)).toBeCloseTo(3 - Math.sqrt(2.5 ** 2 - 1), 5);
    const stepped = frontContour(sectionProfileOutline(tm3.geometry), 1);
    expect(endEdgeX(stepped, 0.75, 1)).toBe(0);
    expect(endEdgeX(stepped, 2, 1)).toBe(-0.125);
    expect(bandOutline([[1, 1, 0], [2, 2, 0]], [[8, 0, 0], [9, 3, 0]], 0, 3))
      .toEqual([[1, 0, 0], [8, 0, 0], [9, 3, 0], [2, 3, 0], [2, 2, 0], [1, 1, 0]]);
  });

  it('finds extrema inside an arc while preserving the two curved pieces', () => {
    const contour = frontContour([[-1, 0, -1], [1, 0, -1]], 1);
    expect(contour[0][1]).toBeCloseTo(-1, 10);
    expect(contour.at(-1)[1]).toBeCloseTo(1, 10);
    expect(contour.map(([, , b]) => b)).toEqual([0.414214, 0.414214, 0]);
  });
});
