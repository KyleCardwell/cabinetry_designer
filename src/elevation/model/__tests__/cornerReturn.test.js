import { beforeEach, describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { cornerEnd, normalizeCornerEnd } from '../cornerEnd.js';
import {
  cornerForRunSide, cornerLegs, cornerOwnersAt, cornerReach, cornerReserveParts,
  cornerReturnPiece, cornerReturnRuns, frontDepth,
} from '../corners.js';
import { wallLength } from '../geometry.js';
import { landingsOn } from '../landings.js';
import { endCornerAnglesForRun, endMinWidthsForRun, resolveRunAnchorDatum } from '../runAnchors.js';
import { wallViewForRun } from '../wallSides.js';

let subject, ownerWall, returnWall, owner;

beforeEach(() => {
  owner = run({ z: 0, autoCount: false, items: [fixed('cc', 36), auto('a')],
    anchors: { left: true, right: false },
    ends: { left: normalizeCornerEnd({}), right: { type: 'none' } },
  });
  ownerWall = wall({ runs: [owner],
    connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null },
  });
  returnWall = wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0,
    connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } },
  });
  subject = room({ walls: [ownerWall, returnWall] });
});

describe('CC2 step b return runs die into the corner', () => {
  let ret;
  beforeEach(() => {
    ret = run({ id: 'return', z: 0, x: 0, width: 100,
      anchors: { left: false, right: true }, ends: { right: { type: 'none' } },
    });
    returnWall.runs = [ret];
  });

  it.each([
    [1, 36, 'corner-return', 108],
    [2, 30, 'corner-return', 114],
    [3, 36.8125, 'corner-return', 107.1875],
    [4, 0, 'auto', 144],
    [5, 0, 'auto', 144],
    [6, 40, 'custom', 104],
    [7, 36, 'corner-return', 108],
    [8, 36, 'corner-return', 108],
  ])('anchor %s: reserves the reach and resolves the right datum', (anchor, total, source, x) => {
    if (anchor === 2) owner.ends.left.corner.legB = 30;
    if (anchor === 3) Object.assign(owner, { cabinetTypeId: CABINET_TYPE_IDS.TALL, height: 84 });
    if (anchor === 4) owner.anchors.left = false;
    if (anchor === 5) Object.assign(ret, { cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 30, depth: 12 });
    if (anchor === 6) ret.cornerClearance = { right: 40 };
    if (anchor === 7) ret.ends.right = { type: 'filler', width: null };
    if (anchor === 8) {
      Object.assign(ret, { cabinetTypeId: CABINET_TYPE_IDS.TALL, height: 84 });
      const upper = run({ id: 'upper-owner', cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 30, depth: 12,
        items: [fixed('upper-cc', 24), auto('upper-a')], anchors: { left: true, right: false },
        ends: { left: normalizeCornerEnd({}), right: { type: 'none' } },
      });
      ownerWall.runs.push(upper);
      expect(cornerOwnersAt(subject, returnWall, ret, 'right'))
        .toEqual([{ wall: ownerWall, run: owner, side: 'left' }, { wall: ownerWall, run: upper, side: 'left' }]);
    }
    expect(cornerReserveParts(subject, returnWall, 'right', ret, DEFAULT_SETTINGS)).toEqual({
      face: anchor === 6 ? 36 : total, back: 0, lap: 0, total, source,
      neighborRunId: [4, 5].includes(anchor) ? null : owner.id,
    });
    expect(resolveRunAnchorDatum(subject, returnWall, ret, 'right', DEFAULT_SETTINGS).x).toBe(x);
    if (anchor === 7) {
      expect(endMinWidthsForRun(subject, returnWall, ret, DEFAULT_SETTINGS).right).toBe(1.5);
      expect(endCornerAnglesForRun(subject, returnWall, ret).right).toBeUndefined();
    }
  });

  it('keeps the reach for a face override and compares ordinary neighbors by front depth', () => {
    ret.cornerClearance = { right: 'face' };
    expect(cornerReserveParts(subject, returnWall, 'right', ret, DEFAULT_SETTINGS))
      .toMatchObject({ total: 36, source: 'corner-return', lap: 0 });
    ret.cabinetTypeId = CABINET_TYPE_IDS.TALL;
    const upper = run({ id: 'plain-upper', cabinetTypeId: CABINET_TYPE_IDS.UPPER,
      z: 54, height: 30, depth: 12, anchors: { left: true },
    });
    ownerWall.runs.push(upper);
    expect(cornerReserveParts(subject, returnWall, 'right', ret, DEFAULT_SETTINGS))
      .toMatchObject({ total: 36, source: 'corner-return', neighborRunId: owner.id });
    upper.depth = 40;
    expect(cornerReserveParts(subject, returnWall, 'right', ret, DEFAULT_SETTINGS))
      .toMatchObject({ total: frontDepth(upper, DEFAULT_SETTINGS), source: 'face', neighborRunId: upper.id });
  });

  it('filters owners by face, anchor, compatible band and active corner end, returning the source wall', () => {
    expect(cornerOwnersAt(subject, returnWall, ret, 'right')).toEqual([{ wall: ownerWall, run: owner, side: 'left' }]);
    expect(cornerOwnersAt(subject, returnWall, ret, 'right')[0].wall).toBe(ownerWall);
    owner.wallSide = 'back';
    expect(cornerOwnersAt(subject, returnWall, ret, 'right')).toEqual([]);
    delete owner.wallSide;
    owner.anchors.left = false;
    expect(cornerOwnersAt(subject, returnWall, ret, 'right')).toEqual([]);
    owner.anchors.left = true;
    owner.cabinetTypeId = CABINET_TYPE_IDS.UPPER;
    expect(cornerOwnersAt(subject, returnWall, ret, 'right')).toEqual([]);
    owner.cabinetTypeId = CABINET_TYPE_IDS.BASE;
    owner.ends.left = { type: 'none' };
    expect(cornerOwnersAt(subject, returnWall, ret, 'right')).toEqual([]);
    expect(cornerOwnersAt(subject, returnWall, ret, 'left')).toEqual([]);
  });

  it('keeps flat filler defaults when rendering without a room wall list', () => {
    const isolatedWall = wall({ runs: [ret] });
    expect(cornerOwnersAt({}, isolatedWall, ret, 'right')).toEqual([]);
    expect(endMinWidthsForRun({}, isolatedWall, ret, DEFAULT_SETTINGS).right).toBe(1.5);
    expect(endCornerAnglesForRun({}, isolatedWall, ret).right).toBeUndefined();
  });
});

describe('CC2 step b peninsula return runs (Room P)', () => {
  let host, pen, hostRun, penRun, penSide;
  beforeEach(() => {
    hostRun = run({ id: 'host-run', x: 0, width: 72, autoCount: false,
      items: [auto('a'), fixed('cc', 36)], anchors: { left: false, right: { to: 'wall', wallId: 'pen' } },
      ends: { left: { type: 'none' }, right: normalizeCornerEnd({ corner: { kind: 45 } }) },
    });
    penRun = run({ id: 'pen-run', x: 0, width: 48, autoCount: false, items: [fixed('pen-cc', 36), auto('b')],
      ends: { left: { type: 'none' }, right: { type: 'none' } },
    });
    host = wall({ id: 'host', x1: 0, y1: 0, x2: 144, y2: 0, thickness: 4.5, runs: [hostRun] });
    pen = wall({ id: 'pen', x1: 72, y1: 0, x2: 72, y2: 48, thickness: 4.5,
      connections: { start: null, end: null }, runs: [penRun],
      landings: { start: { wallId: 'host', side: 'front', ref: 'left', to: 'near', offset: 72 }, end: null },
    });
    subject = room({ walls: [host, pen] });
    const corner = cornerForRunSide(subject, host, hostRun, 'right');
    penRun.wallSide = corner.neighborWallSide;
    penSide = corner.neighborSide;
    penRun.anchors[penSide] = true;
  });

  it.each(['right', 'left'])('anchor P1: dies into a host-owned 45 corner at its %s side', (ownerSide) => {
    if (ownerSide === 'left') {
      hostRun.anchors = { left: { to: 'wall', wallId: 'pen' }, right: false };
      hostRun.ends = { left: normalizeCornerEnd({ corner: { kind: 45 } }), right: { type: 'none' } };
      hostRun.grid = run({ items: [fixed('cc', 36), auto('a')] }).grid;
      const corner = cornerForRunSide(subject, host, hostRun, 'left');
      penRun.wallSide = corner.neighborWallSide;
      penSide = corner.neighborSide;
      penRun.anchors = { left: false, right: false, [penSide]: true };
    }
    expect(cornerOwnersAt(subject, pen, penRun, penSide)).toEqual([{ wall: host, run: hostRun, side: ownerSide }]);
    expect(cornerReserveParts(subject, pen, penSide, penRun, DEFAULT_SETTINGS))
      .toEqual({ face: 36, back: 0, lap: 0, total: 36, source: 'corner-return', neighborRunId: hostRun.id });
    const x = penSide === 'left' ? 36 : wallLength(wallViewForRun(pen, penRun)) - 36;
    expect(resolveRunAnchorDatum(subject, pen, penRun, penSide, DEFAULT_SETTINGS).x).toBe(x);
  });

  it('anchor P2: dies into a peninsula-owned 90 corner at the host landing datum', () => {
    hostRun.ends.right = { type: 'none' };
    penRun.ends[penSide] = normalizeCornerEnd({});
    expect(cornerOwnersAt(subject, host, hostRun, 'right')).toEqual([{ wall: pen, run: penRun, side: penSide }]);
    expect(cornerReserveParts(subject, host, 'right', hostRun, DEFAULT_SETTINGS))
      .toMatchObject({ total: 36, source: 'corner-return', neighborRunId: penRun.id });
    const landing = landingsOn(subject, wallViewForRun(host, hostRun))[0];
    expect(resolveRunAnchorDatum(subject, host, hostRun, 'right', DEFAULT_SETTINGS).x).toBe(landing.a - 36);
    const crossing = run({ id: 'crossing', x: 0, width: 144, depth: 60 });
    host.runs.push(crossing);
    expect(cornerOwnersAt(subject, host, hostRun, 'right')).toEqual([]);
    penRun.ends[penSide] = { type: 'none' };
    hostRun.ends.right = normalizeCornerEnd({ corner: { kind: 45 } });
    expect(cornerReserveParts(subject, pen, penSide, penRun, DEFAULT_SETTINGS))
      .toMatchObject({ total: frontDepth(crossing, DEFAULT_SETTINGS), source: 'auto', neighborRunId: null });
  });
});

describe('CC2 step a return-side piece and reach', () => {
  it.each([
    [1, {}, false, { type: 'end_panel', width: 0.8125, covered: false, auto: true }, 36.8125],
    [2, {}, true, { type: 'none', width: 0, covered: true, auto: true }, 36],
    [3, {}, true, { type: 'end_panel', width: 0.8125, covered: false, auto: true }, 36.8125],
    [4, { returnPiece: 'filler' }, false, { type: 'filler', width: 1.5, covered: false, auto: false }, 37.5],
    [5, { returnPiece: 'filler', returnWidth: 3 }, false,
      { type: 'filler', width: 3, covered: false, auto: false }, 39],
    [6, { returnPiece: 'none' }, false, { type: 'none', width: 0, covered: false, auto: false }, 36],
    [7, { returnPiece: 'end_panel' }, true,
      { type: 'end_panel', width: 0.8125, covered: true, auto: false }, 36.8125],
    [8, { legB: 30 }, true, { type: 'none', width: 0, covered: true, auto: true }, 30],
    [9, {}, true, { type: 'none', width: 0, covered: true, auto: true }, 24],
  ])('anchor %s: resolves the piece and reach', (anchor, choices, hasReturn, expected, reach) => {
    Object.assign(owner.ends.left.corner, choices);
    if (hasReturn) returnWall.runs = [run({ id: 'return', z: 0, anchors: { right: true } })];
    if (anchor === 3) Object.assign(owner, { cabinetTypeId: CABINET_TYPE_IDS.TALL, height: 84 });
    if (anchor === 9) {
      Object.assign(owner, { cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 30, depth: 12 });
      owner.grid.cols[0].size = 24;
      Object.assign(returnWall.runs[0], { cabinetTypeId: CABINET_TYPE_IDS.TALL, height: 84 });
    }
    expect(cornerReturnPiece(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS)).toEqual(expected);
    expect(cornerReach(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS)).toBe(reach);
    expect(cornerEnd(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS))
      .toMatchObject({ returnSide: expected, reach });
  });

  it('anchor 10: defaults auto columns without a layout and reads the correct outer manual column', () => {
    owner.grid.cols[0] = { ...owner.grid.cols[0], sizeMode: 'auto', size: null };
    expect(cornerLegs(owner, 'left')).toEqual({ legA: 36, legB: 36 });
    owner.grid.cols[0].size = 42;
    expect(cornerLegs(owner, 'left')).toEqual({ legA: 36, legB: 36 });
    owner.grid.cols[1] = { ...owner.grid.cols[1], sizeMode: 'manual', size: 30 };
    owner.ends.right = normalizeCornerEnd({ corner: { legB: 28 } });
    expect(cornerLegs(owner, 'right')).toEqual({ legA: 30, legB: 28 });
    owner.grid.cols[0] = { ...owner.grid.cols[0], sizeMode: 'manual', size: 0 };
    expect(cornerLegs(owner, 'left')).toEqual({ legA: 36, legB: 36 });
    owner.cabinetTypeId = CABINET_TYPE_IDS.UPPER;
    expect(cornerLegs(owner, 'left')).toEqual({ legA: 24, legB: 24 });
    delete owner.grid;
    expect(cornerLegs(owner, 'left')).toEqual({ legA: 24, legB: 24 });
  });

  it('filters return runs by face, anchor and band, including on an inactive owner', () => {
    const covering = run({ id: 'covering', z: 0, anchors: { right: true } });
    returnWall.runs = [covering,
      run({ id: 'back', z: 0, wallSide: 'back', anchors: { right: true } }),
      run({ id: 'unanchored', z: 0 }),
      run({ id: 'upper', z: 0, cabinetTypeId: CABINET_TYPE_IDS.UPPER, anchors: { right: true } }),
    ];
    owner.anchors.left = false;
    expect(cornerReturnRuns(subject, ownerWall, owner, 'left'))
      .toEqual({ corner: expect.objectContaining({ type: 'inside' }), returnWall, runs: [covering] });
    expect(cornerEnd(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS))
      .toMatchObject({ active: false, returnSide: { covered: true, type: 'none' }, reach: 36 });
    subject.walls = [ownerWall];
    expect(cornerReturnRuns(subject, ownerWall, owner, 'left').runs).toEqual([]);
    expect(cornerReach(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS)).toBe(36.8125);
  });

  it('requires gapless coverage and ignores nonpositive heights', () => {
    Object.assign(owner, { cabinetTypeId: CABINET_TYPE_IDS.TALL, height: 84 });
    returnWall.runs = [
      run({ id: 'lower', z: 0, height: 40, anchors: { right: true } }),
      run({ id: 'upper', z: 41, height: 43, anchors: { right: true } }),
      run({ id: 'empty', z: 40, height: 0, anchors: { right: true } }),
      run({ id: 'negative', z: 41, height: -1, anchors: { right: true } }),
    ];
    expect(cornerReturnPiece(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS).covered).toBe(false);
    returnWall.runs[1].z = 40;
    returnWall.runs[1].height = 44;
    expect(cornerReturnPiece(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS).covered).toBe(true);
  });

  it('uses the run panel style and typed panel width, while none always has zero width', () => {
    owner.panelStyleId = 'sheet';
    expect(cornerReturnPiece(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS).width).toBe(0.75);
    owner.ends.left.corner.returnWidth = 2;
    expect(cornerReach(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS)).toBe(38);
    owner.ends.left.corner.returnPiece = 'none';
    expect(cornerReach(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS)).toBe(36);
  });

  it('uses the owner face for back-wall corners', () => {
    owner.wallSide = 'back';
    ownerWall.flipped = true;
    const covering = run({ id: 'return', z: 0, anchors: { right: true } });
    returnWall.runs = [covering];
    expect(cornerReturnRuns(subject, ownerWall, owner, 'left'))
      .toMatchObject({ corner: { type: 'inside' }, runs: [covering] });
    expect(cornerReturnPiece(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS))
      .toEqual({ type: 'none', width: 0, covered: true, auto: true });
  });

  it('keeps cornerEnd reach tied to the supplied layout leg', () => {
    const layout = { pieces: [{ id: 'cc', kind: 'cabinet', width: 40 }] };
    expect(cornerEnd(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS, layout))
      .toMatchObject({ legA: 40, legB: 40, reach: 40.8125 });
    expect(cornerReach(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS)).toBe(36.8125);
  });
});
