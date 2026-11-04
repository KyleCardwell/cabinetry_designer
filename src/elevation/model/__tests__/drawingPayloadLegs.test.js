import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { faceDrawing, toDrawingPayload } from '../drawingPayload.js';
import { runLegs } from '../legs.js';
import { normalizeElevationDocument } from '../../store/persistence.js';
import { syncRoom } from '../room.js';
import { room, run, wall } from '../../../test/builders.js';
import { legShape } from './fixtures/legs.js';

const LEG = legShape();
const settings = { ...DEFAULT_SETTINGS, shapes: [LEG] };
const leg = { id: 'lg-1', shapeId: LEG.id, from: 'left', x: 0, yFrom: 'front', y: 0, height: 'full' };
const R = run({ x: 10, width: 36, legs: [leg] });
// Anchor wall: along +x, facing +y before the payload's y flip.
const W = wall({ x1: 0, y1: 0, x2: 144, y2: 0, runs: [R] });
const ROOM = room({ walls: [W] });

describe('SH7 step f legs in the drawing payload', () => {
  it('anchor 1: omits leg parts, records and plan.shapes from every golden room', () => {
    const document = normalizeElevationDocument(
      JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
    );
    for (const stored of document.rooms) {
      const payload = toDrawingPayload(syncRoom(stored, document.settings), document.settings);
      expect(payload.plan).not.toHaveProperty('shapes');
      for (const elevation of payload.elevations) {
        expect(elevation.parts.some(({ kind }) => kind === 'leg')).toBe(false);
        expect((elevation.shapes ?? []).some(({ kind }) => kind === 'leg')).toBe(false);
      }
    }
  });

  it('anchor 2: appends the leg bounds and front loops with its unstretched block', () => {
    const before = structuredClone(ROOM);
    const drawing = faceDrawing(ROOM, W, 'front', settings);
    const without = faceDrawing(ROOM, { ...W, runs: [{ ...R, legs: undefined }] }, 'front', settings);
    expect(drawing.parts).toEqual([...without.parts, {
      id: leg.id, kind: 'leg', runId: R.id, x: 10, z: 0, width: 3.5, height: 34.5,
      front: 24.875, back: 21.375, coversBoxEdges: false, opaque: false,
      openEdges: ['left', 'right', 'top', 'bottom'],
    }]);
    const [placed] = runLegs(ROOM, W, R, settings);
    expect(drawing.shapes).toEqual([{
      partId: leg.id, kind: 'leg', depth: 0,
      loops: placed.outlines.map(({ closed, outline }) => ({ closed, points: outline })),
      block: { name: 'SHAPE_LEG_LEG', x: 11.75, z: 0, mirror: false },
    }]);
    expect(drawing.shapes[0].loops[0]).toEqual({ closed: true,
      points: [[10, 26.5, 0], [13.5, 26.5, 0], [13.5, 34.5, 0], [10, 34.5, 0]] });
    for (const key of ['doorDetails', 'swingMarks', 'pulls', 'interiors', 'glassMarks']) {
      expect(drawing[key]).toEqual(without[key]);
    }
    expect(toDrawingPayload(ROOM, settings).elevations[0].shapes).toEqual(drawing.shapes);
    expect(ROOM).toEqual(before);
  });

  it('anchor 3: maps the square and circle into y-up plan, preserving arcs on rotated and back faces', () => {
    const [shape] = toDrawingPayload(ROOM, settings).plan.shapes;
    expect(shape).toMatchObject({ id: leg.id, kind: 'leg', top: 34.5 });
    expect(shape.loops[0]).toEqual({ closed: true, points: [
      [10, -24.875, 0], [13.5, -24.875, 0], [13.5, -21.375, 0], [10, -21.375, 0],
    ] });
    expect(shape.loops[1]).toEqual({ closed: true,
      points: [[13.25, -23.125, 1], [10.25, -23.125, 1]] });
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0.6, 0.8]]) {
      for (const side of ['front', 'back']) {
        for (const mirror of [false, true]) {
          const placedRun = { ...R, wallSide: side, legs: [{ ...leg, ...(mirror ? { mirror: true } : {}) }] };
          const placedWall = wall({ x1: 20, y1: 30, x2: 20 + 144 * dx, y2: 30 + 144 * dy,
            thickness: 4.5, runs: [placedRun] });
          const payload = toDrawingPayload(room({ walls: [placedWall] }), settings);
          const circle = payload.plan.shapes[0].loops[1];
          const back = side === 'back';
          const left = back ? [20 + 144 * dx + 4.5 * dy, 30 + 144 * dy - 4.5 * dx] : [20, 30];
          const sign = back ? -1 : 1;
          const map = (u, v) => [left[0] + sign * (dx * u - dy * v),
            -(left[1] + sign * (dy * u + dx * v))];
          const expected = (mirror ? [10.25, 13.25] : [13.25, 10.25]).map((u) => map(u, 23.125));
          circle.points.forEach(([x, y, bulge], i) => {
            expect(x).toBeCloseTo(expected[i][0], 10);
            expect(y).toBeCloseTo(expected[i][1], 10);
            expect(bulge).toBe(mirror ? -1 : 1);
          });
          const [[x1, y1], [x2, y2]] = circle.points;
          expect(Math.hypot(x2 - x1, y2 - y1)).toBeCloseTo(3, 10);
          const centre = map(11.75, 23.125);
          expect((x1 + x2) / 2).toBeCloseTo(centre[0], 10);
          expect((y1 + y2) / 2).toBeCloseTo(centre[1], 10);
        }
      }
    }
  });

  it('anchor 4: exports a height-30 stretched leg without a block', () => {
    const stretchedWall = { ...W, runs: [{ ...R, legs: [{ ...leg, height: 30 }] }] };
    const payload = toDrawingPayload(room({ walls: [stretchedWall] }), settings);
    const elevation = payload.elevations[0];
    expect(elevation.parts.find(({ id }) => id === leg.id)).toMatchObject({ height: 30 });
    expect(elevation.shapes[0]).not.toHaveProperty('block');
    expect(elevation.shapes[0].loops[0].points.map(([, z]) => z)).toEqual([26.5, 26.5, 30, 30]);
    expect(payload.plan.shapes[0].top).toBe(30);
  });

  it('exports each face\'s drawn legs only and includes both faces in plan, skipping invalid placements', () => {
    const backRun = run({ id: 'back-run', wallSide: 'back', x: 30, width: 36, z: 0, legs: [
      { ...leg, id: 'missing', shapeId: 'missing' },
      { ...leg, id: 'no-height', height: 'feet' },
      { ...leg, id: 'back-leg', height: 34.5, mirror: true },
    ] });
    const bothWall = { ...W, runs: [R, backRun] };
    const payload = toDrawingPayload(room({ walls: [bothWall] }), settings);
    expect(payload.elevations.map(({ side, parts, shapes }) => [side,
      parts.filter(({ kind }) => kind === 'leg').map(({ id }) => id),
      shapes.filter(({ kind }) => kind === 'leg').map(({ partId }) => partId),
    ])).toEqual([['front', [leg.id], [leg.id]], ['back', ['back-leg'], ['back-leg']]]);
    expect(payload.elevations[1].shapes[0]).toMatchObject({ block: { mirror: true } });
    expect(payload.plan.shapes.map(({ id }) => id)).toEqual([leg.id, 'back-leg']);
    const skippedWall = { ...W, runs: [{ ...backRun, legs: backRun.legs.slice(0, 2) }] };
    const skipped = toDrawingPayload(room({ walls: [skippedWall] }), settings);
    expect(skipped.plan).not.toHaveProperty('shapes');
    expect(skipped.elevations[0]).not.toHaveProperty('shapes');
  });

  it('shifts leg bounds, loops and block insertion in combined elevations without changing bulges or plan shapes', () => {
    const source = room({ wallOrder: ['A', 'B'], walls: [
      wall({ id: 'A', x1: 0, y1: 0, x2: 144, y2: 0,
        connections: { start: null, end: { wallId: 'B', endpoint: 'start' } },
        runs: [run({ id: 'a', width: 36 })] }),
      wall({ id: 'B', x1: 144, y1: 0, x2: 288, y2: 0,
        connections: { start: { wallId: 'A', endpoint: 'end' }, end: null },
        runs: [{ ...R, legs: [{ ...leg, mirror: true }] }] }),
    ] });
    const separate = toDrawingPayload(source, settings);
    const payload = toDrawingPayload({ ...source,
      combinedElevations: [{ id: 'g', on: true, faces: ['A', 'B'] }],
    }, settings);
    expect(payload.elevations).toHaveLength(1);
    const [combined] = payload.elevations;
    expect(combined.faces.map(({ dx }) => dx)).toEqual([0, 144]);
    const own = separate.elevations.find(({ wallId }) => wallId === 'B');
    const part = own.parts.find(({ id }) => id === leg.id);
    expect(combined.parts.find(({ id }) => id === leg.id)).toEqual({ ...part, x: 154 });
    const [record] = own.shapes;
    expect(combined.shapes).toEqual([{
      ...record,
      loops: record.loops.map(({ closed, points }) => ({ closed,
        points: points.map(([x, z, bulge]) => [x + 144, z, bulge]),
      })),
      block: { ...record.block, x: 155.75 },
    }]);
    expect(payload.plan.parts).toEqual(separate.plan.parts);
    expect(payload.plan.shapes).toEqual(separate.plan.shapes);
  });
});
