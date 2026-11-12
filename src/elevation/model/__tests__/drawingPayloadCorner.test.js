import { beforeEach, describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { normalizeCornerEnd } from '../cornerEnd.js';
import { squashRect, squashX } from '../cornerSquash.js';
import { runDoorDetails } from '../doorDetails.js';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { faceDrawing } from '../drawingPayload.js';
import { elevationDoorDetails } from '../elevationDoorDetails.js';
import { elevationPulls, pullOutlines, runPulls } from '../pullLayouts.js';
import { runScene } from '../runScene.js';
import { wallShowThrough } from '../showThrough.js';
import { elevationSwingMarks, runSwingMarks } from '../swingMarks.js';

const ROUND = {
  id: 'round', name: 'Round 1/4', kind: 'door_outside', version: 1, archived: false,
  drawnPoints: { elevation: ['a'] },
  geometry: {
    units: 'in', points: { a: [0.25, 0], b: [0, -0.25], c: [0, -0.75] },
    loops: [{ id: 'L1', closed: false, segs: [
      { type: 'arc', from: 'a', to: 'b', center: [0.25, -0.25], ccw: true },
      { type: 'line', from: 'b', to: 'c' },
    ] }],
  },
};
const rect = ({ x, z, width, height }) => ({ x, z, width, height });

describe('owner corner elevation payload (CC5)', () => {
  let subject, ownerWall, returnWall, owner;
  const settings = { ...DEFAULT_SETTINGS, bumperThickness: 0.125, sectionProfiles: [ROUND] };
  beforeEach(() => {
    owner = run({ autoCount: false, items: [fixed('cc', 36), auto('a')], _doorThickness: 0.75,
      style: { cabinetStyleId: 13 }, anchors: { left: true, right: false },
      ends: { left: normalizeCornerEnd({ corner: { kind: 45 } }), right: { type: 'none' } },
    });
    owner.grid.cells[0].node.face = { type: 'door', hinge: 'left' };
    owner.grid.cells[0].node.doorStyleId = 'thin';
    ownerWall = wall({ runs: [owner],
      connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null },
    });
    returnWall = wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0,
      connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } },
    });
    subject = room({ walls: [ownerWall, returnWall], doorDetails: true, showPulls: true, swingMarks: true,
      doorStyles: [{ ...DEFAULT_DOOR_STYLE, id: 'thin', label: 'Thin', thickness: 0.75,
        profiles: { ...DEFAULT_DOOR_STYLE.profiles, outside: ROUND.id } }],
    });
  });
  const draw = () => faceDrawing(subject, ownerWall, 'front', settings);
  const scene = () => runScene(subject, ownerWall, owner, settings);

  it('projects the 45 face while keeping the cabinet at its full leg A width', () => {
    const before = structuredClone(subject);
    const drawing = draw();
    const face = drawing.parts.find(({ id }) => id === 'cc:r');
    const trueFace = scene().faceLayouts.get('cc').faces[0];
    expect(face).toMatchObject({ kind: 'face', back: 24.125, front: 24.875,
      z: trueFace.z, height: trueFace.height });
    expect(face.x).toBeCloseTo(24.9666, 4);
    expect(face.width).toBeCloseTo(11.0043, 4);
    expect(drawing.parts.find(({ id }) => id === 'cc'))
      .toMatchObject({ kind: 'cabinet', x: 0, width: 36, back: 0, front: 24 });
    expect(subject).toEqual(before);
  });

  it('projects all detail geometry and swing edges but preserves pull outline size', () => {
    const sourceScene = scene();
    const { squash } = sourceScene.faceLayouts.get('cc');
    const trueDetails = runDoorDetails(subject, ownerWall, owner, settings, sourceScene);
    const detail = trueDetails.parts.find(({ key }) => key === 'cc:r');
    const truePull = runPulls(subject, ownerWall, owner, settings, sourceScene, trueDetails)
      .pulls.find(({ partId }) => partId === 'cc:r');
    const before = structuredClone({ sourceScene, trueDetails, truePull });
    const drawing = draw();
    expect(squashRect(detail, squash).x).toBeCloseTo(24.9666, 4);
    expect(squashRect(detail, squash).width).toBeCloseTo(11.0043, 4);
    expect(detail.openings.length).toBeGreaterThan(0);
    expect(detail.lines.length).toBeGreaterThan(0);
    expect(detail.miters.length).toBeGreaterThan(0);
    expect(drawing.doorDetails.find(({ partId }) => partId === 'cc:r')).toEqual({
      partId: 'cc:r',
      openings: detail.openings.map((entry) => rect(squashRect(entry, squash))),
      profileLines: detail.lines.map((entry) => rect(squashRect(entry, squash))),
      miters: detail.miters.map((entry) => ({ ...entry,
        x1: squashX(entry.x1, squash), x2: squashX(entry.x2, squash) })),
    });
    const trueOutline = pullOutlines(truePull)[0];
    const dx = squashX(truePull.centers[0].x, squash) - truePull.centers[0].x;
    expect(drawing.pulls.find(({ partId }) => partId === 'cc:r')).toEqual({ partId: 'cc:r',
      outlines: [trueOutline.map(([x, ...rest]) => [x + dx, ...rest])],
    });
    const face = drawing.parts.find(({ id }) => id === 'cc:r');
    expect(drawing.swingMarks.find(({ partId }) => partId === 'cc:r')).toEqual({ partId: 'cc:r', lines: [
      { x1: face.x, z1: face.z + face.height / 2, x2: face.x + face.width, z2: face.z + face.height },
      { x1: face.x, z1: face.z + face.height / 2, x2: face.x + face.width, z2: face.z },
    ] });
    expect({ sourceScene, trueDetails, truePull }).toEqual(before);
  });

  it('projects glass holes and marks with the face, independent of door detail visibility', () => {
    owner.grid.cells[0].node.face.panelMaterial = 'glass';
    const { squash } = scene().faceLayouts.get('cc');
    const [glass] = wallShowThrough(subject, ownerWall, 'front', settings).get('cc').glass;
    expect(glass.openings.length).toBeGreaterThan(0);
    expect(glass.marks).toHaveLength(3);
    for (const details of [true, false]) {
      subject.doorDetails = details;
      const drawing = draw();
      const face = drawing.parts.find(({ id }) => id === 'cc:r');
      expect(face.holes).toEqual(glass.openings.map((entry) => squashRect(entry, squash)));
      const marks = drawing.glassMarks.find(({ partId }) => partId === 'cc:r');
      expect(marks.lines).toEqual(glass.marks.map((entry) => ({ ...entry,
        x1: squashX(entry.x1, squash), x2: squashX(entry.x2, squash) })));
      for (const hole of face.holes) {
        expect(hole.x).toBeGreaterThan(face.x);
        expect(hole.x + hole.width).toBeLessThan(face.x + face.width);
      }
      for (const { x1, x2 } of marks.lines) {
        expect(Math.min(x1, x2)).toBeGreaterThan(face.x);
        expect(Math.max(x1, x2)).toBeLessThan(face.x + face.width);
      }
      expect(drawing.interiors.find(({ partId }) => partId === 'cc')).toEqual({ partId: 'cc',
        lines: [
          { x1: 0.8125, z1: 18.875, x2: 35.1875, z2: 18.875 },
          { x1: 35.1875, z1: 18.875, x2: 35.1875, z2: 19.625 },
          { x1: 35.1875, z1: 19.625, x2: 0.8125, z2: 19.625 },
          { x1: 0.8125, z1: 19.625, x2: 0.8125, z2: 18.875 },
        ], labels: [],
      });
    }
  });

  it('emits the 90 return panel immediately after its unchanged cabinet and keeps true face drawings', () => {
    owner.ends.left.corner.kind = 90;
    const drawing = draw();
    const cabinetIndex = drawing.parts.findIndex(({ id }) => id === 'cc');
    expect(drawing.parts[cabinetIndex + 1]).toEqual({ id: 'corner-panel:cc', kind: 'end_panel',
      runId: owner.id, x: 0, width: 24, z: owner.z, height: owner.height,
      back: 36, front: 36.8125, coversBoxEdges: false });
    const sourceScene = scene();
    expect(sourceScene.faceLayouts.get('cc').squash).toBeNull();
    const face = sourceScene.faceLayouts.get('cc').faces[0];
    expect(drawing.parts.find(({ id }) => id === 'cc:r')).toMatchObject(rect(face));
    const detail = runDoorDetails(subject, ownerWall, owner, settings, sourceScene).parts
      .find(({ key }) => key === 'cc:r');
    expect(drawing.doorDetails.find(({ partId }) => partId === 'cc:r')).toEqual({ partId: 'cc:r',
      openings: detail.openings.map(rect), profileLines: detail.lines.map(rect), miters: detail.miters });
    expect(drawing.pulls).toEqual(runPulls(subject, ownerWall, owner, settings, sourceScene).pulls
      .map((entry) => ({ partId: entry.partId, outlines: pullOutlines(entry) })));
    expect(drawing.swingMarks).toEqual(runSwingMarks(sourceScene.faceLayouts)
      .map(({ partId, lines }) => ({ partId, lines })));
    owner.ends.left.corner.returnPiece = 'none';
    // CC7 step c: removing the return panel also changes the leg bands' free-end depths.
    const expected = drawing.parts.filter(({ id }) => id !== 'corner-panel:cc').map((part) => (
      part.id === 'left:corner:run-1:toe_kick' ? { ...part, front: 35.75 }
        : part.id === 'left:corner:run-1:countertop' ? { ...part, front: 36.75 } : part
    ));
    expect(draw().parts).toEqual(expected);
  });

  it.each(['none', 'filler'])('omits a return panel for returnPiece %s', (returnPiece) => {
    owner.ends.left.corner.returnPiece = returnPiece;
    expect(draw().parts.some(({ id }) => id.startsWith('corner-panel:'))).toBe(false);
  });

  it('keeps drawing switches and part-id filters on projected corner records', () => {
    const ids = new Set(['cc:r']);
    for (const get of [elevationDoorDetails, elevationPulls, elevationSwingMarks]) {
      expect(get(subject, ownerWall, 'front', settings, ids).map(({ partId }) => partId)).toEqual(['cc:r']);
      expect(get(subject, ownerWall, 'front', settings, new Set())).toEqual([]);
    }
    Object.assign(subject, { doorDetails: false, showPulls: false, swingMarks: false });
    const drawing = draw();
    expect(drawing.doorDetails).toEqual([]);
    expect(drawing.pulls).toEqual([]);
    expect(drawing.swingMarks).toEqual([]);
    subject.doorStyleTags = true;
    expect(draw().doorDetails.find(({ partId }) => partId === 'cc:r'))
      .toEqual({ partId: 'cc:r', tag: 'Thin' });
  });

  it('uses the right-end projection and panel position for an uneven 45 corner', () => {
    owner.grid = run({ items: [auto('a'), fixed('cc', 36)] }).grid;
    owner.grid.cells[1].node.face = { type: 'door', hinge: 'right' };
    owner.grid.cells[1].node.doorStyleId = 'thin';
    owner.anchors = { left: false, right: true };
    owner.ends = { left: { type: 'none' },
      right: normalizeCornerEnd({ corner: { kind: 45, depthB: 15, legB: 30 } }) };
    ownerWall.connections = { start: null, end: { wallId: 'wall-2', endpoint: 'start' } };
    Object.assign(returnWall, { x1: 144, y1: 0, x2: 144, y2: 144,
      connections: { start: { wallId: 'wall-1', endpoint: 'end' }, end: null } });
    // Anchor the run at the right wall end, as it would be after sync.
    owner.x = 144 - owner.width;
    const { faces, squash } = scene().faceLayouts.get('cc');
    const drawing = draw();
    expect(drawing.parts.find(({ id }) => id === 'cc:r')).toMatchObject(rect(squashRect(faces[0], squash)));
    expect(drawing.parts.find(({ id }) => id === 'corner-panel:cc')).toMatchObject({
      x: 129, width: 15, back: 30, front: 30.8125,
    });
  });
});
