import { beforeEach, describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { normalizeCornerEnd } from '../cornerEnd.js';
import { cornerFrame } from '../cornerFrame.js';
import { cornerPlanPieces } from '../cornerPlan.js';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { toDrawingPayload } from '../drawingPayload.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { planParts } from '../planParts.js';
import { planRunPieces, runFillerThickness } from '../planPieces.js';
import { resolveWall, syncRoom } from '../room.js';

function expectPolygon(actual, expected) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((point, i) => point.forEach((value, j) => {
    expect(Math.abs(value - expected[i][j])).toBeLessThan(0.001);
  }));
}

describe('CC5 step a corner plan pieces', () => {
  let subject, ownerWall, returnWall, owner;
  // Room A specifies a 7/8" front offset with 3/4" faces and a 13/16" return panel.
  const settings = { ...DEFAULT_SETTINGS, bumperThickness: 0.125 };
  beforeEach(() => {
    owner = run({ autoCount: false, items: [fixed('cc', 36), auto('a')], _doorThickness: 0.75,
      style: { cabinetStyleId: 13 }, anchors: { left: true, right: false },
      ends: { left: normalizeCornerEnd({}), right: { type: 'none' } },
    });
    owner.grid.cells[0].node.face = { type: 'door' };
    owner.grid.cells[0].node.doorStyleId = 'thin';
    ownerWall = wall({ runs: [owner],
      connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null },
    });
    returnWall = wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0,
      connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } },
    });
    subject = room({ walls: [ownerWall, returnWall],
      doorStyles: [{ ...DEFAULT_DOOR_STYLE, id: 'thin', label: 'Thin', thickness: 0.75 }],
    });
  });

  const pieces = () => {
    const layout = layoutRun(subject, ownerWall, owner, settings);
    return planRunPieces(subject, ownerWall, owner, settings, layout,
      runFaceLayouts(subject, ownerWall, owner, settings, layout));
  };

  it('anchors 1–2: adds the L box and B door while preserving box bounds and the A door', () => {
    const { boxes, faces } = pieces();
    expect(boxes.find(({ key }) => key === 'cc')).toEqual({ key: 'cc', start: 0, end: 36,
      back: 0, front: 24, polygon: [[0, 0], [36, 0], [36, 24], [24, 24], [24, 36], [0, 36]] });
    expect(faces.find(({ key }) => key === 'cc:r')).toEqual({ key: 'cc:r', kind: 'face',
      start: 25, end: 35.9375, back: 24.125, front: 24.875 });
    expect(faces.find(({ key }) => key === 'cc:B:r')).toMatchObject({ kind: 'face',
      start: 24.125, end: 24.875, back: 25, front: 35.9375,
      polygon: [[24.125, 25], [24.875, 25], [24.875, 35.9375], [24.125, 35.9375]] });
  });

  it.each(['auto', 'none', 'filler'])('anchor 3: return piece %s', (returnPiece) => {
    owner.ends.left.corner.returnPiece = returnPiece;
    const piece = pieces().faces.find(({ key }) => key === 'cc:return');
    if (returnPiece === 'none') {
      expect(piece).toBeUndefined();
    } else if (returnPiece === 'auto') {
      expect(piece).toMatchObject({ kind: 'end_panel', top: owner.z + owner.height,
        polygon: [[0, 36], [24, 36], [24, 36.8125], [0, 36.8125]] });
    } else {
      const back = 24 - runFillerThickness(subject, ownerWall, owner, settings);
      expect(piece).toMatchObject({ kind: 'filler', start: back, end: 24, back: 36, front: 37.5,
        polygon: [[back, 36], [24, 36], [24, 37.5], [back, 37.5]] });
    }
  });

  it.each([
    [24, [[35.9709, 24.9665], [24.9665, 35.9709], [24.4362, 35.4406], [35.4406, 24.4362]]],
    [15, [[35.9338, 24.9189], [15.9920, 35.9977], [15.6278, 35.3420], [35.5695, 24.2633]]],
  ])('anchors 4–5: replaces the 45 rectangle at depth B %s with the true diagonal', (depthB, polygon) => {
    Object.assign(owner.ends.left.corner, { kind: 45, depthB });
    const result = pieces();
    expect(result.boxes.find(({ key }) => key === 'cc')).toMatchObject({ start: 0, end: 36,
      back: 0, front: 24, polygon: [[0, 0], [36, 0], [36, 24], [35.25, 24],
        [depthB, 35.25], [depthB, 36], [0, 36]] });
    const diagonal = result.faces.filter(({ key }) => key === 'cc:r');
    expect(diagonal).toHaveLength(1);
    expectPolygon(diagonal[0].polygon, polygon);
    expect(result.faces.some(({ key }) => key.startsWith('cc:B:'))).toBe(false);
    const layout = layoutRun(subject, ownerWall, owner, settings);
    const entry = runFaceLayouts(subject, ownerWall, owner, settings, layout);
    const additions = cornerPlanPieces(subject, ownerWall, owner, settings, layout, entry,
      [{ key: 'cc:r' }]);
    expect(additions.dropFaceKeys).toEqual(new Set(['cc:r']));
  });

  it.each([90, 45])('anchor 6: mirrors a right-end %s around u = 72', (kind) => {
    owner.width = 144;
    owner.ends.left.corner.kind = kind;
    const left = pieces();
    owner.grid = run({ items: [auto('a'), fixed('cc', 36)] }).grid;
    owner.grid.cells[1].node.face = { type: 'door' };
    owner.grid.cells[1].node.doorStyleId = 'thin';
    owner.anchors = { left: false, right: true };
    owner.ends = { left: { type: 'none' }, right: normalizeCornerEnd({ corner: { kind } }) };
    ownerWall.connections = { start: null, end: { wallId: 'wall-2', endpoint: 'start' } };
    Object.assign(returnWall, { x1: 144, y1: 0, x2: 144, y2: 144,
      connections: { start: { wallId: 'wall-1', endpoint: 'end' }, end: null } });
    const right = pieces();
    if (kind === 45) {
      expect(right.boxes.find(({ key }) => key === 'cc').polygon)
        .toEqual([[144, 0], [108, 0], [108, 24], [108.75, 24], [120, 35.25], [120, 36], [144, 36]]);
    }
    expectPolygon(right.boxes.find(({ key }) => key === 'cc').polygon,
      left.boxes.find(({ key }) => key === 'cc').polygon.map(([u, v]) => [144 - u, v]));
    const key = kind === 90 ? 'cc:B:r' : 'cc:r';
    const face = right.faces.find((face) => face.key === key);
    expectPolygon(face.polygon, left.faces.find((face) => face.key === key).polygon
      .map(([u, v]) => [144 - u, v]));
    if (kind === 90) expect(face).toMatchObject({ start: 119.125, end: 119.875 });
  });

  it('CC6.1: keeps Room C’s framed 45 box on the five-point diagonal box', () => {
    subject.style = { cabinetStyleId: 14 };
    delete owner.style;
    owner.width = 144;
    owner.ends.left.corner.kind = 45;
    const synced = syncRoom(subject, settings);
    const view = resolveWall(synced, synced.walls[0]);
    const framed = view.runs[0];
    const layout = layoutRun(synced, view, framed, settings);
    const entries = runFaceLayouts(synced, view, framed, settings, layout);
    const frame = cornerFrame(synced, view, framed, 'left', settings, layout, entries);
    const box = planRunPieces(synced, view, framed, settings, layout, entries)
      .boxes.find(({ key }) => key === 'cc');
    expect(box.polygon).toEqual(frame.diagonal.box.polygon);
    expectPolygon(box.polygon,
      [[0, 0], [35.4514, 0], [35.4514, 24.5486], [24.5486, 35.4514], [0, 35.4514]]);
  });

  it('CC6.1: carries the seven-point Euro 45 box into planParts in y-up coordinates', () => {
    owner.ends.left.corner.kind = 45;
    const part = planParts(subject, settings).find(({ id }) => id === 'cc');
    expect(part).toMatchObject({ kind: 'cabinet', runId: owner.id, top: owner.z + owner.height,
      points: [[0, 0], [36, 0], [36, -24], [35.25, -24], [24, -35.25], [24, -36], [0, -36]] });
  });

  it('CC6.1: builds the plan DXF export payload with the seven-point box and diagonal door', () => {
    owner.ends.left.corner.kind = 45;
    // Sync derives the front offset from the thickest door, including the neighbour.
    owner.doorStyleId = 'thin';
    const synced = syncRoom(subject, settings);
    const payload = toDrawingPayload(synced, settings);
    expect(() => JSON.stringify(payload)).not.toThrow();
    expect(payload.plan.parts.find(({ id }) => id === 'cc').points)
      .toEqual([[0, 0], [36, 0], [36, -24], [35.25, -24], [24, -35.25], [24, -36], [0, -36]]);
    expectPolygon(payload.plan.parts.find(({ id }) => id === 'cc:r').points,
      [[35.9709, -24.9665], [24.9665, -35.9709], [24.4362, -35.4406], [35.4406, -24.4362]]);
  });

  it('anchor 7: draws a panel on B with the same thin face polygon', () => {
    owner.ends.left.corner.legBFace = 'panel';
    expect(pieces().faces.find(({ key }) => key === 'cc:B:r')).toMatchObject({ kind: 'face',
      polygon: [[24.125, 25], [24.875, 25], [24.875, 35.9375], [24.125, 35.9375]] });
  });

  it.each(['inactive', 'recess', 'outset'])('anchor 8: keeps ordinary rectangles for an %s corner', (mode) => {
    if (mode === 'inactive') owner.anchors.left = false;
    else if (mode === 'recess') owner._plane = { offset: -6 };
    else owner.outset = 2;
    const result = pieces();
    expect(result.boxes.find(({ key }) => key === 'cc')).not.toHaveProperty('polygon');
    expect(result.faces.filter(({ key }) => key.startsWith('cc:')).map(({ key }) => key))
      .toEqual(['cc:r']);
  });

  it('uses the return run front offset with B faces at their own thickness', () => {
    owner.ends.left.corner.depthB = 24;
    returnWall.runs = [run({ id: 'return', depth: 21, _doorThickness: 1,
      anchors: { left: false, right: true } })];
    const face = pieces().faces.find(({ key }) => key === 'cc:B:r');
    expect(face.end).toBe(25.125);
    expect(face.end - face.start).toBe(0.75);
  });

  it('maps a landing corner from its resolved origin instead of the wall end', () => {
    owner.width = 72;
    owner.grid = run({ items: [auto('a'), fixed('cc', 36)] }).grid;
    owner.grid.cells[1].node.face = { type: 'door' };
    owner.anchors = { left: false, right: { to: 'wall', wallId: 'wall-2' } };
    owner.ends = { left: { type: 'none' }, right: normalizeCornerEnd({}) };
    ownerWall.thickness = 4.5;
    ownerWall.connections = { start: null, end: null };
    Object.assign(returnWall, { x1: 72, y1: 0, x2: 72, y2: 48, thickness: 4.5,
      connections: { start: null, end: null },
      landings: { start: { wallId: 'wall-1', side: 'front', ref: 'left', to: 'near', offset: 72 }, end: null },
    });
    expect(pieces().boxes.find(({ key }) => key === 'cc').polygon)
      .toEqual([[72, 0], [36, 0], [36, 24], [48, 24], [48, 36], [72, 36]]);
  });

  it('keeps only the highest solid faces of stacks and preserves pair half keys', () => {
    owner.grid.cells[0].node.face = { direction: 'vertical', children: [
      { type: 'pair_door', size: 10 }, { type: 'door', size: null },
    ] };
    expect(pieces().faces.filter(({ key }) => key.startsWith('cc:B:')).map(({ key }) => key))
      .toEqual(['cc:B:r.0left', 'cc:B:r.0right']);
    owner.ends.left.corner.kind = 45;
    expect(pieces().faces.filter(({ key }) => key.startsWith('cc:') && key !== 'cc:return')
      .map(({ key, polygon }) => [key, polygon.length]))
      .toEqual([['cc:r.0left', 4], ['cc:r.0right', 4]]);
    owner.grid.cells[0].node.face = { type: 'open' };
    expect(pieces().faces.filter(({ key }) => key.startsWith('cc:')).map(({ key }) => key))
      .toEqual(['cc:return']);
  });
});
