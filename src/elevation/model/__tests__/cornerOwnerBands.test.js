import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { bandFronts } from '../bandParts.js';
import { frontContour, placeAtEnd } from '../bandEnds.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { cornerBandEdge, cornerBandTurns, ownerBandTurnLines } from '../cornerBands.js';
import { cornerEnd, normalizeCornerEnd } from '../cornerEnd.js';
import { cornerShapes } from '../cornerParts.js';
import { moldingPast, moldingProfiles } from '../moldingProfiles.js';
import { resolveProfile } from '../profile.js';
import { resolveWall, syncRoom } from '../room.js';
import { runBandEnds, runBands } from '../runBands.js';
import { runScene } from '../runScene.js';
import { flattenOutline, sectionProfileOutline } from '../sectionProfileOutline.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const S = { ...DEFAULT_SETTINGS, runFlex: 0 };
let owner, ownerWall, returnWall, subject;

beforeEach(() => {
  owner = run({ autoCount: false, items: [fixed('cc', 36), auto('a')],
    anchors: { left: true, right: false },
    ends: { left: normalizeCornerEnd({ corner: { kind: 90 } }), right: { type: 'none' } },
  });
  ownerWall = wall({ runs: [owner],
    connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null },
  });
  returnWall = wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0, runs: [],
    connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } },
  });
  subject = room({ walls: [ownerWall, returnWall] });
});

function resolved(settings = S) {
  const synced = syncRoom(subject, settings);
  const view = resolveWall(synced, synced.walls[0], 'front');
  const run = view.runs[0];
  const scene = runScene(synced, view, run, settings);
  return { synced, view, run, scene, bands: runBands(synced, view, run, settings, scene),
    shapes: cornerShapes(synced, view, 'front', settings) };
}

function span(band, start, end) {
  expect(band.x).toBeCloseTo(start, 4);
  expect(band.x + band.width).toBeCloseTo(end, 4);
}

function verticalTurn(band, x) {
  expect(band.lines).toHaveLength(1);
  expect(band.lines[0].x1).toBeCloseTo(x, 3);
  expect(band.lines[0].x2).toBeCloseTo(x, 3);
  expect(band.lines[0]).toMatchObject({ z1: band.z, z2: band.z + band.height });
}

describe('CC7 step c owner bands meet the return leg', () => {
  it.each([false, true])('anchors 1 / 3: copes the E90 owner with a joining run = %s', (joins) => {
    if (joins) returnWall.runs = [run({ id: 'run-2', x: 0, width: 96,
      anchors: { left: false, right: true }, items: [auto('r')],
      ends: { left: { type: 'none' }, right: { type: 'none' } },
    })];
    const { synced, view, run: ownerRun, scene, bands, shapes } = resolved();
    span(bands.countertop, 25.625, 120.75);
    span(bands.toeKicks[0], 21, 119.75);
    expect(bands.countertop.lines).toBeUndefined();
    const end = runBandEnds(synced, view, ownerRun, S, scene, 'countertop', 34.5, 1.5)[0];
    expect(end).toMatchObject({ type: 'cope', x: 25.625, wallId: 'wall-2', runId: 'run-1' });
    // A tied return section must lose even if it appears before the owner's leg.
    expect(cornerBandEdge(() => [...shapes].reverse(), ownerRun, 'left', 'countertop', 34.5, 1.5))
      .toMatchObject({ runId: 'run-1', x: 25.625 });
  });

  it('anchor 2: adds only nonopaque leg bands in the owner frame, with their far depths', () => {
    const { shapes } = resolved();
    expect(shapes).toHaveLength(1);
    expect(shapes[0]).toMatchObject({ key: 'left:corner:run-1', kind: 'return',
      wallId: 'wall-2', runId: 'run-1', cornerOf: { wallId: 'wall-1', runId: 'run-1', side: 'left' } });
    expect(shapes[0].parts).toHaveLength(2);
    expect(shapes[0].parts.find(({ kind }) => kind === 'countertop')).toEqual({
      id: 'left:corner:run-1:countertop', kind: 'countertop', runId: 'run-1',
      x: 0, width: 25.625, z: 34.5, height: 1.5, back: 0, front: 37.5625,
      coversBoxEdges: false, opaque: false,
    });
    expect(shapes[0].parts.find(({ kind }) => kind === 'toe_kick')).toMatchObject({
      x: 0, width: 21, back: 0, front: 35.8125, opaque: false,
    });
  });

  it('anchor 4: draws the E45 owner turn lines inside the coped bands', () => {
    owner.ends.left.corner.kind = 45;
    const { bands } = resolved();
    span(bands.countertop, 25.625, 120.75);
    span(bands.toeKicks[0], 21, 119.75);
    verticalTurn(bands.countertop, 36.3732);
    verticalTurn(bands.toeKicks[0], 34.0074);
  });

  it('anchor 5: uses the unequal-depth E45u owner fronts and independent miters', () => {
    Object.assign(owner.ends.left.corner, { kind: 45, depthB: 15 });
    const { bands } = resolved();
    span(bands.countertop, 16.625, 120.75);
    span(bands.toeKicks[0], 12, 119.75);
    verticalTurn(bands.countertop, 36.2069);
    verticalTurn(bands.toeKicks[0], 34.4726);
  });

  it('anchor 6: mirrors right-hand leg bands and 45 owner turn lines', () => {
    owner.x = 24;
    owner.grid = run({ items: [auto('a'), fixed('cc', 36)] }).grid;
    owner.anchors = { left: false, right: true };
    owner.ends = { left: { type: 'none' }, right: normalizeCornerEnd({ corner: { kind: 90 } }) };
    ownerWall.connections = { start: null, end: { wallId: 'wall-2', endpoint: 'start' } };
    Object.assign(returnWall, { x1: 144, y1: 0, x2: 144, y2: 144,
      connections: { start: { wallId: 'wall-1', endpoint: 'end' }, end: null } });
    let result = resolved();
    span(result.bands.countertop, 23.25, 118.375);
    span(result.shapes[0].parts.find(({ kind }) => kind === 'countertop'), 118.375, 144);
    expect(result.shapes[0]).toMatchObject({ key: 'right:corner:run-1', cornerOf: { side: 'right' } });
    owner.ends.right.corner.kind = 45;
    result = resolved();
    verticalTurn(result.bands.countertop, 144 - 36.3732);
    verticalTurn(result.bands.toeKicks[0], 144 - 34.0074);
  });

  it('anchor 8: squashes every point of the picked crown contour, retaining its vertical endpoints', () => {
    const document = normalizeElevationDocument(
      JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
    );
    const settings = { ...document.settings, runFlex: 0 };
    subject.profile = structuredClone(document.rooms[0].profile);
    Object.assign(owner, { cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 30, depth: 12, top: 'crown',
      grid: run({ items: [fixed('cc', 24), auto('a')] }).grid });
    Object.assign(owner.ends.left.corner, { kind: 45, legB: 24 });
    const { synced, view, run: ownerRun, bands } = resolved(settings);
    const corner = cornerEnd(synced, view, ownerRun, 'left', settings);
    const moldings = moldingProfiles(resolveProfile(settings, synced, view), settings, ownerRun);
    expect(moldings.crown).toBeTruthy();
    const front = bandFronts(synced, view, ownerRun, settings).crown;
    const contour = frontContour(placeAtEnd(sectionProfileOutline(moldings.crown.geometry),
      front - moldingPast(moldings, 'crown', settings), moldings.overhang,
      ownerRun.z + ownerRun.height + resolveProfile(settings, synced, view).crownStackHeight));
    const points = flattenOutline(contour);
    const turn = cornerBandTurns(corner, 'crown', front).a[0];
    const lines = bands.crown.lines.filter(({ z1, z2 }) => z1 !== z2);
    expect(lines).toHaveLength(points.length - 1);
    for (const [i, line] of lines.entries()) {
      expect(line.x1).toBeCloseTo(turn + (points[i][0] - front) * 0.41421356237, 3);
      expect(line.x2).toBeCloseTo(turn + (points[i + 1][0] - front) * 0.41421356237, 3);
      expect(line.z1).toBeCloseTo(points[i][1], 3);
      expect(line.z2).toBeCloseTo(points[i + 1][1], 3);
    }
    expect(lines[0].z1).toBeCloseTo(contour[0][1], 3);
    expect(lines.at(-1).z2).toBeCloseTo(contour.at(-1)[1], 3);
  });

  it('omits inactive and opposite-face legs and turn lines at a band end', () => {
    owner.ends.left.corner.kind = 45;
    const { synced, view, run: ownerRun } = resolved();
    expect(cornerShapes(synced, synced.walls[0], 'back', S)).toEqual([]);
    const corner = cornerEnd(synced, view, ownerRun, 'left', S);
    const source = { kind: 'countertop', front: 25.625, z: 34.5, height: 1.5 };
    const turn = cornerBandTurns(corner, source.kind, source.front).a[0];
    expect(ownerBandTurnLines(corner, source, { x: turn, width: 20 })).toEqual([]);
    expect(ownerBandTurnLines(corner, source, { x: turn - 20, width: 20 })).toEqual([]);
    owner.anchors.left = false;
    const inactive = resolved();
    expect(inactive.shapes).toEqual([]);
    expect(inactive.bands.countertop.lines).toBeUndefined();
  });
});
