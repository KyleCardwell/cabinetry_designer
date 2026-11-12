import { beforeEach, describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { cornerDepthBAuto, cornerEnd, normalizeCornerEnd } from '../cornerEnd.js';
import { cornerForRunSide } from '../corners.js';
import { squashRect } from '../cornerSquash.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { partNumbers } from '../partNumbers.js';
import { pickStack } from '../pick.js';
import { runScene } from '../runScene.js';
import { formatInches } from '../units.js';

describe('CC3 corner face boxes and scene', () => {
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
    expect(entry.box.x).toBeCloseTo(20.241, 3);
    expect(entry.box.width).toBeCloseTo(15.8215, 3);
    expect(entry.squash.pivot).toBeCloseTo(36.0625, 3);
    expect(entry.squash.k).toBeCloseTo(0.70711, 5);
    expect(entry.corner).toEqual({ side: 'left', kind: 45, sideEdge: { x: 35.25, width: 0.75 } });
    expect(entry.faces).toHaveLength(1); // The default face uses true width, not the 36-inch column.
    const drawn = squashRect(entry.box, entry.squash);
    expect(drawn.x).toBeCloseTo(24.875, 3);
    expect(drawn.width).toBeCloseTo(11.1875, 3);
    expect(drawn.x + drawn.width).toBeCloseTo(36.0625, 3);
  });

  it('anchor 4: keeps uneven 45 faces and reveals at true width', () => {
    owner.ends.left.corner = { ...owner.ends.left.corner, kind: 45, depthB: 15 };
    owner.grid.cells[0].node.face = { type: 'door' };
    const entry = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc');
    expect(entry.box.x).toBeCloseTo(12.9705, 3);
    expect(entry.box.width).toBeCloseTo(23.0802, 3);
    expect(entry.squash.pivot).toBeCloseTo(36.0507, 3);
    expect(entry.squash.k).toBeCloseTo(0.87416, 5);
    const drawn = squashRect(entry.box, entry.squash);
    expect(drawn.x).toBeCloseTo(15.875, 3);
    expect(drawn.width).toBeCloseTo(20.1757, 3);
    expect(entry.faces[0].width + entry.reveals.values.left + entry.reveals.values.right)
      .toBeCloseTo(23.0802, 3);
  });

  it('anchor 5: projects an upper 45 without changing its vertical dimensions', () => {
    Object.assign(owner, { cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 30, depth: 12 });
    owner.grid.cols[0].size = 24;
    owner.ends.left.corner.kind = 45;
    const entry = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc');
    expect(entry.box.x).toBeCloseTo(8.241, 3);
    expect(entry.box.width).toBeCloseTo(15.8215, 3);
    expect(entry.squash.pivot).toBeCloseTo(24.0625, 3);
    expect(squashRect(entry.box, entry.squash)).toMatchObject({ z: 54, height: 30 });
    expect(squashRect(entry.box, entry.squash).x).toBeCloseTo(12.875, 3);
    expect(squashRect(entry.box, entry.squash).width).toBeCloseTo(11.1875, 3);
  });

  it('anchor 6: projects a right host corner from the door-face pivot (Room P1)', () => {
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
    expect(entry.corner).toEqual({ side: 'right', kind: 45, sideEdge: { x: pivot, width: 0.75 } });
    expect(entry.squash.pivot).toBeCloseTo(pivot - 0.0625, 3);
    expect(entry.box.x).toBeCloseTo(pivot - 0.0625, 3);
    expect(entry.box.width).toBeCloseTo(15.8215, 3);
    expect(squashRect(entry.box, entry.squash).width).toBeCloseTo(11.1875, 3);

    // Step b anchors 5 and 6: the peninsula covers the return side until removed.
    const covered = runScene(peninsulaRoom, host, hostRun, DEFAULT_SETTINGS);
    expect(covered.cornerPanels).toEqual([]);
    expect(covered.subLabels.get('cc')).toBe('Corner 45');
    pen.runs = [];
    const exposed = runScene(peninsulaRoom, host, hostRun, DEFAULT_SETTINGS);
    expect(exposed.cornerPanels).toEqual([
      { key: 'corner-panel:right', side: 'right', x: pivot + 12, width: 24, columnId: 'cc' },
    ]);
    expect(exposed.subLabels.get('cc')).toBe('Corner 45');
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
    const scene = runScene(subject, ownerWall, owner, DEFAULT_SETTINGS);
    expect(scene.cornerPanels).toEqual([]);
    expect([...scene.subLabels.values()].some((label) => label.startsWith('Corner'))).toBe(false);
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

  it('step b anchor 1: exposes the 90 return panel and labels the full-width column', () => {
    const scene = runScene(subject, ownerWall, owner, DEFAULT_SETTINGS);
    expect(scene.cornerPanels).toEqual([
      { key: 'corner-panel:left', side: 'left', x: 0, width: 24, columnId: 'cc' },
    ]);
    expect(scene.subLabels.get('cc')).toBe('Corner 90');
    const column = scene.drawnPieces.find(({ id }) => id === 'cc');
    expect(column).toEqual(scene.result.pieces.find(({ id }) => id === 'cc'));
    expect(column).toMatchObject({ kind: 'cabinet', role: 'item', x: 0, width: 36 });
  });

  it('step b anchor 2: omits the panel when a base return run covers it', () => {
    owner.z = 0;
    returnWall.runs = [run({ id: 'return', z: 0, x: 0, width: 100,
      anchors: { left: false, right: true }, ends: { right: { type: 'none' } },
    })];
    const scene = runScene(subject, ownerWall, owner, DEFAULT_SETTINGS);
    expect(scene.cornerPanels).toEqual([]);
    expect(scene.subLabels.get('cc')).toBe('Corner 90');
  });

  it('step b anchor 3: keeps the tall panel when the return covers only the base', () => {
    Object.assign(owner, { cabinetTypeId: CABINET_TYPE_IDS.TALL, z: 0, height: 84 });
    returnWall.runs = [run({ id: 'return', z: 0, x: 0, width: 100,
      anchors: { left: false, right: true }, ends: { right: { type: 'none' } },
    })];
    expect(runScene(subject, ownerWall, owner, DEFAULT_SETTINGS).cornerPanels).toEqual([
      { key: 'corner-panel:left', side: 'left', x: 0, width: 24, columnId: 'cc' },
    ]);
  });

  it('step b anchor 4: draws no panel for filler or none return pieces', () => {
    for (const returnPiece of ['filler', 'none']) {
      owner.ends.left.corner.returnPiece = returnPiece;
      const scene = runScene(subject, ownerWall, owner, DEFAULT_SETTINGS);
      expect(scene.cornerPanels).toEqual([]);
      expect(scene.subLabels.get('cc')).toBe('Corner 90');
    }
  });

  it('step b anchor 7: gives an inactive corner no panel or corner label', () => {
    owner.anchors.left = false;
    const scene = runScene(subject, ownerWall, owner, DEFAULT_SETTINGS);
    expect(scene.cornerPanels).toEqual([]);
    expect(scene.subLabels.has('cc')).toBe(false);
  });

  it('step b anchor 8: preserves the cabinet part key and number from a filler end', () => {
    const corner = partNumbers(subject, DEFAULT_SETTINGS);
    expect(corner.byKey.has('cc')).toBe(true);
    expect(corner.byKey.has('corner-panel:left')).toBe(false);
    owner.ends.left = { type: 'filler', width: null };
    const filler = partNumbers(subject, DEFAULT_SETTINGS);
    expect(filler.byKey.has('cc')).toBe(true);
    expect(runScene(subject, ownerWall, owner, DEFAULT_SETTINGS).cornerPanels).toEqual([]);
    expect(corner.byKey.get('cc')).toBe(1);
    expect(filler.byKey.get('cc')).toBe(filler.byKey.get('run-1:left') + 1);
  });

  it('step c anchor 5: picks the projected face with its true width in the label', () => {
    owner.ends.left.corner = { ...owner.ends.left.corner, kind: 45, depthB: 15 };
    owner.grid.cells[0].node.face = { type: 'door', hinge: 'right' };
    const entry = runScene(subject, ownerWall, owner, DEFAULT_SETTINGS).faceLayouts.get('cc');
    const face = entry.faces[0];
    const drawn = squashRect(face, entry.squash);
    const stack = pickStack(subject, ownerWall, DEFAULT_SETTINGS, {
      x: drawn.x + drawn.width / 2, z: drawn.z + drawn.height / 2,
    });
    const picked = stack.find(({ kind, selection }) => kind === 'face' && selection.pieceId === 'cc');
    expect(picked).toMatchObject({
      rect: { x: drawn.x, z: drawn.z, width: drawn.width, height: drawn.height },
      selection: { runId: owner.id, pieceId: 'cc' }, facePath: face.path,
    });
    expect(picked.label).toContain(formatInches(face.width));
  });

  it('step c anchor 6: excludes the true-only face area while still picking the column', () => {
    owner.ends.left.corner = { ...owner.ends.left.corner, kind: 45, depthB: 15 };
    owner.grid.cells[0].node.face = { type: 'door', hinge: 'right' };
    const entry = runScene(subject, ownerWall, owner, DEFAULT_SETTINGS).faceLayouts.get('cc');
    expect(entry.faces[0].x).toBeLessThan(14);
    expect(entry.faces[0].x + entry.faces[0].width).toBeGreaterThan(14);
    expect(squashRect(entry.faces[0], entry.squash).x).toBeGreaterThan(14);
    const stack = pickStack(subject, ownerWall, DEFAULT_SETTINGS, { x: 14, z: owner.z + owner.height / 2 });
    expect(stack.some(({ kind, selection }) => kind === 'face' && selection.pieceId === 'cc')).toBe(false);
    expect(stack.find(({ kind, selection }) => kind === 'piece' && selection.pieceId === 'cc'))
      .toMatchObject({ rect: { x: 0, width: 36 } });
  });

  describe('CC3.1 step b door-face sizing', () => {
    beforeEach(() => {
      owner.grid.cells[0].node.face = { type: 'door', hinge: 'right' };
    });

    it.each([
      ['8: equal', {}, {}, null, false, 24, 12, 1, 'rule:corner', 25, 10.9375],
      ['9: A long', { doors: 'a_long' }, {}, null, false, 24, 12, 0.0625, 'style', 24.0625, 11.875],
      ['10: explicit equal overrides shop A long', { doors: 'equal' }, { cornerDoors: 'a_long' }, null, false, 24, 12, 1, 'rule:corner', 25, 10.9375],
      ['11: manual wins', {}, {}, 0.5, false, 24, 12, 0.5, 'manual', 24.5, 11.4375],
      ['12: depth-21 return', {}, {}, null, true, 21, 15, 1, 'rule:corner', 22, 13.9375],
    ])('anchor %s', (
      _name, corner, settings, manual, hasReturn, x, width, reveal, source, doorX, doorWidth,
    ) => {
      Object.assign(owner.ends.left.corner, corner);
      if (manual !== null) owner.grid.cells[0].node.reveals = { left: manual };
      if (hasReturn) returnWall.runs = [run({ id: 'return', depth: 21, anchors: { right: true } })];
      const entry = runFaceLayouts(subject, ownerWall, owner, { ...DEFAULT_SETTINGS, ...settings }).get('cc');
      expect(entry.box).toMatchObject({ x, width });
      expect(entry.reveals.values.left).toBe(reveal);
      expect(entry.reveals.sources.left).toBe(source);
      expect(entry.faces[0].x).toBe(doorX);
      expect(entry.faces[0].width).toBe(doorWidth);
    });

    it.each([
      ['13: base', false, 24, 36.0625, 20.241, 15.8215, 15.5625, 0.70711, 24.875],
      ['14: uneven', false, 15, 36.0507, 12.9705, 23.0802, 22.8125, 0.87416, 15.875],
      ['15: upper', true, 12, 24.0625, 8.241, 15.8215, 15.5625, 0.70711, 12.875],
    ])('anchor %s', (_name, upper, depthB, pivot, x, width, doorWidth, k, drawnX) => {
      Object.assign(owner.ends.left.corner, { kind: 45, depthB });
      if (upper) {
        Object.assign(owner, { cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 30, depth: 12 });
        owner.grid.cols[0].size = 24;
      }
      const entry = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc');
      expect(entry.squash.pivot).toBeCloseTo(pivot, 3);
      expect(entry.squash.k).toBeCloseTo(k, 5);
      expect(entry.box.x).toBeCloseTo(x, 3);
      expect(entry.box.width).toBeCloseTo(width, 3);
      expect(entry.faces[0].width).toBeCloseTo(doorWidth, 3);
      expect(entry.reveals.sources).toMatchObject({ left: 'rule:corner', right: 'rule:corner' });
      const drawn = squashRect(entry.box, entry.squash);
      expect(drawn.x).toBeCloseTo(drawnX, 3);
      if (!upper && depthB === 24) expect(drawn.width).toBeCloseTo(11.1875, 3);
    });

    it('anchor 17: pair doors share the ordered span with their centre gap', () => {
      owner.ends.left.corner.kind = 45;
      owner.grid.cells[0].node.face = { type: 'pair_door' };
      const entry = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc');
      expect(entry.faces).toHaveLength(2);
      expect(entry.faces.reduce((total, face) => total + face.width, entry.reveals.values.pair))
        .toBeCloseTo(15.8215 - 2 * 0.1295, 3);
    });

    it('keeps a manual 45 side reveal while applying the computed opposite reveal', () => {
      owner.ends.left.corner.kind = 45;
      owner.grid.cells[0].node.reveals = { left: 0.5 };
      const entry = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc');
      expect(entry.reveals.values.left).toBe(0.5);
      expect(entry.reveals.sources.left).toBe('manual');
      expect(entry.reveals.values.right).toBeCloseTo(0.1295, 3);
      expect(entry.reveals.sources.right).toBe('rule:corner');
    });

    it('uses shop door and reveal settings when the corner has no override', () => {
      const settings = { ...DEFAULT_SETTINGS, cornerDoors: 'a_long', cornerDoorGap: 0.25,
        cornerDiagonalReveal: 1 / 16 };
      expect(cornerEnd(subject, ownerWall, owner, 'left', settings))
        .toMatchObject({ offsetA: 0.875, offsetB: 0.875, doors: 'a_long' });
      expect(runFaceLayouts(subject, ownerWall, owner, settings).get('cc').faces[0].width).toBe(11.875);
      owner.ends.left.corner.doors = 'b_long';
      expect(runFaceLayouts(subject, ownerWall, owner, settings).get('cc').reveals.values.left).toBe(1.125);
      owner.ends.left.corner.kind = 45;
      expect(runFaceLayouts(subject, ownerWall, owner, settings).get('cc').faces[0].width).toBe(15.6875);
    });

    it('takes offset B from the deepest compatible return even with manual depth B', () => {
      owner._doorThickness = 1;
      owner.ends.left.corner.depthB = 15;
      returnWall.runs = [
        run({ id: 'shallow', depth: 21, _doorThickness: 1.5, anchors: { right: true } }),
        run({ id: 'deep', depth: 24, _doorThickness: 0.5, anchors: { right: true } }),
        run({ id: 'upper', cabinetTypeId: CABINET_TYPE_IDS.UPPER, depth: 30,
          _doorThickness: 2, anchors: { right: true } }),
      ];
      expect(cornerEnd(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS))
        .toMatchObject({ depthB: 15, offsetA: 1.0625, offsetB: 0.5625 });
      expect(runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc').reveals.values.left).toBe(0.6875);
      returnWall.runs = [];
      expect(cornerEnd(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS))
        .toMatchObject({ offsetA: 1.0625, offsetB: 1.0625 });
    });

    it('applies leg A corner reveal on the right side of a right-end 90 cabinet', () => {
      owner.grid = run({ items: [auto('a'), fixed('cc', 36)] }).grid;
      owner.grid.cells[1].node.face = { type: 'door', hinge: 'left' };
      owner.anchors = { left: false, right: true };
      owner.ends = { left: { type: 'none' }, right: normalizeCornerEnd({}) };
      ownerWall.connections = { start: null, end: { wallId: 'wall-2', endpoint: 'start' } };
      Object.assign(returnWall, { x1: 144, y1: 0, x2: 144, y2: 144,
        connections: { start: { wallId: 'wall-1', endpoint: 'end' }, end: null } });
      const entry = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc');
      expect(entry.corner).toEqual({ side: 'right', kind: 90 });
      expect(entry.reveals.values.right).toBe(1);
      expect(entry.reveals.sources.right).toBe('rule:corner');
      expect(entry.faces[0].width).toBe(10.9375);
    });
  });
});
