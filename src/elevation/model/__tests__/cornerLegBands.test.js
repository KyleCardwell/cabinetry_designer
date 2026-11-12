import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cove35 } from './fixtures/cove35.js';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { cornerBandTurns } from '../cornerBands.js';
import { cornerEnd, normalizeCornerEnd } from '../cornerEnd.js';
import { cornerLegBands } from '../cornerLegBands.js';
import { cornerReturnLegs } from '../cornerLegs.js';
import { faceDrawing } from '../drawingPayload.js';
import { effectiveSettings } from '../effectiveSettings.js';
import { resolveWall, syncRoom } from '../room.js';
import { runBandEnds, runBands } from '../runBands.js';
import { runScene } from '../runScene.js';

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

describe('profiled return leg bands', () => {
  const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
  const tm3 = load('sectionProfiles').profiles.find(({ id }) => id === 'tm3');
  const source = load('room8cc');
  source.profile = { ...source.profile, topMoldProfileId: 'tm3', crownProfileId: 'cove35' };
  const settings = effectiveSettings({ settings: { ...DEFAULT_SETTINGS, sectionProfiles: [tm3, cove35] } }, source);
  const synced = syncRoom(source, settings);
  const anchorWall = synced.walls.find(({ name }) => name === 'Wall 2');
  const parts = faceDrawing(synced, anchorWall, 'front', settings).parts;
  const leg = (kind) => parts.find(({ id }) => id.startsWith('corner-leg:c8025fb2-')
    && id.includes(':30580003-') && id.endsWith(`:left:${kind}`));
  const carrier = (kind) => parts.find(({ id }) => id.startsWith('40329765-') && id.endsWith(`:${kind}`));
  const edgePoints = (part, expected) => {
    expect(part.outline).toBeDefined();
    for (const [x, z] of expected) {
      expect(part.outline.some(([px, pz]) => Math.abs(px - x) < 1e-3 && Math.abs(pz - z) < 1e-3)).toBe(true);
    }
  };

  it.each([
    ['ends the leg crown on its miter', () => {
      edgePoints(leg('crown'), [[77.0913, 107.75], [77.0913, 108.25], [78.1268, 104.75], [78.1268, 105.25]]);
    }],
    ['mirrors the owner crown contour at the corner', () => {
      edgePoints(leg('crown'), [[86.375, 107.75], [86.375, 108.25], [88.875, 104.75], [88.875, 105.25]]);
    }],
    ['stops leg crown drawn lines on its profile edges', () => {
      expect(leg('crown').lines).toHaveLength(2);
      for (const [z, x1, x2] of [[107.75, 77.0913, 86.375], [105.25, 78.1268, 88.875]]) {
        const line = leg('crown').lines.find(({ z1, z2 }) => z1 === z && z2 === z);
        expect(line.x1).toBeCloseTo(x1, 3);
        expect(line.x2).toBeCloseTo(x2, 3);
      }
    }],
    ['joins the carrier crown on the leg miter', () => {
      edgePoints(carrier('crown'), [[77.0913, 107.75], [77.0913, 108.25], [78.1268, 104.75], [78.1268, 105.25]]);
      expect(carrier('crown').x + carrier('crown').width).toBeCloseTo(78.1268, 3);
      expect(carrier('crown').lines.find(({ z1 }) => z1 === 105.25).x2).toBeCloseTo(78.1268, 3);
    }],
    ['joins both top molds on the stepped miter', () => {
      for (const part of [leg('top_mold'), carrier('top_mold')]) {
        edgePoints(part, [[78.3339, 102], [78.3339, 102.75], [78.3857, 102.75], [78.3857, 105]]);
      }
    }],
  ])('%s (CC7.1)', (_, check) => check());

  it('keeps a joint square when the turn lies inside the leg (CC7.1)', () => {
    owner.ends.left.corner.kind = 45;
    owner.ends.left.corner.legB = 72;
    returnWall.runs = [run({ id: 'run-2', x: 0, width: 96, anchors: { left: false, right: true },
      items: [auto('r')], ends: { left: { type: 'none' }, right: { type: 'none' } } })];
    const { synced, view, top } = resolved();
    const other = view.runs[0];
    expect(runBandEnds(synced, view, other, S, runScene(synced, view, other, S), 'countertop', 34.5, 1.5)[1])
      .toEqual({ type: 'square', x: top.x });
    expect(top.lines).toHaveLength(1);
  });
});

function resolved(settings = S) {
  const synced = syncRoom(subject, settings);
  const view = resolveWall(synced, synced.walls[1], 'front');
  const bands = cornerLegBands(synced, view, settings);
  return { synced, view, bands, top: bands.find(({ kind }) => kind === 'countertop'),
    toe: bands.find(({ kind }) => kind === 'toe_kick') };
}

function span(band, start, end) {
  expect(band.x).toBeCloseTo(start, 4);
  expect(band.x + band.width).toBeCloseTo(end, 4);
}

function verticalTurn(band, x) {
  expect(band.lines).toHaveLength(1);
  expect(band.lines[0].x1).toBeCloseTo(x, 4);
  expect(band.lines[0].x2).toBeCloseTo(x, 4);
  expect(band.lines[0]).toMatchObject({ z1: band.z, z2: band.z + band.height });
}

describe('return leg bands (CC7)', () => {
  it('places the E90 countertop and attaches its bands to the existing leg', () => {
    const { synced, view, bands, top } = resolved();
    span(top, 106.4375, 118.375);
    expect(top).toEqual({ id: 'corner-leg:wall-1:run-1:left:countertop', kind: 'countertop',
      ownerWallId: 'wall-1', runId: 'run-1', side: 'left', x: 106.4375, z: 34.5,
      width: 11.9375, height: 1.5, back: 0, front: 25.625 });
    expect(cornerReturnLegs(synced, view, S)[0].bands).toEqual(bands);
  });

  it('uses the existing end-panel free-end helper for the E90 toe kick', () => {
    const { toe } = resolved();
    // §1.3's helper gives reach 36.8125 minus the 1" end-panel setback: x = 108.1875.
    // The spec explicitly permits reporting this difference from its provisional 108.25 anchor.
    span(toe, 108.1875, 123);
    expect(toe).toMatchObject({ front: 21, z: 0, height: 4 });
    expect(toe.lines).toBeUndefined();
  });

  it('joins the E90R leg bands square to the return run', () => {
    returnWall.runs = [run({ id: 'run-2', x: 0, width: 96, anchors: { left: false, right: true },
      items: [auto('r')], ends: { left: { type: 'none' }, right: { type: 'none' } } })];
    const { top, toe } = resolved();
    span(top, 108, 118.375);
    span(toe, 108, 123);
    expect(top.lines).toBeUndefined();
    expect(toe.lines).toBeUndefined();
  });

  it('stops the E90R return run bands at the leg joint before the corner cope', () => {
    returnWall.runs = [run({ id: 'run-2', x: 0, width: 96, anchors: { left: false, right: true },
      items: [auto('r')], ends: { left: { type: 'none' }, right: { type: 'none' } } })];
    const { synced, view } = resolved();
    const other = view.runs[0];
    const scene = runScene(synced, view, other, S);
    const bands = runBands(synced, view, other, S, scene);
    span(bands.countertop, 11.25, 108);
    span(bands.toeKicks[0], 12.25, 108);
    expect(runBandEnds(synced, view, other, S, scene, 'countertop', 34.5, 1.5)[1])
      .toEqual({ type: 'square', x: 108 });
  });

  it('adds the E45 countertop and toe kick turn lines inside the free leg bands', () => {
    owner.ends.left.corner.kind = 45;
    const { top, toe } = resolved();
    span(top, 106.4375, 118.375);
    span(toe, 108.1875, 123);
    verticalTurn(top, 107.6268);
    verticalTurn(toe, 109.9926);
  });

  it('extends the E45R countertop joint to its turn and omits the end turn line', () => {
    owner.ends.left.corner.kind = 45;
    returnWall.runs = [run({ id: 'run-2', x: 0, width: 96, anchors: { left: false, right: true },
      items: [auto('r')], ends: { left: { type: 'none' }, right: { type: 'none' } } })];
    const { synced, view, top, toe } = resolved();
    span(top, 107.6268, 118.375);
    expect(top.lines).toBeUndefined();
    span(toe, 108, 123);
    verticalTurn(toe, 109.9926);
    const other = view.runs[0];
    const bands = runBands(synced, view, other, S, runScene(synced, view, other, S));
    span(bands.countertop, 11.25, 107.6268);
  });

  it('transfers front depth and computes independent E45u turn lines', () => {
    Object.assign(owner.ends.left.corner, { kind: 45, depthB: 15 });
    const { top, toe } = resolved();
    span(top, 106.4375, 118.375);
    span(toe, 108.1875, 123);
    expect(top.front).toBe(16.625);
    expect(toe.front).toBe(12);
    verticalTurn(top, 107.4962);
    verticalTurn(toe, 110.5152);
  });

  it('dies square into a taller return run while joining its toe kick', () => {
    returnWall.runs = [run({ id: 'run-2', cabinetTypeId: CABINET_TYPE_IDS.TALL, height: 84, top: 'none',
      x: 0, width: 96, anchors: { left: false, right: true }, items: [auto('r')],
      ends: { left: { type: 'none' }, right: { type: 'none' } } })];
    const { top, toe } = resolved();
    span(top, 108, 118.375);
    span(toe, 108, 123);
  });

  it('filters owner, opposite and inactive faces without mutating the room', () => {
    const { synced, view } = resolved();
    const original = structuredClone(synced);
    expect(cornerLegBands(synced, resolveWall(synced, synced.walls[0], 'front'), S)).toEqual([]);
    expect(cornerLegBands(synced, resolveWall(synced, synced.walls[1], 'back'), S)).toEqual([]);
    cornerLegBands(synced, view, S);
    expect(synced).toEqual(original);
    owner.anchors.left = false;
    expect(resolved().bands).toEqual([]);
    owner.anchors.left = true;
    owner.ends.left.corner.legB = 20;
    expect(resolved().bands).toEqual([]);
  });

  it('mirrors a right-hand corner into the positive return direction', () => {
    owner.grid = run({ items: [auto('a'), fixed('cc', 36)] }).grid;
    owner.anchors = { left: false, right: true };
    owner.ends = { left: { type: 'none' }, right: normalizeCornerEnd({ corner: { kind: 45 } }) };
    ownerWall.connections = { start: null, end: { wallId: 'wall-2', endpoint: 'start' } };
    Object.assign(returnWall, { x1: 144, y1: 0, x2: 144, y2: 144,
      connections: { start: { wallId: 'wall-1', endpoint: 'end' }, end: null } });
    const { top, toe } = resolved();
    span(top, 25.625, 37.5625);
    span(toe, 21, 35.8125);
    verticalTurn(top, 36.3732);
    verticalTurn(toe, 34.0074);
    expect(top.side).toBe('right');
  });

  it('squashes furniture base and molding contours bottom to top using the return miter', () => {
    owner.ends.left.corner.kind = 45;
    owner.top = 'crown';
    owner.overrides = { baseKind: 'furniture_base', furnitureBaseProfileId: 'base' };
    ownerWall.profile = { topMoldProfileId: 'mold', crownProfileId: 'crown' };
    returnWall.profile = { topMoldProfileId: 'none', crownProfileId: 'none' };
    const settings = { ...S, sectionProfiles: [
      ['base', 'furniture_base', [[0, 0], [-0.5, -2], [-1, -4], [-2, -4], [-2, 0]]],
      ['mold', 'top_mold', [[0, 3], [-0.5, 1.5], [-1, 0], [-2, 0], [-2, 3]]],
      ['crown', 'crown', [[0, 0], [-0.5, -2.25], [-1, -4.5], [-2, -4.5], [-2, 0]]],
    ].map(([id, kind, points]) => ({ id, kind,
      geometry: { units: 'in', points: Object.fromEntries(points.map((point, i) => [`p${i}`, point])),
        loops: [{ id: 'outline', closed: true, segs: points.map((_, i) => ({
          type: 'line', from: `p${i}`, to: `p${(i + 1) % points.length}`,
        })) }] }, drawnPoints: { elevation: [] },
    })) };
    const { synced, bands } = resolved(settings);
    const view = resolveWall(synced, synced.walls[0], 'front');
    const corner = cornerEnd(synced, view, view.runs[0], 'left', settings);
    expect(bands.map(({ kind }) => kind)).toEqual(['furniture_base', 'top_mold', 'crown']);
    const tangent = Math.tan(Math.PI / 8);
    for (const [index, kind] of ['furnitureBase', 'topMold', 'crown'].entries()) {
      const band = bands[index];
      const turn = 144 - cornerBandTurns(corner, kind, band.front).b[1];
      expect(band.lines).toHaveLength(2);
      expect(band.lines[0].x1).toBeCloseTo(turn + tangent, 8);
      expect(band.lines[0].x2).toBeCloseTo(turn + 0.5 * tangent, 8);
      expect(band.lines[1].x1).toBeCloseTo(band.lines[0].x2, 8);
      expect(band.lines[1].x2).toBeCloseTo(turn, 8);
      expect(band.lines[0].z1).toBe(band.z);
      expect(band.lines[1].z2).toBe(band.z + band.height);
    }
  });

  it('keeps bands free when a return run has no matching band or box-top height', () => {
    returnWall.runs = [run({ id: 'run-2', x: 0, width: 96, height: 20, top: 'none',
      overrides: { toeKickHeight: 0 }, anchors: { left: false, right: true }, items: [auto('r')],
      ends: { left: { type: 'none' }, right: { type: 'none' } } })];
    const { top, toe } = resolved();
    span(top, 106.4375, 118.375);
    span(toe, 108.1875, 123);
    returnWall.runs[0].top = 'stone';
    span(resolved().top, 106.4375, 118.375);
    owner.top = 'none';
    owner.overrides = { baseKind: 'furniture_base' };
    returnWall.runs[0].overrides = { baseKind: 'furniture_base', toeKickHeight: 3 };
    const free = resolved().bands[0];
    span(free, 106.375, 118.3125);
    returnWall.runs[0].overrides.toeKickHeight = 4;
    // This shorter return leaves the owner's end panel, so reach includes its 0.8125" width.
    span(resolved().bands[0], 107.1875, 118.3125);
  });

  it('returns only the deeper band at a joint with unequal fronts', () => {
    owner.ends.left.corner.depthB = 15;
    returnWall.runs = [run({ id: 'run-2', x: 0, width: 96, anchors: { left: false, right: true },
      items: [auto('r')], ends: { left: { type: 'none' }, right: { type: 'none' } } })];
    let result = resolved();
    span(result.top, 108, 118.375);
    let other = result.view.runs[0];
    let scene = runScene(result.synced, result.view, other, S);
    expect(runBandEnds(result.synced, result.view, other, S, scene, 'countertop', 34.5, 1.5)[1])
      .toEqual({ type: 'return', x: 108.75, side: 108, facing: 1 });
    owner.ends.left.corner.depthB = 30;
    result = resolved();
    span(result.top, 107.25, 118.375);
    other = result.view.runs[0];
    scene = runScene(result.synced, result.view, other, S);
    expect(runBandEnds(result.synced, result.view, other, S, scene, 'countertop', 34.5, 1.5)[1])
      .toEqual({ type: 'square', x: 108 });
  });

  it('uses filler, absent end pieces and explicit top overhangs on a free leg', () => {
    owner.ends.left.corner.returnPiece = 'filler';
    let result = resolved();
    span(result.top, 105.75, 118.375);
    span(result.toe, 106.75, 123);
    owner.ends.left.corner.returnPiece = 'none';
    owner.topOverhang = { left: 2, front: 1 };
    result = resolved();
    span(result.top, 106, 118.125);
    span(result.toe, 108.25, 123);
  });

  it('uses the wood nosing contour and its full height for a 45 return turn', () => {
    owner.ends.left.corner.kind = 45;
    owner.top = 'wood';
    owner.overrides = { nosingProfileId: 'nosing' };
    const settings = { ...S, sectionProfiles: [{ id: 'nosing', kind: 'nosing',
      geometry: { units: 'in', points: { a: [0, 0], b: [0.5, 0], c: [0.25, -2], d: [0, -2] },
        loops: [{ id: 'outline', closed: true, segs: [
          { type: 'line', from: 'a', to: 'b' }, { type: 'line', from: 'b', to: 'c' },
          { type: 'line', from: 'c', to: 'd' }, { type: 'line', from: 'd', to: 'a' },
        ] }] }, drawnPoints: { elevation: [] },
    }] };
    const { synced, top } = resolved(settings);
    span(top, 106.6875, 118.875);
    expect(top).toMatchObject({ front: 25.375, z: 34, height: 2 });
    const view = resolveWall(synced, synced.walls[0], 'front');
    const corner = cornerEnd(synced, view, view.runs[0], 'left', settings);
    const turn = 144 - cornerBandTurns(corner, 'countertop', 25.375).b[1];
    expect(top.lines).toHaveLength(1);
    expect(top.lines[0].x1).toBeCloseTo(turn + 0.25 * Math.tan(Math.PI / 8), 8);
    expect(top.lines[0].x2).toBeCloseTo(turn, 8);
    expect(top.lines[0]).toMatchObject({ z1: 34, z2: 36 });
  });

  it('keeps the leg base free when the return run has a floor opening at the corner', () => {
    returnWall.runs = [run({ id: 'run-2', x: 0, width: 96, autoCount: false, anchors: { left: false, right: true },
      items: [{ ...auto('r'), kind: 'void' }], ends: { left: { type: 'none' }, right: { type: 'none' } } })];
    const { synced, view, top, toe } = resolved();
    span(top, 108, 118.375);
    span(toe, 108.25, 123);
    const other = view.runs[0];
    expect(runBands(synced, view, other, S, runScene(synced, view, other, S)).toeKicks).toEqual([]);
  });
});
