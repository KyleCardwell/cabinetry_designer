import { beforeEach, describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { cornerLegPayload } from '../cornerLegPayload.js';
import { normalizeCornerEnd } from '../cornerEnd.js';
import { squashRect, squashX } from '../cornerSquash.js';
import { runDoorDetails } from '../doorDetails.js';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { faceDrawing, toDrawingPayload } from '../drawingPayload.js';
import { runFillerThickness } from '../planPieces.js';
import { pullOutlines, runPulls } from '../pullLayouts.js';
import { resolveWall } from '../room.js';
import { runScene } from '../runScene.js';

const key = 'corner-leg:wall-1:run-1:left';
const faceId = `${key}:r`;
const rect = ({ x, z, width, height }) => ({ x, z, width, height });

describe('CC5 step d return corner elevation payload', () => {
  let subject, ownerWall, returnWall, owner;
  const settings = { ...DEFAULT_SETTINGS, bumperThickness: 0.125 };
  beforeEach(() => {
    owner = run({ autoCount: false, items: [fixed('cc', 36), auto('a')], _doorThickness: 0.75,
      style: { cabinetStyleId: 13 }, anchors: { left: true, right: false },
      ends: { left: normalizeCornerEnd({}), right: { type: 'none' } },
    });
    owner.grid.cells[0].node.face = { type: 'door', hinge: 'right' };
    owner.grid.cells[0].node.doorStyleId = 'thin';
    ownerWall = wall({ runs: [owner],
      connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null },
    });
    returnWall = wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0,
      connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } },
    });
    subject = room({ walls: [ownerWall, returnWall], wallOrder: ['wall-1', 'wall-2'],
      doorDetails: true, showPulls: true, swingMarks: true,
      doorStyles: [{ ...DEFAULT_DOOR_STYLE, id: 'thin', label: 'Thin', thickness: 0.75 }],
    });
  });
  const payload = () => cornerLegPayload(subject, resolveWall(subject, returnWall), settings);
  const draw = () => faceDrawing(subject, returnWall, 'front', settings);

  it('anchor 1: exports the 90 leg, edge-on panel and B face with their own depths and ids', () => {
    const before = structuredClone(subject);
    const box = runScene(subject, ownerWall, owner, settings).faceLayouts.get('cc').box;
    expect(payload().parts).toEqual([
      { id: key, kind: 'cabinet', runId: owner.id, x: 108, width: 12,
        z: box.z, height: box.height, back: 0, front: 24, coversBoxEdges: false },
      { id: `${key}:panel`, kind: 'end_panel', runId: owner.id, x: 107.1875, width: 0.8125,
        z: owner.z, height: owner.height, back: 0, front: 24, coversBoxEdges: false },
      { id: faceId, kind: 'face', runId: owner.id, x: 108.0625, width: 10.9375,
        z: 4.125, height: 30.125, back: 24.125, front: 24.875, coversBoxEdges: true },
    ]);
    expect(draw().parts).toEqual(expect.arrayContaining(payload().parts));
    expect(subject).toEqual(before);
  });

  it('anchor 2: references drawn faces and keeps pull centres and swing endpoints on the B door', () => {
    const drawing = draw();
    const face = drawing.parts.find(({ id }) => id === faceId);
    const ids = new Set(drawing.parts.map(({ id }) => id));
    for (const collection of ['doorDetails', 'swingMarks', 'pulls']) {
      expect(drawing[collection]).toHaveLength(1);
      expect(drawing[collection][0].partId).toBe(faceId);
      for (const { partId } of drawing[collection]) expect(ids.has(partId)).toBe(true);
    }
    const outline = drawing.pulls[0].outlines[0];
    const cx = outline.reduce((sum, [x]) => sum + x, 0) / outline.length;
    const cz = outline.reduce((sum, [, z]) => sum + z, 0) / outline.length;
    expect(cx).toBeGreaterThan(face.x);
    expect(cx).toBeLessThan(face.x + face.width);
    expect(cz).toBeGreaterThan(face.z);
    expect(cz).toBeLessThan(face.z + face.height);
    expect(drawing.swingMarks[0].lines).toEqual([
      { x1: face.x, z1: face.z + face.height / 2, x2: face.x + face.width, z2: face.z + face.height },
      { x1: face.x, z1: face.z + face.height / 2, x2: face.x + face.width, z2: face.z },
    ]);
  });

  it('anchor 3: exports the 45 projection with squashed details and pull centres', () => {
    owner.ends.left.corner.kind = 45;
    const scene = runScene(subject, ownerWall, owner, settings);
    const { squash } = scene.faceLayouts.get('cc').cornerReturn;
    const details = runDoorDetails(subject, ownerWall, owner, settings, scene);
    const trueDetail = details.parts.find(({ key }) => key === 'cc:r');
    const truePull = runPulls(subject, ownerWall, owner, settings, scene, details).pulls
      .find(({ partId }) => partId === 'cc:r');
    const drawing = draw();
    const face = drawing.parts.find(({ id }) => id === faceId);
    expect(face.x).toBeCloseTo(108.0291, 4);
    expect(face.width).toBeCloseTo(11.0043, 4);
    expect(face).toMatchObject({ back: 24.125, front: 24.875 });
    expect(drawing.doorDetails[0]).toEqual({ partId: faceId,
      openings: trueDetail.openings.map((entry) => rect(squashRect(entry, squash))),
      ...(trueDetail.lines.length ? { profileLines: trueDetail.lines.map((entry) => rect(squashRect(entry, squash))) } : {}),
      ...(trueDetail.miters.length ? { miters: trueDetail.miters.map((entry) => ({ ...entry,
        x1: squashX(entry.x1, squash), x2: squashX(entry.x2, squash) })) } : {}),
    });
    const dx = squashX(truePull.centers[0].x, squash) - truePull.centers[0].x;
    expect(drawing.pulls[0]).toEqual({ partId: faceId,
      outlines: pullOutlines(truePull).map((outline) => outline.map(([x, ...rest]) => [x + dx, ...rest])),
    });
  });

  it('anchor 4: exports a face-on filler and omits the panel when a return run covers it', () => {
    owner.ends.left.corner.returnPiece = 'filler';
    expect(payload().parts.find(({ id }) => id === `${key}:panel`)).toEqual({
      id: `${key}:panel`, kind: 'filler', runId: owner.id, x: 106.5, width: 1.5,
      z: owner.z, height: owner.height, front: 24,
      back: 24 - runFillerThickness(subject, ownerWall, owner, settings), coversBoxEdges: true,
    });
    owner.ends.left.corner.returnPiece = 'none';
    returnWall.runs = [run({ id: 'return', anchors: { left: false, right: true } })];
    expect(payload().parts.some(({ id }) => id === `${key}:panel`)).toBe(false);
  });

  it('anchor 5: exports an explicit B panel as a face without a pull', () => {
    owner.ends.left.corner.legBFace = 'panel';
    expect(payload().parts.find(({ id }) => id === faceId)).toMatchObject({ kind: 'face' });
    expect(payload().pulls).toEqual([]);
  });

  it('anchor 6: excludes the owner face, opposite return face and inactive corners', () => {
    const empty = { parts: [], doorDetails: [], swingMarks: [], pulls: [] };
    expect(cornerLegPayload(subject, resolveWall(subject, ownerWall), settings)).toEqual(empty);
    expect(cornerLegPayload(subject, resolveWall(subject, returnWall, 'back'), settings)).toEqual(empty);
    owner.anchors.left = false;
    expect(payload()).toEqual(empty);
  });

  it('anchor 7: includes the leg once with unique ids in a combined return elevation', () => {
    const continuation = wall({ id: 'wall-3', x1: 0, y1: 288, x2: 0, y2: 144, elevationForced: true });
    subject.walls.push(continuation);
    subject.wallOrder.push(continuation.id);
    subject.combinedElevations = [{ id: 'combined', on: true, faces: ['wall-3', 'wall-2'] }];
    const elevation = toDrawingPayload(subject, settings).elevations.find(({ faces }) => faces?.length === 2);
    expect(elevation).toBeDefined();
    const parts = elevation.parts.filter(({ id }) => id.startsWith(key));
    expect(parts).toHaveLength(3);
    expect(parts.find(({ id }) => id === key).x).toBe(252);
    expect(new Set(elevation.parts.map(({ id }) => id)).size).toBe(elevation.parts.length);
    for (const collection of ['doorDetails', 'swingMarks', 'pulls']) {
      expect(elevation[collection].filter(({ partId }) => partId === faceId)).toHaveLength(1);
    }
  });

  it('anchor 8: adds no records to rooms without corner ends', () => {
    owner.ends.left = { type: 'none' };
    expect(payload()).toEqual({ parts: [], doorDetails: [], swingMarks: [], pulls: [] });
    expect(draw().parts.some(({ id }) => id.startsWith('corner-leg:'))).toBe(false);
  });

  it('obeys drawing switches, tag-only details and the glass opening field rules', () => {
    const parts = payload().parts;
    Object.assign(subject, { doorDetails: false, showPulls: false, swingMarks: false });
    expect(payload()).toEqual({ parts, doorDetails: [], swingMarks: [], pulls: [] });
    subject.doorStyleTags = true;
    expect(payload().doorDetails).toEqual([{ partId: faceId, tag: 'Thin' }]);
    Object.assign(subject, { doorDetails: true, doorStyleTags: false });
    owner.grid.cells[0].node.face.panelMaterial = 'glass';
    expect(payload().doorDetails.every((entry) => !('openings' in entry))).toBe(true);
  });

  it('re-prefixes split and paired face ids and never references open faces', () => {
    subject.doorStyleTags = true;
    owner.grid.cells[0].node.face = { direction: 'vertical', children: [
      { type: 'pair_door', size: 12 }, { type: 'open', size: null },
    ] };
    const drawing = payload();
    const ids = drawing.parts.filter(({ kind }) => kind === 'face').map(({ id }) => id);
    expect(ids).toEqual([`${key}:r.0left`, `${key}:r.0right`]);
    for (const collection of ['doorDetails', 'swingMarks', 'pulls']) {
      expect(drawing[collection].map(({ partId }) => partId)).toEqual(ids);
    }
  });
});
