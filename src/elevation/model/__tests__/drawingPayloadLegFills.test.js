import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { faceDrawing, toDrawingPayload } from '../drawingPayload.js';
import { legPreset } from '../legs.js';
import { planParts } from '../planParts.js';
import { elevationToPlan } from '../geometry.js';
import { wallSideFrame } from '../wallSides.js';
import { legShape } from './fixtures/legs.js';

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
          legs: four.map((leg, i) => i === 0 ? { ...leg, fill: { type: 'panel' } } : leg) });
        const w = wall({ ...W, ...(rotated ? { x1: 7, y1: 11, x2: 7, y2: 155 } : {}), runs: [placed] });
        const input = room({ walls: [w] });
        expect(faceDrawing(input, w, wallSide, settings).parts.find(({ id }) => id === 'LF:fill')).toEqual({
          id: 'LF:fill', kind: 'end_panel', runId: R.id,
          x: 10.25, z: 0, width: 0.8125, height: 34.5, front: 21.875, back: 3.5,
          coversBoxEdges: false,
        });
        const frame = wallSideFrame(input, w, wallSide);
        const points = [[10.25, 3.5], [11.0625, 3.5], [11.0625, 21.875], [10.25, 21.875]]
          .map(([u, v]) => {
            const point = elevationToPlan(frame, u, v);
            return [point.x + 0, 0 - point.y];
          });
        expect(planParts(input, settings).find(({ id }) => id === 'LF:fill')).toEqual({
          id: 'LF:fill', kind: 'end_panel', runId: R.id, points, top: 34.5,
        });
      }
    }
  });

  it('anchor 3: exports a front-two filler with back zero and normal filler occlusion', () => {
    const w = wall({ ...W, runs: [run({ ...R,
      legs: four.filter(({ yFrom }) => yFrom === 'front')
        .map((leg, i) => i === 0 ? { ...leg, fill: { type: 'filler', top: 1, bottom: 2 } } : leg),
    })] });
    const input = room({ walls: [w] });
    const payload = toDrawingPayload(input, settings);
    expect(payload.elevations[0].parts.find(({ id }) => id === 'LF:fill')).toEqual({
      id: 'LF:fill', kind: 'filler', runId: R.id,
      x: 10.25, z: 2, width: 0.8125, height: 31.5, front: 21.875, back: 0,
      coversBoxEdges: true,
    });
    expect(payload.plan.parts.find(({ id }) => id === 'LF:fill')).toEqual({
      id: 'LF:fill', kind: 'filler', runId: R.id, top: 33.5,
      points: [[10.25, 0], [11.0625, 0], [11.0625, -21.875], [10.25, -21.875]],
    });
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

  it('omits shared, missing-shape, zero-depth and zero-height fills from both payloads', () => {
    for (const [changes, count] of [[{}, 1], [{ shapeId: 'missing' }, 0],
      [{ y: -30 }, 0], [{ fill: { type: 'panel', top: 34.5 } }, 0]]) {
      const w = wall({ ...W, runs: [run({ ...R, legs: four.map((leg, i) => i === 0
        ? { ...leg, fill: { type: 'panel' }, ...changes }
        : i === 1 && count ? { ...leg, fill: { type: 'panel' } } : leg) })] });
      const payload = toDrawingPayload(room({ walls: [w] }), settings);
      expect(payload.elevations[0].parts.filter(({ id }) => id.endsWith(':fill')).map(({ id }) => id))
        .toEqual(count ? ['LF:fill'] : []);
      expect(payload.plan.parts.filter(({ id }) => id.endsWith(':fill')).map(({ id }) => id))
        .toEqual(count ? ['LF:fill'] : []);
    }
  });
});
