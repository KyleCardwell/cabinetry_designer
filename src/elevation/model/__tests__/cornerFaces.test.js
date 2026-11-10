import { beforeEach, describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { cornerDepthBAuto, normalizeCornerEnd } from '../cornerEnd.js';
import { cornerForRunSide } from '../corners.js';
import { squashRect } from '../cornerSquash.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';

describe('CC3 step a corner face boxes', () => {
  let subject, ownerWall, returnWall, owner;
  beforeEach(() => {
    owner = run({ autoCount: false, items: [fixed('cc', 36), auto('a')],
      style: { cabinetStyleId: 13 }, anchors: { left: true, right: false },
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

  it('anchor 1: uses the true 90 span and ordinary side reveals', () => {
    const entry = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc');
    expect(entry).toMatchObject({ box: { x: 24, width: 12 }, squash: null,
      corner: { side: 'left', kind: 90 }, style: { cabinetStyleId: 13 } });
    const face = entry.faces[0];
    expect(face.x - entry.box.x).toBeCloseTo(entry.reveals.values.left, 10);
    expect(entry.box.x + entry.box.width - face.x - face.width)
      .toBeCloseTo(entry.reveals.values.right, 10);
  });

  it('anchor 2: starts the 90 face at the return run box depth', () => {
    returnWall.runs = [run({ id: 'return', depth: 21, anchors: { left: false, right: true } })];
    expect(runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc').box)
      .toMatchObject({ x: 21, width: 15 });
  });

  it('anchor 3: lays out the base 45 at true width before drawing projection', () => {
    owner.ends.left.corner.kind = 45;
    const entry = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc');
    expect(entry.box.x).toBeCloseTo(19.029, 3);
    expect(entry.box.width).toBeCloseTo(16.971, 3);
    expect(entry.squash.pivot).toBe(36);
    expect(entry.squash.k).toBeCloseTo(0.70711, 5);
    expect(entry.corner).toEqual({ side: 'left', kind: 45 });
    expect(entry.faces).toHaveLength(1); // The default face uses true width, not the 36-inch column.
    const drawn = squashRect(entry.box, entry.squash);
    expect(drawn.x).toBeCloseTo(24, 10);
    expect(drawn.width).toBeCloseTo(12, 10);
  });

  it('anchor 4: keeps uneven 45 faces and reveals at true width', () => {
    owner.ends.left.corner = { ...owner.ends.left.corner, kind: 45, depthB: 15 };
    owner.grid.cells[0].node.face = { type: 'door' };
    const entry = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc');
    expect(entry.box.x).toBeCloseTo(11.813, 3);
    expect(entry.box.width).toBeCloseTo(24.187, 3);
    expect(entry.squash.k).toBeCloseTo(0.86824, 5);
    const drawn = squashRect(entry.box, entry.squash);
    expect(drawn.x).toBeCloseTo(15, 10);
    expect(drawn.width).toBeCloseTo(21, 10);
    expect(entry.faces[0].width + entry.reveals.values.left + entry.reveals.values.right)
      .toBeCloseTo(24.187, 3);
  });

  it('anchor 5: projects an upper 45 without changing its vertical dimensions', () => {
    Object.assign(owner, { cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 30, depth: 12 });
    owner.grid.cols[0].size = 24;
    owner.ends.left.corner.kind = 45;
    const entry = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc');
    expect(entry.box.x).toBeCloseTo(7.029, 3);
    expect(entry.box.width).toBeCloseTo(16.971, 3);
    expect(entry.squash.pivot).toBe(24);
    expect(squashRect(entry.box, entry.squash)).toMatchObject({ x: 12, z: 54, height: 30 });
    expect(squashRect(entry.box, entry.squash).width).toBeCloseTo(12, 10);
  });

  it('anchor 6: keeps a right host corner pivot at the column x (Room P1)', () => {
    const hostRun = run({ id: 'host-run', x: 0, width: 72, autoCount: false,
      items: [auto('a'), fixed('cc', 36)], anchors: { left: false, right: { to: 'wall', wallId: 'pen' } },
      ends: { left: { type: 'none' }, right: normalizeCornerEnd({ corner: { kind: 45 } }) },
    });
    const penRun = run({ id: 'pen-run', x: 0, width: 48, autoCount: false,
      items: [fixed('pen-cc', 36), auto('b')] });
    const host = wall({ id: 'host', x1: 0, y1: 0, x2: 144, y2: 0, thickness: 4.5, runs: [hostRun] });
    const pen = wall({ id: 'pen', x1: 72, y1: 0, x2: 72, y2: 48, thickness: 4.5,
      connections: { start: null, end: null }, runs: [penRun],
      landings: { start: { wallId: 'host', side: 'front', ref: 'left', to: 'near', offset: 72 }, end: null },
    });
    const peninsulaRoom = room({ walls: [host, pen] });
    const corner = cornerForRunSide(peninsulaRoom, host, hostRun, 'right');
    penRun.wallSide = corner.neighborWallSide;
    penRun.anchors[corner.neighborSide] = true;
    const layout = layoutRun(peninsulaRoom, host, hostRun, DEFAULT_SETTINGS);
    const pivot = layout.pieces.find(({ id }) => id === 'cc').x;
    const entry = runFaceLayouts(peninsulaRoom, host, hostRun, DEFAULT_SETTINGS, layout).get('cc');
    expect(entry.corner).toEqual({ side: 'right', kind: 45 });
    expect(entry.squash.pivot).toBe(pivot);
    expect(entry.box.x).toBe(pivot);
    expect(entry.box.width).toBeCloseTo(16.971, 3);
    expect(squashRect(entry.box, entry.squash).width).toBeCloseTo(12, 10);
  });

  it('anchor 7: leaves inactive corner entries ordinary', () => {
    owner.ends.left.corner.kind = 45;
    owner.anchors.left = false;
    const entry = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc');
    expect(entry.box).toMatchObject({ x: 0, width: 36 });
    expect(entry).not.toHaveProperty('squash');
    expect(entry).not.toHaveProperty('corner');
  });

  it('anchor 8: does not hinge an unspecified corner door toward the inside corner', () => {
    owner.grid.cells[0].node.face = { type: 'door' };
    const entry = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc');
    expect(entry.faces[0].hinge).not.toBe('left');
    owner.grid.cells[0].node.face.hinge = 'left';
    expect(runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc').faces[0].hinge).toBe('left');
  });

  it.each(['short-leg', 'grid'])('leaves a %s corner column ordinary', (invalid) => {
    if (invalid === 'short-leg') owner.ends.left.corner.legB = 20;
    else owner.grid.cells[0].node = run({ items: [auto('child')] }).grid;
    const layouts = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS);
    const entry = layouts.get(invalid === 'grid' ? 'child' : 'cc');
    expect(entry.box).toMatchObject({ x: 0, width: 36 });
    expect(entry).not.toHaveProperty('squash');
    expect(entry).not.toHaveProperty('corner');
  });

  it('anchor 9: changes only the corner column when changing kind', () => {
    const before = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS);
    owner.ends.left.corner.kind = 45;
    const after = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS);
    expect(after.get('a')).toEqual(before.get('a'));
  });

  it('anchor 11: resolves auto depth from compatible return runs, else the owner', () => {
    expect(cornerDepthBAuto(subject, ownerWall, owner, 'left')).toBe(24);
    returnWall.runs = [run({ id: 'return', depth: 21, anchors: { left: false, right: true } })];
    expect(cornerDepthBAuto(subject, ownerWall, owner, 'left')).toBe(21);
    returnWall.runs.push(run({ id: 'deeper', depth: 23, anchors: { right: true } }));
    expect(cornerDepthBAuto(subject, ownerWall, owner, 'left')).toBe(23);
    returnWall.runs.pop();
    returnWall.runs[0].cabinetTypeId = CABINET_TYPE_IDS.UPPER;
    expect(cornerDepthBAuto(subject, ownerWall, owner, 'left')).toBe(24);
  });
});
