import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { faceDrawing, toDrawingPayload } from '../drawingPayload.js';
import { legPreset } from '../legs.js';
import { planParts } from '../planParts.js';
import { elevationToPlan } from '../geometry.js';
import { wallSideFrame } from '../wallSides.js';
import { E, Sf, fourEndLegs, legShape, noEnds } from './fixtures/legs.js';

const settings = { ...DEFAULT_SETTINGS, shapes: [legShape()] };
let nextId = 0;
const four = legPreset('four', { shapeId: 'leg', proud: 0.5 }, () => ['LF', 'LB', 'RF', 'RB'][nextId++]);
const R = run({ x: 10, width: 36, legs: four });
const W = wall({ x1: 0, y1: 0, x2: 144, y2: 0, runs: [R] });

describe('SH7.2 step c leg fill drawing payloads', () => {
  it('anchors 1 and 2: exports the LF panel bounds and four plan points at its own top', () => {
    for (const wallSide of ['front', 'back']) {
      for (const rotated of [false, true]) {
        const placed = run({ ...R, wallSide,
          legs: undefined, ends: noEnds, endLegs: { ...fourEndLegs, left: { ...E, fit: 'between' } } });
        const w = wall({ ...W, ...(rotated ? { x1: 7, y1: 11, x2: 7, y2: 155 } : {}), runs: [placed] });
        const input = room({ walls: [w] });
        expect(faceDrawing(input, w, wallSide, settings).parts.find(({ id }) => id === 'run-1:endleg:left-front:fill')).toEqual({
          id: 'run-1:endleg:left-front:fill', kind: 'end_panel', runId: R.id,
          x: 10.25, z: 0, width: 0.8125, height: 34.5, front: 21.875, back: 3.5,
          coversBoxEdges: false,
        });
        const frame = wallSideFrame(input, w, wallSide);
        const points = [[10.25, 3.5], [11.0625, 3.5], [11.0625, 21.875], [10.25, 21.875]]
          .map(([u, v]) => {
            const point = elevationToPlan(frame, u, v);
            return [point.x + 0, 0 - point.y];
          });
        expect(planParts(input, settings).find(({ id }) => id === 'run-1:endleg:left-front:fill')).toEqual({
          id: 'run-1:endleg:left-front:fill', kind: 'end_panel', runId: R.id, points, top: 34.5,
        });
      }
    }
  });

  it('step f anchors 2–3: exports a front-two filler face and its separate plan return at box top', () => {
    const w = wall({ ...W, runs: [run({ ...R,
      legs: undefined, ends: noEnds, endLegs: { left: { legs: 'front', front: Sf, fit: 'behind' },
        right: { legs: 'front', front: Sf } },
    })] });
    const input = room({ walls: [w] });
    const payload = toDrawingPayload(input, settings);
    expect(payload.elevations[0].parts.find(({ id }) => id === 'run-1:endleg:left-front:fill')).toEqual({
      id: 'run-1:endleg:left-front:fill', kind: 'filler', runId: R.id,
      x: 10, z: 4, width: 3.5, height: 30.5, front: 21.875, back: 21.0625,
      coversBoxEdges: true,
    });
    expect(payload.plan.parts.filter(({ id }) => id.startsWith('run-1:endleg:left-front:fill'))).toEqual([
      { id: 'run-1:endleg:left-front:fill', kind: 'filler', runId: R.id, top: 34.5,
        points: [[10, -21.0625], [13.5, -21.0625], [13.5, -21.875], [10, -21.875]] },
      { id: 'run-1:endleg:left-front:fill:return', kind: 'filler', runId: R.id, top: 34.5,
        points: [[12.75, -18.6875], [13.5, -18.6875], [13.5, -21.1875], [12.75, -21.1875]] },
    ]);
  });

  it('step f: maps right front filler faces and returns on rotated and back wall faces', () => {
    for (const wallSide of ['front', 'back']) {
      for (const rotated of [false, true]) {
        for (const [index, x, back, front, start, end, returnBack, returnFront] of [
          [2, 42.5, 21.0625, 21.875, 42.5, 43.25, 18.6875, 21.1875],
        ]) {
          const placed = run({ ...R, wallSide,
            legs: undefined, ends: noEnds, endLegs: { ...fourEndLegs, right: { ...E, fit: 'behind' } } });
          const w = wall({ ...W, ...(rotated ? { x1: 7, y1: 11, x2: 7, y2: 155 } : {}), runs: [placed] });
          const input = room({ walls: [w] });
          const id = `${R.id}:endleg:${index === 0 ? 'left' : 'right'}-front:fill`;
          expect(faceDrawing(input, w, wallSide, settings).parts.find((part) => part.id === id))
            .toMatchObject({ x, z: 4, width: 3.5, height: 30.5, front, back });
          const frame = wallSideFrame(input, w, wallSide);
          const fills = planParts(input, settings).filter((part) => part.id.startsWith(id));
          expect(fills.map(({ id, kind, top }) => ({ id, kind, top }))).toEqual([
            { id, kind: 'filler', top: 34.5 }, { id: `${id}:return`, kind: 'filler', top: 34.5 },
          ]);
          for (const [i, u0, u1, v0, v1] of [[0, x, x + 3.5, back, front],
            [1, start, end, returnBack, returnFront]]) {
            expect(fills[i].points).toEqual([[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => {
              const point = elevationToPlan(frame, u, v);
              return [point.x + 0, 0 - point.y];
            }));
          }
        }
      }
    }
  });

  it('anchor 4: preserves the entire payload without fills, with and without legs', () => {
    // Captured before step c, including elevation parts and plan parts/shapes.
    for (const [legs, hash] of [
      [four, 'a876156d8d462c96673d23a748c19502dd480019261aa97fd72862c171d61601'],
      [[], 'db8c85c4c1c4d63e0a99717d2a176d9f1eb45f55087be3fea436a5d148f19a39'],
    ]) {
      const input = room({ walls: [wall({ ...W, runs: [run({ ...R, legs })] })] });
      expect(createHash('sha256').update(JSON.stringify(toDrawingPayload(input, settings))).digest('hex')).toBe(hash);
    }
  });

  it('omits missing-shape, zero-depth and zero-height fills from both payloads', () => {
    for (const changes of [{ front: { ...Sf, shapeId: 'missing' } },
      { front: { ...Sf, y: -30 } }, { panel: { top: 34.5 } }]) {
      const w = wall({ ...W, runs: [run({ ...R, legs: undefined, ends: noEnds,
        endLegs: { ...fourEndLegs, left: { ...E, fit: 'between', ...changes } } })] });
      const payload = toDrawingPayload(room({ walls: [w] }), settings);
      expect(payload.elevations[0].parts.filter(({ id }) => id.endsWith(':fill')).map(({ id }) => id))
        .toEqual([]);
      expect(payload.plan.parts.filter(({ id }) => id.endsWith(':fill')).map(({ id }) => id))
        .toEqual([]);
    }
  });
});

describe('SH7.3 step b panel return drawing payloads', () => {
  it('anchors 3–4: exports each return with panel fields and transformed plan points at the panel top', () => {
    for (const wallSide of ['front', 'back']) {
      for (const rotated of [false, true]) {
        for (const [index, start, end] of [[0, 11.0625, 14.75], [2, 41.25, 44.9375]]) {
          const placed = run({ ...R, wallSide,
            legs: undefined, ends: noEnds, endLegs: { ...fourEndLegs, [index === 0 ? 'left' : 'right']: { ...E, fit: 'between', panel: { returns: 'both' } } } });
          const w = wall({ ...W, ...(rotated ? { x1: 7, y1: 11, x2: 7, y2: 155 } : {}), runs: [placed] });
          const input = room({ walls: [w] });
          const id = `${R.id}:endleg:${index === 0 ? 'left' : 'right'}-front:fill`;
          const payload = toDrawingPayload(input, settings);
          const face = payload.elevations.find(({ parts }) => parts.some((part) => part.id === id));
          const fills = face.parts.filter((part) => part.id.startsWith(id));
          expect(fills).toHaveLength(3);
          expect(fills[0]).toEqual({ id, kind: 'end_panel', runId: R.id,
            x: index === 0 ? 10.25 : 44.9375, width: 0.8125, z: 0, height: 34.5,
            front: 21.875, back: 3.5, coversBoxEdges: false });
          const frame = wallSideFrame(input, w, wallSide);
          const plan = planParts(input, settings).filter((part) => part.id.startsWith(id));
          expect(plan.map(({ id, kind, top }) => ({ id, kind, top }))).toEqual([
            { id, kind: 'end_panel', top: 34.5 },
            { id: `${id}:return-front`, kind: 'end_panel', top: 34.5 },
            { id: `${id}:return-back`, kind: 'end_panel', top: 34.5 },
          ]);
          for (const [i, edge, back, front] of [[1, 'front', 21.0625, 21.875], [2, 'back', 3.5, 4.3125]]) {
            expect(fills[i]).toEqual({ id: `${id}:return-${edge}`, kind: 'end_panel', runId: R.id,
              x: start, width: end - start, z: 0, height: 34.5, front, back, coversBoxEdges: false });
            expect(plan[i].points).toEqual([[start, back], [end, back], [end, front], [start, front]]
              .map(([u, v]) => {
                const point = elevationToPlan(frame, u, v);
                return [point.x + 0, 0 - point.y];
              }));
            expect(payload.plan.parts.find((part) => part.id === plan[i].id)).toEqual(plan[i]);
          }
        }
      }
    }
  });

  it('exports only effective returns, keeping panel clearances', () => {
    for (const [panel, expectedEdges, z, height] of [
      [{ returns: 'front', past: true, bottom: 1, top: 2 }, ['front'], 1, 31.5],
      [{ returns: 'back', returnDepth: 3 }, ['back'], 0, 34.5],
      [{ returns: 'both', returnDepth: 0.8125 }, [], 0, 34.5],
    ]) {
      const placed = run({ ...R, legs: undefined, ends: noEnds,
        endLegs: { ...fourEndLegs, left: { ...E, fit: 'between', panel } } });
      const w = wall({ ...W, runs: [placed] });
      const input = room({ walls: [w] });
      const parts = faceDrawing(input, w, 'front', settings).parts.filter(({ id }) => id.startsWith('run-1:endleg:left-front:fill'));
      expect(parts.map(({ id }) => id)).toEqual(['run-1:endleg:left-front:fill', ...expectedEdges.map((edge) => `run-1:endleg:left-front:fill:return-${edge}`)]);
      expect(planParts(input, settings).filter(({ id }) => id.startsWith('run-1:endleg:left-front:fill'))
        .map(({ id, top }) => ({ id, top }))).toEqual(parts.map(({ id }) => ({ id, top: z + height })));
      for (const part of parts) expect(part).toMatchObject({ z, height });
      if (expectedEdges.length) {
        expect(parts[1]).toMatchObject(panel.past ? { front: 24.875, back: 24.0625 }
          : { x: 11.0625, width: 2.1875 });
      }
    }
  });
});
