import { beforeEach, describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { normalizeCornerEnd } from '../cornerEnd.js';
import { faceDrawing, toDrawingPayload } from '../drawingPayload.js';
import { resolveWall, syncRoom } from '../room.js';

const S = { ...DEFAULT_SETTINGS, runFlex: 0 };
const key = 'corner-leg:wall-1:run-1:left';

describe('CC6 step f corner frame elevation payload', () => {
  let subject;
  beforeEach(() => {
    subject = room({ style: { cabinetStyleId: 14 }, walls: [
      wall({ runs: [run({ autoCount: false, width: 144, items: [fixed('cc', 36), auto('a')],
        anchors: { left: true, right: false },
        ends: { left: normalizeCornerEnd({}), right: { type: 'none' } } })],
      connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null } }),
      wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0,
        connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } } }),
    ] });
  });
  const draw = (index) => {
    const synced = syncRoom(subject, S);
    return faceDrawing(synced, synced.walls[index], 'front', S).parts;
  };
  const frame = (index) => draw(index).find(({ id }) => id === (index ? `${key}:frame` : 'cc:frame'));

  it('anchor 1: exports Room B’s owner frame with its opening and frame depth', () => {
    expect(frame(0)).toEqual({ id: 'cc:frame', kind: 'frame', runId: 'run-1',
      x: 24, width: 11.25, z: 4, height: 30.5, back: 24, front: 24.8125, coversBoxEdges: true,
      holes: [{ x: 24.9375, width: 10.3125, z: 5.5, height: 27.5 }],
    });
  });

  it('anchor 2: includes Room B’s return stile and preserves the covered edge-on panel', () => {
    const parts = draw(1);
    expect(frame(1)).toEqual({ id: `${key}:frame`, kind: 'frame', runId: 'run-1',
      x: 107.1875, width: 12, z: 4, height: 30.5, back: 24, front: 24.8125, coversBoxEdges: true,
      holes: [{ x: 108.75, width: 10.3125, z: 5.5, height: 27.5 }],
    });
    expect(parts.find(({ id }) => id === `${key}:panel`))
      .toMatchObject({ kind: 'end_panel', x: 107.1875, width: 0.8125, back: 0, front: 24 });
    expect(parts.findIndex(({ id }) => id === `${key}:panel`))
      .toBeLessThan(parts.findIndex(({ id }) => id === `${key}:frame`));
  });

  it('anchor 3: squashes Room C’s owner frame and draws it after the neighbouring region', () => {
    subject.walls[0].runs[0].ends.left.corner.kind = 45;
    const parts = draw(0);
    const projected = frame(0);
    expect(projected).toMatchObject({ x: 24.8125, back: 24, front: 24.8125 });
    expect(projected.width).toBeCloseTo(11.5240, 3);
    expect(projected.holes).toHaveLength(1);
    expect(projected.holes[0].x).toBeCloseTo(25.8732, 3);
    expect(projected.holes[0].width).toBeCloseTo(9.4027, 3);
    expect(projected.holes[0]).toMatchObject({ z: 5.5, height: 27.5 });
    expect(parts.findIndex(({ id }) => id === 'frame:a')).toBeLessThan(parts.indexOf(
      parts.find(({ id }) => id === 'cc:frame'),
    ));
    expect(projected.x + projected.width).toBeCloseTo(36.3365, 3);
  });

  it('anchor 4: squashes Room C’s return frame around the return front miter', () => {
    subject.walls[0].runs[0].ends.left.corner.kind = 45;
    const projected = frame(1);
    expect(projected.x).toBeCloseTo(107.6635, 3);
    expect(projected.width).toBeCloseTo(11.5240, 3);
    expect(projected.holes).toHaveLength(1);
    expect(projected.holes[0].x).toBeCloseTo(108.7241, 3);
    expect(projected.holes[0].width).toBeCloseTo(9.4027, 3);
    expect(projected).toMatchObject({ back: 24, front: 24.8125 });
  });

  it('anchor 5: emits the corner frame once with unique ids in a combined elevation', () => {
    subject.walls.push(wall({ id: 'wall-3', x1: 0, y1: 288, x2: 0, y2: 144, elevationForced: true }));
    subject.wallOrder = ['wall-1', 'wall-2', 'wall-3'];
    subject.combinedElevations = [{ id: 'combined', on: true, faces: ['wall-3', 'wall-2'] }];
    const payload = toDrawingPayload(syncRoom(subject, S), S);
    const combined = payload.elevations.find(({ faces }) => faces?.length === 2);
    expect(combined).toBeDefined();
    expect(combined.parts.filter(({ id }) => id === `${key}:frame`)).toHaveLength(1);
    expect(new Set(combined.parts.map(({ id }) => id)).size).toBe(combined.parts.length);
    expect(combined.parts.find(({ id }) => id === `${key}:frame`))
      .toMatchObject({ x: 251.1875, holes: [{ x: 252.75, width: 10.3125, z: 5.5, height: 27.5 }] });
  });

  it('anchor 6: adds no corner frame to Euro, beaded, inactive or ordinary runs', () => {
    for (const mode of ['euro', 'beaded', 'inactive', 'ordinary']) {
      const original = structuredClone(subject);
      if (mode === 'euro') subject.style.cabinetStyleId = 13;
      if (mode === 'beaded') subject.style.cabinetStyleId = 15;
      if (mode === 'inactive') subject.walls[0].runs[0].anchors.left = false;
      if (mode === 'ordinary') subject.walls[0].runs[0].ends.left = { type: 'none' };
      for (const index of [0, 1]) expect(frame(index)).toBeUndefined();
      subject = original;
    }
  });

  it('mirrors both frame projections and their openings for right corners without mutating the room', () => {
    for (const kind of [90, 45]) {
      const owner = subject.walls[0].runs[0];
      owner.ends.left.corner.kind = kind;
      const left = frame(0);
      owner.grid = run({ items: [auto('a'), fixed('cc', 36)] }).grid;
      owner.anchors = { left: false, right: true };
      owner.ends = { left: { type: 'none' }, right: owner.ends.left };
      subject.walls[0].connections = { start: null, end: { wallId: 'wall-2', endpoint: 'start' } };
      Object.assign(subject.walls[1], { x1: 144, y1: 0, x2: 144, y2: 144,
        connections: { start: { wallId: 'wall-1', endpoint: 'end' }, end: null } });
      const before = structuredClone(subject);
      const synced = syncRoom(subject, S);
      const right = frame(0);
      expect(right.x).toBeCloseTo(144 - left.x - left.width, 10);
      expect(right.holes[0].x).toBeCloseTo(144 - left.holes[0].x - left.holes[0].width, 10);
      const returning = faceDrawing(synced, resolveWall(synced, synced.walls[1]), 'front', S).parts
        .find(({ id }) => id === 'corner-leg:wall-1:run-1:right:frame');
      expect(returning.holes[0].width).toBeCloseTo(right.holes[0].width, 10);
      expect(returning.holes[0].x).toBeGreaterThanOrEqual(returning.x);
      expect(returning.holes[0].x + returning.holes[0].width)
        .toBeLessThanOrEqual(returning.x + returning.width);
      expect(subject).toEqual(before);
      // Restore the left setup for the other corner kind.
      owner.grid = run({ items: [fixed('cc', 36), auto('a')] }).grid;
      owner.anchors = { left: true, right: false };
      owner.ends = { left: owner.ends.right, right: { type: 'none' } };
      subject.walls[0].connections = { start: { wallId: 'wall-2', endpoint: 'end' }, end: null };
      Object.assign(subject.walls[1], { x1: 0, y1: 144, x2: 0, y2: 0,
        connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } } });
    }
  });
});
