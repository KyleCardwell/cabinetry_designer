import { beforeEach, describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { cornerEnd, normalizeCornerEnd } from '../cornerEnd.js';
import { cornerLegs, cornerReach, cornerReturnPiece, cornerReturnRuns } from '../corners.js';

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
