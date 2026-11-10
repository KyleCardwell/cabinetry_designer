import { beforeEach, describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { cornerEnd, normalizeCornerEnd } from '../cornerEnd.js';
import { cornerReturnFootprint, cornerReturnPoint } from '../corners.js';
import { cornerReturnLegs } from '../cornerLegs.js';
import { squashRect, squashX } from '../cornerSquash.js';
import { runDoorDetails } from '../doorDetails.js';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { elevationPartNumbers } from '../elevationPartNumbers.js';
import { flipHinges } from '../faces.js';
import { runFaceLayouts } from '../faceLayouts.js';
import { rootItems } from '../grid.js';
import { partNumbers, wallBadgeGroups } from '../partNumbers.js';
import { runPulls } from '../pullLayouts.js';
import { runScene } from '../runScene.js';
import { wallSideView, wallViewForRun } from '../wallSides.js';

describe('CC4 return leg layout', () => {
  let subject, ownerWall, returnWall, owner;
  beforeEach(() => {
    owner = run({ autoCount: false, items: [fixed('cc', 36), auto('a')],
      style: { cabinetStyleId: 13 }, anchors: { left: true, right: false },
      ends: { left: normalizeCornerEnd({}), right: { type: 'none' } },
    });
    owner.grid.cells[0].node.face = { type: 'door', hinge: 'right' };
    ownerWall = wall({ runs: [owner],
      connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null },
    });
    returnWall = wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0,
      connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } },
    });
    subject = room({ walls: [ownerWall, returnWall] });
  });

  it('anchor 1: lays out the 90 return face at true size on wall-2', () => {
    const entry = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc');
    const { legB } = entry.cornerReturn;
    expect(entry.cornerReturn).toMatchObject({
      wallId: 'wall-2', wallSide: 'front', at: 144, dir: -1, squash: null,
    });
    expect(legB.box).toMatchObject({ x: 108, width: 12, z: entry.box.z, height: entry.box.height });
    expect(legB.reveals.values.right).toBe(1);
    expect(legB.reveals.sources.right).toBe('rule:corner');
    expect(legB.reveals.values.left).toBe(entry.reveals.values.right);
    expect(legB.reveals.sources.left).toBe(entry.reveals.sources.right);
    expect(legB.faces).toHaveLength(1);
    expect(legB.faces[0]).toMatchObject({ x: 108.0625, width: 10.9375, hinge: 'left' });
    expect(legB.openings).toHaveLength(1);
    expect(legB.warnings).toEqual([]);
    expect(cornerEnd(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS)).not.toHaveProperty('cornerReturn');
  });

  it('anchor 2: respects which door runs long', () => {
    for (const [doors, width] of [['b_long', 11.875], ['a_long', 10.9375]]) {
      owner.ends.left.corner.doors = doors;
      const entry = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc');
      expect(entry.cornerReturn.legB.faces[0].width).toBe(width);
      if (doors === 'b_long') {
        expect(entry.cornerReturn.legB.reveals.sources.right).toBe(entry.reveals.sources.right);
      }
    }
  });

  it('anchor 3: overrides the inherited tree with one panel or a full-height door', () => {
    owner.ends.left.corner.legBFace = 'panel';
    let entry = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc');
    expect(entry.cornerReturn.legB.faces).toHaveLength(1);
    expect(entry.cornerReturn.legB.faces[0]).toMatchObject({ type: 'panel', width: 10.9375 });
    owner.ends.left.corner.legBFace = 'door';
    owner.grid.cells[0].node.face = { direction: 'vertical', children: [
      { type: 'drawer_front', size: 6 }, { type: 'door', size: null },
    ] };
    entry = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc');
    expect(entry.faces).toHaveLength(2);
    expect(entry.cornerReturn.legB.faces).toHaveLength(1);
    expect(entry.cornerReturn.legB.faces[0]).toMatchObject({ type: 'door', width: 10.9375,
      height: entry.box.height - entry.reveals.values.top - entry.reveals.values.bottom });
  });

  it('anchor 4: hinges an unspecified B door away from the corner', () => {
    delete owner.grid.cells[0].node.face.hinge;
    const { legB } = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc').cornerReturn;
    expect(legB.faces[0]).toMatchObject({ hinge: 'left', hingeRule: true });
  });

  it('anchor 5: keeps depth A for the return box beside a depth-21 return run', () => {
    returnWall.runs = [run({ id: 'return', depth: 21, anchors: { left: false, right: true } })];
    const { legB } = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc').cornerReturn;
    expect(legB.box).toMatchObject({ x: 108, width: 12 });
    expect(legB.faces[0].width).toBe(10.9375);
  });

  it('anchor 6: squashes the true base 45 face onto the return wall', () => {
    owner.ends.left.corner.kind = 45;
    const entry = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc');
    const { legB, squash } = entry.cornerReturn;
    expect(legB).toBeNull();
    expect(squash.from).toBeCloseTo(36.2125, 4);
    expect(squash.pivot).toBeCloseTo(118.975, 3);
    expect(squash.k).toBeCloseTo(0.70711, 5);
    const drawn = squashRect(entry.box, squash);
    expect(drawn.x).toBeCloseTo(107.7875, 4);
    expect(drawn.width).toBeCloseTo(11.1875, 4);
    expect(drawn.x + drawn.width).toBeCloseTo(118.975, 3);
  });

  it('anchor 7: projects an uneven 45 with depth B 15', () => {
    Object.assign(owner.ends.left.corner, { kind: 45, depthB: 15 });
    const entry = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc');
    const { squash } = entry.cornerReturn;
    expect(squash.pivot).toBeCloseTo(119.0518, 4);
    expect(squash.k).toBeCloseTo(0.49614, 5);
    expect(squashRect(entry.box, squash).x).toBeCloseTo(107.6018, 4);
    expect(squashRect(entry.box, squash).width).toBeCloseTo(11.4500, 4);
  });

  it('anchor 8: projects an upper 45 with its original box height', () => {
    Object.assign(owner, { cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 30, depth: 12 });
    owner.grid.cols[0].size = 24;
    owner.ends.left.corner.kind = 45;
    const entry = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc');
    expect(entry.cornerReturn.squash.pivot).toBeCloseTo(130.975, 3);
    const drawn = squashRect(entry.box, entry.cornerReturn.squash);
    expect(drawn.x).toBeCloseTo(119.7875, 4);
    expect(drawn.width).toBeCloseTo(11.1875, 4);
    expect(drawn).toMatchObject({ z: 54, height: 30 });
  });

  it('anchor 9: omits the return layout and point for an inactive end', () => {
    owner.anchors.left = false;
    expect(runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc')).not.toHaveProperty('cornerReturn');
    expect(cornerReturnPoint(subject, ownerWall, owner, 'left')).toBeNull();
  });

  it('anchor 10: supports a distinct source pivot and shares the CC2 return origin', () => {
    expect(squashX(30, { from: 36, pivot: 100, k: 0.5 })).toBe(97);
    expect(squashX(30, { pivot: 36, k: 0.5 })).toBe(33);
    expect(cornerReturnPoint(subject, ownerWall, owner, 'left')).toEqual({
      wallId: 'wall-2', wallSide: 'front', at: 144, dir: -1,
    });
    const hostRun = run({ id: 'host-run', x: 0, width: 72, autoCount: false,
      items: [auto('a'), fixed('cc', 36)], anchors: { left: false, right: { to: 'wall', wallId: 'pen' } },
      ends: { left: { type: 'none' }, right: normalizeCornerEnd({ corner: { kind: 45 } }) },
    });
    const host = wall({ id: 'host', x1: 0, y1: 0, x2: 144, y2: 0, thickness: 4.5, runs: [hostRun] });
    const pen = wall({ id: 'pen', x1: 72, y1: 0, x2: 72, y2: 48, thickness: 4.5,
      connections: { start: null, end: null },
      landings: { start: { wallId: 'host', side: 'front', ref: 'left', to: 'near', offset: 72 }, end: null },
    });
    const peninsula = room({ walls: [host, pen] });
    const point = cornerReturnPoint(peninsula, host, hostRun, 'right');
    const footprint = cornerReturnFootprint(peninsula, host, hostRun, 'right', DEFAULT_SETTINGS);
    expect(point).toMatchObject({ wallId: 'pen', wallSide: footprint.wallSide });
    expect(point.at).toBe(point.dir === 1 ? footprint.x0 : footprint.x1);
  });

  it('copies every face node while flipping only left/right hinges and preserving split order', () => {
    const tree = { direction: 'horizontal', children: [
      { type: 'door', size: 4, hinge: 'left' },
      { direction: 'vertical', children: [
        { type: 'door', size: 6, hinge: 'right' },
        { type: 'door', size: null, hinge: 'top' },
        { type: 'door', size: null, hinge: 'bottom' },
        { type: 'panel', size: null },
      ] },
    ] };
    const original = structuredClone(tree);
    const flipped = flipHinges(tree);
    expect(flipped.children[0]).toEqual({ type: 'door', size: 4, hinge: 'right' });
    expect(flipped.children[1].children.map((node) => node.hinge)).toEqual(['left', 'top', 'bottom', undefined]);
    expect(flipHinges(flipped)).toEqual(original);
    expect(flipped).not.toBe(tree);
    expect(flipped.children[1].children[3]).not.toBe(tree.children[1].children[3]);
    expect(tree).toEqual(original);
  });

  it('carries manual far and vertical reveals while replacing the corner-side manual reveal', () => {
    owner.grid.cells[0].node.reveals = { left: 0.5, right: 0.25, top: 0.375, bottom: 0.125 };
    const entry = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc');
    const { reveals } = entry.cornerReturn.legB;
    expect(reveals.values).toMatchObject({ left: 0.25, right: 1, top: 0.375, bottom: 0.125 });
    expect(reveals.sources).toMatchObject({ left: 'manual', right: 'rule:corner', top: 'manual', bottom: 'manual' });
    owner.ends.left.corner.doors = 'b_long';
    const next = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc').cornerReturn.legB;
    expect(next.reveals.values).toMatchObject({ left: 0.25, right: 0.25 });
    expect(next.reveals.sources).toMatchObject({ left: 'manual', right: 'manual' });
  });

  it('inherits matched and grown fronts once, preserving paths, heights and explicit hinges', () => {
    owner.top = 'wood';
    owner.grid.cells[0].node.face = { direction: 'vertical', size: null, children: [
      { type: 'drawer_front', size: null, match: 'standard' },
      { direction: 'horizontal', size: null, children: [
        { type: 'door', size: 4, hinge: 'left' }, { type: 'door', size: null, hinge: 'right' },
      ] },
    ] };
    const stored = structuredClone(owner.grid.cells[0].node.face);
    const entry = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc');
    const legB = entry.cornerReturn.legB;
    expect(entry.faces[0].height).toBe(6);
    expect(legB.faces.map(({ path, z, height }) => ({ path, z, height })))
      .toEqual(entry.faces.map(({ path, z, height }) => ({ path, z, height })));
    expect(legB.faces.slice(1).map(({ hinge }) => hinge)).toEqual(['right', 'left']);
    expect(owner.grid.cells[0].node.face).toEqual(stored);
  });

  it('recomputes inset square paths and applies each inherited face thickness on B', () => {
    owner.style.cabinetStyleId = 14;
    subject.doorStyles = [{ ...DEFAULT_DOOR_STYLE, id: 'thick', label: 'Thick', thickness: 1 }];
    owner.grid.cells[0].node.face = { direction: 'vertical', children: [
      { type: 'door', size: 12, hinge: 'right', styleId: 'thick' },
      { type: 'open', size: null },
    ] };
    const entry = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc');
    const legB = entry.cornerReturn.legB;
    expect(legB.faces[0]).toMatchObject({ thickness: 1, hinge: 'left', path: 'r.0' });
    expect(legB.faces.map(({ z, height }) => ({ z, height })))
      .toEqual(entry.faces.map(({ z, height }) => ({ z, height })));
    expect(legB.reveals.values.squarePaths.has('r.1')).toBe(true);
    expect(legB.reveals.values.squarePaths).not.toBe(entry.reveals.values.squarePaths);
    expect(legB.openings).toHaveLength(entry.openings.length);
  });

  it('lays out a right-end return with its corner on the left and its default hinge on the right', () => {
    owner.grid = run({ items: [auto('a'), fixed('cc', 36)] }).grid;
    owner.grid.cells[1].node.face = { type: 'door' };
    owner.anchors = { left: false, right: true };
    owner.ends = { left: { type: 'none' }, right: normalizeCornerEnd({}) };
    ownerWall.connections = { start: null, end: { wallId: 'wall-2', endpoint: 'start' } };
    Object.assign(returnWall, { x1: 144, y1: 0, x2: 144, y2: 144,
      connections: { start: { wallId: 'wall-1', endpoint: 'end' }, end: null } });
    const { at, dir, legB } = runFaceLayouts(subject, ownerWall, owner, DEFAULT_SETTINGS).get('cc').cornerReturn;
    expect({ at, dir }).toEqual({ at: 0, dir: 1 });
    expect(legB.box).toMatchObject({ x: 24, width: 12 });
    expect(legB.reveals.values.left).toBe(1);
    expect(legB.reveals.sources.left).toBe('rule:corner');
    expect(legB.faces[0]).toMatchObject({ x: 25, width: 10.9375, hinge: 'right', hingeRule: true });
  });

  describe('step b cornerReturnLegs', () => {
    it('anchor 1: returns the 90 leg, return panel and true-size face on wall-2', () => {
      const legs = cornerReturnLegs(subject, wallSideView(returnWall), DEFAULT_SETTINGS);
      const entry = runScene(subject, ownerWall, owner, DEFAULT_SETTINGS).faceLayouts.get('cc');
      expect(legs).toHaveLength(1);
      expect(legs[0]).toMatchObject({
        key: 'corner-leg:wall-1:run-1:left', ownerWallId: 'wall-1', runId: 'run-1',
        side: 'left', columnId: 'cc', kind: 90, label: 'Corner 90',
        rect: { x: 108, width: 12, z: entry.box.z, height: entry.box.height },
        returnPanel: { type: 'end_panel', x: 107.1875, width: 0.8125, z: owner.z, height: owner.height },
        faceLayout: { faces: [{ x: 108.0625, width: 10.9375 }] },
      });
      expect(legs[0].faceLayout).toEqual(entry.cornerReturn.legB);
    });

    it('anchor 2: details the B door and places a pull of the same size as A', () => {
      const original = structuredClone(subject);
      const leg = cornerReturnLegs(subject, returnWall, DEFAULT_SETTINGS)[0];
      const face = leg.faceLayout.faces[0];
      expect(leg.doorDetails.parts).toHaveLength(1);
      expect(leg.doorDetails.parts[0]).toMatchObject({ pieceId: 'cc', x: face.x, width: face.width });
      expect(leg.pulls).toHaveLength(1);
      const pull = leg.pulls[0];
      expect(pull.pieceId).toBe('cc');
      expect(pull.centers[0].x).toBeGreaterThan(face.x);
      expect(pull.centers[0].x).toBeLessThan(face.x + face.width);
      expect(pull.along).toBe(runPulls(subject, ownerWall, owner, DEFAULT_SETTINGS).pulls[0].along);
      expect(subject).toEqual(original);
    });

    it('anchor 3: excludes the owner face, opposite return face and inactive corners', () => {
      expect(cornerReturnLegs(subject, ownerWall, DEFAULT_SETTINGS)).toEqual([]);
      expect(cornerReturnLegs(subject, wallSideView(returnWall, 'back'), DEFAULT_SETTINGS)).toEqual([]);
      owner.anchors.left = false;
      expect(cornerReturnLegs(subject, returnWall, DEFAULT_SETTINGS)).toEqual([]);
    });

    it('anchor 4: projects the 45 face, details and pull centres from their true owner layout', () => {
      owner.ends.left.corner.kind = 45;
      const scene = runScene(subject, ownerWall, owner, DEFAULT_SETTINGS);
      const entry = scene.faceLayouts.get('cc');
      const leg = cornerReturnLegs(subject, returnWall, DEFAULT_SETTINGS)[0];
      const face = leg.faceLayout.faces[0];
      expect(leg.label).toBe('Corner 45');
      expect(leg.rect).toEqual({ x: 108, width: 12, z: entry.box.z, height: entry.box.height });
      expect(face.x).toBeCloseTo(107.8791, 4);
      // The anchor uses k rounded to 0.70711; the model keeps the full-precision projection.
      expect(Math.abs(face.width - 11.0044)).toBeLessThan(0.0001);
      expect(face.trueWidth).toBe(15.5625);
      expect(leg.faceLayout.box).toEqual(squashRect(entry.box, entry.cornerReturn.squash));
      expect(leg.faceLayout.openings).toEqual(entry.openings.map((rect) => squashRect(rect, entry.cornerReturn.squash)));
      const details = runDoorDetails(subject, ownerWall, owner, DEFAULT_SETTINGS, scene);
      expect(leg.doorDetails.parts).toHaveLength(1);
      const part = leg.doorDetails.parts[0];
      const truePart = details.parts.find(({ pieceId }) => pieceId === 'cc');
      expect(part).toMatchObject({ pieceId: 'cc', x: face.x, width: face.width });
      expect(part.openings).toEqual(truePart.openings.map((rect) => squashRect(rect, entry.cornerReturn.squash)));
      expect(part.lines).toEqual(truePart.lines.map((rect) => squashRect(rect, entry.cornerReturn.squash)));
      const truePull = runPulls(subject, ownerWall, owner, DEFAULT_SETTINGS, scene, details).pulls
        .find(({ pieceId }) => pieceId === 'cc');
      expect(leg.pulls).toHaveLength(1);
      expect(leg.pulls[0]).toEqual({ ...truePull,
        centers: truePull.centers.map((center) => ({ ...center, x: squashX(center.x, entry.cornerReturn.squash) })),
      });
    });

    it('anchor 5: omits a return panel covered by a return run', () => {
      returnWall.runs = [run({ id: 'return', anchors: { left: false, right: true } })];
      expect(cornerReturnLegs(subject, returnWall, DEFAULT_SETTINGS)[0].returnPanel).toBeNull();
    });

    it('anchor 6: draws a return filler face-on beyond leg B', () => {
      owner.ends.left.corner.returnPiece = 'filler';
      expect(cornerReturnLegs(subject, returnWall, DEFAULT_SETTINGS)[0].returnPanel).toEqual({
        type: 'filler', x: 106.5, width: 1.5, z: owner.z, height: owner.height,
      });
    });

    it('anchor 7: lays out an explicit panel without pulls', () => {
      owner.ends.left.corner.legBFace = 'panel';
      const leg = cornerReturnLegs(subject, returnWall, DEFAULT_SETTINGS)[0];
      expect(leg.faceLayout.faces).toHaveLength(1);
      expect(leg.faceLayout.faces[0].type).toBe('panel');
      expect(leg.doorDetails.parts[0].faceType).toBe('panel');
      expect(leg.pulls).toEqual([]);
    });

    it('anchor 8: badges the leg with its owner column number, including elevation DXF', () => {
      const view = wallSideView(returnWall);
      const leg = cornerReturnLegs(subject, view, DEFAULT_SETTINGS)[0];
      const group = wallBadgeGroups(subject, view, DEFAULT_SETTINGS).find(({ key }) => key === leg.key);
      expect(group).toEqual({ key: leg.key, lift: 0, pieces: [{ id: 'cc', ...leg.rect }] });
      const ownerPiece = wallBadgeGroups(subject, wallSideView(ownerWall), DEFAULT_SETTINGS)
        .flatMap(({ pieces }) => pieces).find(({ id }) => id === 'cc');
      const { byKey } = partNumbers(subject, DEFAULT_SETTINGS);
      expect(byKey.get(group.pieces[0].id)).toBe(byKey.get(ownerPiece.id));
      expect(byKey.has(leg.key)).toBe(false);
      const badge = elevationPartNumbers(subject, returnWall, 'front', DEFAULT_SETTINGS).find(({ key }) => key === 'cc');
      expect(badge).toMatchObject({ text: String(byKey.get('cc')), x: 114, z: owner.z + owner.height / 2 });
    });

    it('uses the flipped stored tree for face style and pull overrides on both grid and items', () => {
      subject.doorStyles = [{ ...DEFAULT_DOOR_STYLE, id: 'b-style', label: 'B style' }];
      owner.grid.cells[0].node.face = { direction: 'vertical', children: [
        { type: 'drawer_front', size: 6, styleId: 'b-style', pullId: 'none' },
        { type: 'door', size: null, hinge: 'right', styleId: 'b-style', pullOrientation: 'horizontal' },
      ] };
      owner.items = rootItems(owner.grid);
      const original = structuredClone(subject);
      const leg = cornerReturnLegs(subject, returnWall, DEFAULT_SETTINGS)[0];
      expect(leg.doorDetails.parts.map(({ styleId }) => styleId)).toEqual(['b-style', 'b-style']);
      expect(leg.pulls).toHaveLength(1);
      expect(leg.pulls[0]).toMatchObject({ path: 'r.1', orientation: 'horizontal' });
      const face = leg.faceLayout.faces[1];
      expect(face.hinge).toBe('left');
      expect(leg.pulls[0].centers[0].x).toBeGreaterThan(face.x + face.width / 2);
      expect(subject).toEqual(original);
      owner.ends.left.corner.legBFace = 'door';
      const overridden = cornerReturnLegs(subject, returnWall, DEFAULT_SETTINGS)[0];
      expect(overridden.doorDetails.parts).toHaveLength(1);
      expect(overridden.doorDetails.parts[0].styleId).toBe(DEFAULT_DOOR_STYLE.id);
      expect(overridden.pulls[0]).toMatchObject({ path: 'r', orientation: 'vertical' });
    });

    it('resolves styles and pulls on the owner wall, even when the return face has different picks', () => {
      subject.doorStyles = [{ ...DEFAULT_DOOR_STYLE, id: 'owner-style', label: 'Owner style' }];
      ownerWall.doorStyleId = 'owner-style';
      returnWall.doorStyleId = 'default';
      ownerWall.doorPullId = 'none';
      for (const kind of [90, 45]) {
        owner.ends.left.corner.kind = kind;
        const leg = cornerReturnLegs(subject, returnWall, DEFAULT_SETTINGS)[0];
        expect(leg.doorDetails.parts[0].styleId).toBe('owner-style');
        expect(leg.pulls).toEqual([]);
      }
    });

    it('skips invalid corner columns without a return face layout', () => {
      owner.ends.left.corner.legB = 20;
      expect(cornerReturnLegs(subject, returnWall, DEFAULT_SETTINGS)).toEqual([]);
    });

    it('draws a right-end leg and return panel in the positive return direction', () => {
      owner.grid = run({ items: [auto('a'), fixed('cc', 36)] }).grid;
      owner.anchors = { left: false, right: true };
      owner.ends = { left: { type: 'none' }, right: normalizeCornerEnd({}) };
      ownerWall.connections = { start: null, end: { wallId: 'wall-2', endpoint: 'start' } };
      Object.assign(returnWall, { x1: 144, y1: 0, x2: 144, y2: 144,
        connections: { start: { wallId: 'wall-1', endpoint: 'end' }, end: null } });
      const leg = cornerReturnLegs(subject, wallSideView(returnWall), DEFAULT_SETTINGS)[0];
      expect(leg).toMatchObject({ side: 'right', key: 'corner-leg:wall-1:run-1:right',
        rect: { x: 24, width: 12 }, returnPanel: { x: 36, width: 0.8125 },
      });
      expect(leg.faceLayout).toEqual(runScene(subject, wallViewForRun(ownerWall, owner), owner, DEFAULT_SETTINGS)
        .faceLayouts.get('cc').cornerReturn.legB);
    });
  });
});
