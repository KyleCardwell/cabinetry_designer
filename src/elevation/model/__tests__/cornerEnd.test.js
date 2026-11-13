import { beforeEach, describe, expect, it } from 'vitest';
import { attach, auto, fixed, pin, room, run, wall } from '../../../test/builders.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { cornerEnd, cornerEndWarnings, normalizeCornerEnd } from '../cornerEnd.js';
import { cornerEndActive, cornerForRunSide } from '../corners.js';
import { wallLength } from '../geometry.js';
import { landingsOn } from '../landings.js';
import { roomDiagnostics } from '../roomSync.js';
import { wallViewForRun } from '../wallSides.js';

let subject, ownerWall, returnWall, owner;

describe('plain corners (CC1)', () => {
  beforeEach(() => {
    owner = run({ autoCount: false, items: [fixed('cc', 36), auto('a')],
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

  it('resolves the whole owner column with no return run', () => {
    const result = cornerEnd(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS);
    expect(result).toMatchObject({ side: 'left', active: true, kind: 90,
      legA: 36, legB: 36, depthA: 24, depthB: 24, returnPiece: 'auto',
      columnId: 'cc', cornerX: 0, dir: 1, shape: { shown: { a: 12, b: 12 } }, warnings: [],
    });
    expect(result.corner).toEqual(cornerForRunSide(subject, ownerWall, owner, 'left'));
    expect(cornerEndActive(subject, ownerWall, owner, 'left')).toEqual({ active: true, code: null });
  });

  it('uses the return run box depth', () => {
    returnWall.runs = [run({ id: 'return', depth: 21, anchors: { left: false, right: true } })];
    expect(cornerEnd(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS))
      .toMatchObject({ depthB: 21, shape: { shown: { a: 15, b: 12 } } });
  });

  it('ignores a return run in an incompatible band', () => {
    returnWall.runs = [run({ id: 'upper', cabinetTypeId: CABINET_TYPE_IDS.UPPER, depth: 12,
      anchors: { left: false, right: true } })];
    expect(cornerEnd(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS).depthB).toBe(24);
  });

  it('typed dimensions override auto for a 45-degree cabinet', () => {
    owner.ends.left.corner = { kind: 45, legB: 30, depthB: 15, returnPiece: 'filler' };
    returnWall.runs = [run({ depth: 28, anchors: { left: false, right: true } })];
    const result = cornerEnd(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS);
    expect(result).toMatchObject({ legB: 30, depthB: 15, returnPiece: 'filler',
      shape: { shown: { a: 20.25, b: 5.25 } } });
    expect(result.shape.trueWidth).toBeCloseTo(20.9195, 3);
    expect(result.shape.angle).toBeCloseTo(14.5345, 3);
  });

  it('retains resolved dimensions while unanchored', () => {
    owner.anchors.left = false;
    const result = cornerEnd(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS);
    expect(result).toMatchObject({ active: false, cornerX: null, legA: 36, legB: 36,
      depthA: 24, depthB: 24, shape: { shown: { a: 12, b: 12 } },
      warnings: [{ code: 'corner-not-in-corner', side: 'left',
        message: "The corner cabinet isn't anchored into a square inside corner." }],
    });
  });

  it('uses sheet thickness for Euro sides and warns when it consumes a diagonal (CC6.1)', () => {
    owner.ends.left.corner.kind = 45;
    const settings = { ...DEFAULT_SETTINGS, sheetThickness: 1 };
    expect(cornerEnd(subject, ownerWall, owner, 'left', settings)).toMatchObject({
      construction: 'euro', shape: { sideThickness: 1, shown: { a: 11, b: 11 } },
    });
    owner.ends.left.corner.depthB = 35.5;
    expect(cornerEnd(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS)).toMatchObject({
      shape: null, faceLayout: null,
      warnings: [{ code: 'corner-legs-too-short', side: 'left' }],
    });
  });

  it('keeps the uneven door over both side edges once it is set out to the neighbours\' face plane (CC6.2)', () => {
    Object.assign(owner.ends.left.corner, { kind: 45, depthB: 15 });
    const thick = cornerEnd(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS);
    expect(thick.faceLayout.sideClearance.a).toBeCloseTo(0.2085, 3);
    expect(thick.warnings).toEqual([]);
    owner._doorThickness = 0.75;
    // Keep the anchor's 7/8-inch face offset with the thinner door and a thicker bumper.
    const thin = cornerEnd(subject, ownerWall, owner, 'left', { ...DEFAULT_SETTINGS, bumperThickness: 1 / 8 });
    expect(thin.faceLayout.sideClearance.a).toBeCloseTo(0.2632, 3);
    expect(thin.warnings).toEqual([]);
  });

  it('keeps active, beaded and inactive framed corners five-sided (CC6.1)', () => {
    owner.ends.left.corner.kind = 45;
    for (const [active, bead] of [[true, 0], [true, 0.25], [false, 0]]) {
      owner.anchors.left = active;
      owner._frame = { thickness: 0.75, bead };
      expect(cornerEnd(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS)).toMatchObject({
        construction: 'frame', shape: { construction: 'frame', sideThickness: 0, sideEdges: null,
          shown: { a: 12, b: 12 }, outline: [[0, 0], [36, 0], [36, 24], [24, 36], [0, 36]] },
      });
    }
  });

  it('rejects a 135-degree inside corner', () => {
    returnWall.x1 = -144;
    const result = cornerEnd(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS);
    expect(result.corner.angle).toBeCloseTo(135, 3);
    expect(result.active).toBe(false);
    expect(result.warnings.map(({ code }) => code)).toEqual(['corner-not-in-corner']);
  });

  it('does not skip a void to select an inner cabinet', () => {
    owner.grid.cells[0].node.kind = 'void';
    expect(cornerEnd(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS))
      .toMatchObject({ legA: null, columnId: null, shape: null,
        warnings: [{ code: 'corner-column-not-cabinet', side: 'left',
          message: 'The corner column must be a single cabinet.' }],
      });
  });

  it('warns and omits a shape when a leg is too short', () => {
    owner.ends.left.corner.legB = 20;
    expect(cornerEnd(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS))
      .toMatchObject({ shape: null, warnings: [{ code: 'corner-legs-too-short', side: 'left',
        message: "The corner cabinet's legs are shorter than the depths beside them." }] });
  });

  it('diagnoses doubled corners on both runs without recursion', () => {
    returnWall.runs = [run({ id: 'return', autoCount: false, items: [auto('b'), fixed('return-cc', 36)],
      anchors: { left: false, right: true },
      ends: { left: { type: 'none' }, right: normalizeCornerEnd({}) },
    })];
    const diagnostics = roomDiagnostics(subject, DEFAULT_SETTINGS);
    for (const [id, side] of [['run-1', 'left'], ['return', 'right']]) {
      expect(diagnostics[id].warnings).toContainEqual({ code: 'corner-doubled', side,
        message: 'Both runs in this corner have a corner cabinet.' });
    }
    returnWall.runs[0].anchors.right = false;
    expect(cornerEndWarnings(subject, ownerWall, owner, DEFAULT_SETTINGS)).toEqual([]);
    expect(cornerEndWarnings(subject, returnWall, returnWall.runs[0], DEFAULT_SETTINGS)
      .map(({ code }) => code)).toEqual(['corner-not-in-corner']);
  });

  it('returns null and no warnings for other end types', () => {
    expect(cornerEnd(subject, ownerWall, owner, 'right', DEFAULT_SETTINGS)).toBeNull();
    expect(cornerEndActive(subject, ownerWall, owner, 'right')).toEqual({ active: false, code: null });
    owner.ends.left = { type: 'filler', width: null };
    expect(cornerEndWarnings(subject, ownerWall, owner, DEFAULT_SETTINGS)).toEqual([]);
  });

  it.each(['panel', 'shelves', 'filler', 'split', 'empty'])('warns for a %s outer column', (kind) => {
    if (kind === 'empty') owner.grid = run().grid;
    else if (kind === 'split') owner.grid.cells[0].node = run({ id: 'split', items: [auto('child')] }).grid;
    else owner.grid.cells[0].node.kind = kind;
    expect(cornerEndWarnings(subject, ownerWall, owner, DEFAULT_SETTINGS).map(({ code }) => code))
      .toEqual(['corner-column-not-cabinet']);
  });

  it.each(['pin', 'attach'])('warns for a column with %s even while inactive and too short', (key) => {
    owner.grid.cols[0][key] = key === 'pin' ? pin(18) : attach('line-1');
    owner.anchors.left = false;
    owner.ends.left.corner.legB = 20;
    expect(cornerEndWarnings(subject, ownerWall, owner, DEFAULT_SETTINGS).map(({ code }) => code))
      .toEqual(['corner-not-in-corner', 'corner-column-pinned', 'corner-legs-too-short']);
  });

  it('uses a supplied layout, ignoring per-cell depth and face offsets', () => {
    owner.grid.cells[0].node.depth = 10;
    owner.outset = 5;
    const layout = { pieces: [{ id: 'cc', kind: 'cabinet', width: 40, depth: 10 }] };
    expect(cornerEnd(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS, layout))
      .toMatchObject({ legA: 40, legB: 40, depthA: 24, depthB: 24,
        shape: { shown: { a: 16, b: 16 } } });
  });

  it('uses the largest compatible anchored return depth on the correct face', () => {
    returnWall.runs = [
      run({ id: 'shallow', depth: 15, anchors: { right: true } }),
      run({ id: 'deep', depth: 21, cabinetTypeId: CABINET_TYPE_IDS.TALL, anchors: { right: true } }),
      run({ id: 'unanchored', depth: 30 }),
      run({ id: 'back', depth: 32, wallSide: 'back', anchors: { right: true } }),
    ];
    expect(cornerEnd(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS).depthB).toBe(21);
  });

  it.each([90.49, 90.51])('applies the half-degree tolerance at %s degrees', (angle) => {
    returnWall.x1 = 144 * Math.cos(angle * Math.PI / 180);
    returnWall.y1 = 144 * Math.sin(angle * Math.PI / 180);
    expect(cornerEndActive(subject, ownerWall, owner, 'left').active).toBe(angle < 90.5);
  });

  it.each([{ to: 'opening' }, { to: 'soffit' }, { to: 'recess' }, { to: 'joint' }, { to: 'follow' }])(
    'rejects a $to anchor', (anchor) => {
      owner.anchors.left = anchor;
      expect(cornerEndActive(subject, ownerWall, owner, 'left'))
        .toEqual({ active: false, code: 'corner-not-in-corner' });
    },
  );

  it('becomes inactive without losing stored choices when the return wall is removed', () => {
    subject.walls = [ownerWall];
    expect(cornerEnd(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS))
      .toMatchObject({ active: false, cornerX: null, legA: 36, depthB: 24 });
    expect(owner.ends.left).toEqual(normalizeCornerEnd({}));
  });
});

describe('peninsula corners (CC1)', () => {
  let host, pen, penRun, hostRun, penSide;
  beforeEach(() => {
    hostRun = run({ id: 'host-run', x: 0, width: 72, autoCount: false,
      items: [auto('a'), fixed('cc', 36)], anchors: { left: false, right: { to: 'wall', wallId: 'pen' } },
      ends: { left: { type: 'none' }, right: normalizeCornerEnd({ corner: { kind: 45 } }) },
    });
    penRun = run({ id: 'pen-run', x: 0, width: 48, autoCount: false, items: [fixed('pen-cc', 36), auto('b')] });
    host = wall({ id: 'host', x1: 0, y1: 0, x2: 144, y2: 0, thickness: 4.5, runs: [hostRun] });
    pen = wall({ id: 'pen', x1: 72, y1: 0, x2: 72, y2: 48, thickness: 4.5,
      connections: { start: null, end: null }, runs: [penRun],
      landings: { start: { wallId: 'host', side: 'front', ref: 'left', to: 'near', offset: 72 }, end: null },
    });
    subject = room({ walls: [host, pen] });
    const hostCorner = cornerForRunSide(subject, host, hostRun, 'right');
    penRun.wallSide = hostCorner.neighborWallSide;
    penSide = hostCorner.neighborSide;
    penRun.anchors[penSide] = true;
    expect(cornerForRunSide(subject, pen, penRun, penSide))
      .toMatchObject({ type: 'inside', neighborWallId: 'host' });
  });

  it('anchor P1: resolves a host-owned 45 corner at the near landing edge', () => {
    const result = cornerEnd(subject, host, hostRun, 'right', DEFAULT_SETTINGS);
    const landing = landingsOn(subject, wallViewForRun(host, hostRun))[0];
    expect(result).toMatchObject({ active: true, dir: -1, cornerX: landing.a,
      depthB: 24, shape: { shown: { a: 11.25, b: 11.25 }, angle: 45 }, warnings: [] });
  });

  it('anchor P2: resolves a peninsula-owned corner from the host return box', () => {
    hostRun.ends.right = { type: 'none' };
    hostRun.depth = 21;
    penRun.ends[penSide] = normalizeCornerEnd({});
    const result = cornerEnd(subject, pen, penRun, penSide, DEFAULT_SETTINGS);
    expect(result).toMatchObject({ active: true, depthB: 21, warnings: [],
      cornerX: penSide === 'left' ? 0 : wallLength(wallViewForRun(pen, penRun)) });
  });

  it('anchor P3: rejects a host run crossing the landing', () => {
    penRun.ends[penSide] = normalizeCornerEnd({});
    hostRun.x = 0;
    hostRun.width = 144;
    hostRun.anchors.right = false;
    expect(cornerEnd(subject, pen, penRun, penSide, DEFAULT_SETTINGS))
      .toMatchObject({ active: false, cornerX: null,
        warnings: [{ code: 'corner-crossed', side: penSide,
          message: "A run crosses the corner where the corner cabinet's return leg would go." }] });
    expect(roomDiagnostics(subject, DEFAULT_SETTINGS)['pen-run'].warnings)
      .toContainEqual(expect.objectContaining({ code: 'corner-crossed', side: penSide }));
    hostRun.cabinetTypeId = CABINET_TYPE_IDS.UPPER;
    expect(cornerEndActive(subject, pen, penRun, penSide)).toEqual({ active: true, code: null });
  });

  it('maps a left host corner to the far landing edge and resolves the back peninsula face', () => {
    hostRun.anchors = { left: { to: 'wall', wallId: 'pen' }, right: false };
    hostRun.ends = { left: normalizeCornerEnd({}), right: { type: 'none' } };
    hostRun.grid = run({ items: [fixed('cc', 36), auto('a')] }).grid;
    const corner = cornerForRunSide(subject, host, hostRun, 'left');
    penRun.wallSide = corner.neighborWallSide;
    penRun.anchors = { left: false, right: false, [corner.neighborSide]: true };
    penRun.depth = 21;
    const landing = landingsOn(subject, wallViewForRun(host, hostRun))[0];
    expect(cornerEnd(subject, host, hostRun, 'left', DEFAULT_SETTINGS))
      .toMatchObject({ active: true, dir: 1, cornerX: landing.b, depthB: 21 });
    penRun.ends[corner.neighborSide] = normalizeCornerEnd({});
    const diagnostics = roomDiagnostics(subject, DEFAULT_SETTINGS);
    expect(diagnostics['host-run'].warnings).toContainEqual(expect.objectContaining({ code: 'corner-doubled' }));
    expect(diagnostics['pen-run'].warnings).toContainEqual(expect.objectContaining({ code: 'corner-doubled' }));
  });
});
