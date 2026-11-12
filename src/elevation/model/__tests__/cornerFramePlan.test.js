import { describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { normalizeCornerEnd } from '../cornerEnd.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { defaultPick, pickStack } from '../pick.js';
import { planParts } from '../planParts.js';
import { planRunPieces } from '../planPieces.js';
import { resolveWall, syncRoom } from '../room.js';

const S = { ...DEFAULT_SETTINGS, runFlex: 0 };
const ROOM_B = room({ style: { cabinetStyleId: 14 }, walls: [
  wall({ runs: [run({ autoCount: false, width: 144, items: [fixed('cc', 36), auto('a')],
    anchors: { left: true, right: false },
    ends: { left: normalizeCornerEnd({}), right: { type: 'none' } } })],
  connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null } }),
  wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0,
    connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } } }),
] });
const ROOM_C = structuredClone(ROOM_B);
ROOM_C.walls[0].runs[0].ends.left.corner.kind = 45;
const ROOM_D = structuredClone(ROOM_B);
ROOM_D.walls[1].runs = [run({ id: 'return', autoCount: false, width: 108, items: [auto('r')],
  anchors: { left: false, right: true },
  ends: { left: { type: 'none' }, right: { type: 'none' } } })];

function resolved(source, wallIndex = 0) {
  const subject = syncRoom(source, S);
  const view = resolveWall(subject, subject.walls[wallIndex]);
  const owner = view.runs[0];
  const layout = layoutRun(subject, view, owner, S);
  return { subject, view, owner, ...planRunPieces(subject, view, owner, S, layout,
    runFaceLayouts(subject, view, owner, S, layout)) };
}

function expectPolygon(actual, expected) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((point, i) => {
    expect(point).toHaveLength(2);
    point.forEach((value, j) => expect(value).toBeCloseTo(expected[i][j], 3));
  });
}

describe('corner frames in plan (CC6)', () => {
  it('joins Room B’s leg strips to the neighbour and miters the return panel', () => {
    const { boxes, faces } = resolved(ROOM_B);
    const frames = faces.filter(({ key }) => key === 'cc:frame');
    expect(frames).toHaveLength(2);
    frames.forEach((piece) => expect(piece).toMatchObject({ kind: 'frame', top: 34.5 }));
    expectPolygon(frames[0].polygon, [[24, 24], [35.25, 24], [35.25, 24.8125], [24, 24.8125]]);
    expectPolygon(frames[1].polygon,
      [[24.8125, 24.8125], [24.8125, 36.8125], [24, 36], [24, 24.8125]]);
    expectPolygon(faces.find(({ key }) => key === 'cc:return').polygon,
      [[0, 36], [24, 36], [24.8125, 36.8125], [0, 36.8125]]);
    const neighbour = faces.find(({ key }) => key === 'frame:a');
    expect(neighbour.start).toBe(frames[0].end);
    expect(neighbour.polygon[0]).toEqual(frames[0].polygon[2]);
    expect(boxes.find(({ key }) => key === 'cc').polygon)
      .toEqual([[0, 0], [36, 0], [36, 24], [24, 24], [24, 36], [0, 36]]);
    expect(faces.find(({ key }) => key === 'cc:r').front).toBe(24.8125);
    expect(faces.find(({ key }) => key === 'cc:B:r').end).toBe(24.8125);
  });

  it('overhangs the free return by a lap when there is no panel', () => {
    const source = structuredClone(ROOM_B);
    source.walls[0].runs[0].ends.left.corner.returnPiece = 'none';
    const { faces } = resolved(source);
    expectPolygon(faces.filter(({ key }) => key === 'cc:frame')[1].polygon,
      [[24.8125, 24.8125], [24.8125, 36.75], [24, 36.75], [24, 24.8125]]);
    expect(faces.some(({ key }) => key === 'cc:return')).toBe(false);
  });

  it('draws Room C’s trapezoid, inset box and the neighbour’s miter cut', () => {
    const { boxes, faces } = resolved(ROOM_C);
    const frames = faces.filter(({ key }) => key === 'cc:frame');
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ kind: 'frame', top: 34.5 });
    expectPolygon(frames[0].polygon,
      [[36, 24], [24, 36], [24.8125, 36.3366], [36.3366, 24.8125]]);
    expectPolygon(boxes.find(({ key }) => key === 'cc').polygon,
      [[0, 0], [35.4514, 0], [35.4514, 24.5486], [24.5486, 35.4514], [0, 35.4514]]);
    expect(boxes.find(({ key }) => key === 'a').start).toBeCloseTo(37.0865, 3);
    const neighbour = faces.find(({ key }) => key === 'frame:a');
    expect(neighbour.polygon[0][0]).toBeCloseTo(36.3366, 3);
    expect(neighbour.polygon[0][1]).toBe(24.8125);
    expect(neighbour.polygon[3]).toEqual([36, 24]);
    expectPolygon(faces.find(({ key }) => key === 'cc:return').polygon,
      [[0, 36], [24, 36], [24, 36.8125], [0, 36.8125]]);

    const source = structuredClone(ROOM_D);
    source.walls[0].runs[0].ends.left.corner.kind = 45;
    const returning = resolved(source, 1);
    const strip = returning.faces.find(({ key }) => key === 'frame:r');
    expect(strip.polygon[1][0]).toBeCloseTo(144 - 36.3366, 3);
    expect(strip.polygon[1][1]).toBe(24.8125);
    expect(strip.polygon[2]).toEqual([108, 24]);
    expect(144 - returning.boxes.find(({ key }) => key === 'r').end).toBeCloseTo(37.0865, 3);
  });

  it('stops Room D’s return leg at the lapping return run’s strip', () => {
    const { faces } = resolved(ROOM_D);
    expectPolygon(faces.filter(({ key }) => key === 'cc:frame')[1].polygon,
      [[24.8125, 24.8125], [24.8125, 35.25], [24, 35.25], [24, 24.8125]]);
    expect(faces.some(({ key }) => key === 'cc:return')).toBe(false);
    const returning = resolved(ROOM_D, 1).faces.find(({ key }) => key === 'frame:r');
    expect(144 - returning.end).toBe(35.25);
    expect(returning.back).toBe(24);
    expect(returning.front).toBe(24.8125);
  });

  it('exports both legs with the frame kind and top and retains corner picking', () => {
    for (const source of [ROOM_B, ROOM_C]) {
      const { subject, view } = resolved(source);
      const frames = planParts(subject, S).filter(({ id }) => id === 'cc:frame');
      const polygons = resolved(source).faces.filter(({ key }) => key === 'cc:frame');
      expect(frames).toHaveLength(polygons.length);
      frames.forEach((part, i) => {
        expect(part).toMatchObject({ kind: 'frame', top: 34.5, runId: 'run-1' });
        expectPolygon(part.points, polygons[i].polygon.map(([x, y]) => [x, -y]));
      });
      expect(defaultPick(pickStack(subject, view, S, { x: 30, z: 4.5 })))
        .toMatchObject({ key: 'cc:frame', selection: {
          cornerOf: { wallId: 'wall-1', runId: 'run-1', side: 'left' },
        } });
    }
  });

  it('preserves Euro, beaded, inactive and ordinary plan geometry', () => {
    for (const kind of [90, 45]) {
      const source = structuredClone(kind === 90 ? ROOM_B : ROOM_C);
      source.style.cabinetStyleId = 13;
      const { subject, boxes, faces } = resolved(source);
      expect(faces.some(({ kind }) => kind === 'frame')).toBe(false);
      expect(planParts(subject, S).some(({ kind }) => kind === 'frame')).toBe(false);
      expect(boxes.find(({ key }) => key === 'cc').polygon).toEqual(kind === 90
        ? [[0, 0], [36, 0], [36, 24], [24, 24], [24, 36], [0, 36]]
        : [[0, 0], [36, 0], [36, 24], [35.25, 24], [24, 35.25], [24, 36], [0, 36]]);
      expectPolygon(faces.find(({ key }) => key === 'cc:return').polygon,
        [[0, 36], [24, 36], [24, 36.8125], [0, 36.8125]]);
    }
    for (const mode of ['beaded', 'inactive', 'ordinary']) {
      const source = structuredClone(ROOM_B);
      if (mode === 'beaded') source.style.cabinetStyleId = 15;
      if (mode === 'inactive') source.walls[0].runs[0].anchors.left = false;
      if (mode === 'ordinary') source.walls[0].runs[0].ends.left = { type: 'none' };
      const { subject, faces, boxes } = resolved(source);
      expect(faces.some(({ key }) => key === 'cc:frame')).toBe(false);
      expect(planParts(subject, S).some(({ id }) => id === 'cc:frame')).toBe(false);
      if (mode !== 'beaded') expect(boxes.find(({ key }) => key === 'cc')).not.toHaveProperty('polygon');
    }
  });

  it('mirrors both corner types and their neighbour cuts into a right owner wall frame', () => {
    for (const original of [ROOM_B, ROOM_C]) {
      const source = structuredClone(original);
      const owner = source.walls[0].runs[0];
      owner.grid = run({ items: [auto('a'), fixed('cc', 36)] }).grid;
      owner.anchors = { left: false, right: true };
      owner.ends = { left: { type: 'none' }, right: owner.ends.left };
      source.walls[0].connections = { start: null, end: { wallId: 'wall-2', endpoint: 'start' } };
      Object.assign(source.walls[1], { x1: 144, y1: 0, x2: 144, y2: 144,
        connections: { start: { wallId: 'wall-1', endpoint: 'end' }, end: null } });
      const left = resolved(original);
      const right = resolved(source);
      for (const key of ['cc:frame', 'cc:return']) {
        const polygons = left.faces.filter((piece) => piece.key === key);
        const mirrored = right.faces.filter((piece) => piece.key === key);
        expect(mirrored).toHaveLength(polygons.length);
        polygons.forEach((piece, i) => expectPolygon(mirrored[i].polygon,
          piece.polygon.map(([x, y]) => [144 - x, y])));
      }
      expectPolygon(right.boxes.find(({ key }) => key === 'cc').polygon,
        left.boxes.find(({ key }) => key === 'cc').polygon.map(([x, y]) => [144 - x, y]));
      const l = left.faces.find(({ key }) => key === 'frame:a').polygon;
      const r = right.faces.find(({ key }) => key === 'frame:a').polygon;
      expectPolygon(r, [l[1], l[0], l[3], l[2]].map(([x, y]) => [144 - x, y]));
    }
  });
});
