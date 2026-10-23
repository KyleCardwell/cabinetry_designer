import { describe, expect, it } from 'vitest';
import { auto, room, run, wall } from '../../../test/builders.js';
import { combinedViewOf } from '../combinedElevations.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { faceParts } from '../drawingPayload.js';
import { elevationParts } from '../elevationParts.js';
import { doorSection } from '../doorSection.js';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { MICRO_SHAKER } from './fixtures/microShakerDesign.js';
import {
  arcPoints, elevationMeasureGeometry, formatMeasure, MEASURE_STEP, measureBetween,
  measureGeometry, planMeasureGeometry, profileMeasureGeometry, sectionMeasureGeometry, snapMeasure,
} from '../measure.js';
import { resolveWall, syncRoom } from '../room.js';
import { wallOutline } from '../wallOutline.js';

const A = { kind: 'rect', x: 0, y: 0, width: 30, height: 34.5 };
const B = { ...A, x: 30, width: 18 };
const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const corner = (x, y) => ({ kind: 'corner', point: { x, y } });
const edge = (x1, y1, x2, y2, x, y) => ({
  kind: 'edge', point: { x, y }, segment: { x1, y1, x2, y2 },
});

describe('MS1 measure anchors', () => {
  it('1: builds the four edges, corners and midpoints of a rectangle', () => {
    const geometry = measureGeometry([A]);
    expect(geometry.segments).toHaveLength(4);
    expect(geometry.corners).toHaveLength(4);
    expect(geometry.mids).toHaveLength(4);
    expect(geometry.mids).toContainEqual({ x: 15, y: 0 });
  });

  it('2: keeps the shared edge once for adjacent rectangles', () => {
    const geometry = measureGeometry([A, B]);
    expect(geometry.segments).toHaveLength(7);
    expect(geometry.corners).toHaveLength(6);
    expect(geometry.mids).toHaveLength(7);
  });

  it('3: snaps near the shared top corner', () => {
    expect(snapMeasure({ x: 29.8, y: 34.3 }, measureGeometry([A, B]), 0.5))
      .toEqual(corner(30, 34.5));
  });

  it('4: snaps to the midpoint before its edge', () => {
    expect(snapMeasure({ x: 15.2, y: 0.3 }, measureGeometry([A]), 0.5))
      .toEqual({ kind: 'mid', point: { x: 15, y: 0 } });
  });

  it('5: snaps to an edge and supports a point-only pick', () => {
    const geometry = measureGeometry([A]);
    const expected = edge(0, 0, 30, 0, 8, 0);
    expect(snapMeasure({ x: 8, y: 0.2 }, geometry, 0.5)).toEqual(expected);
    expect(snapMeasure({ x: 8, y: 0.2 }, geometry, 0.5, { pointOnly: true }))
      .toEqual({ ...expected, kind: 'on-edge' });
  });

  it('6: leaves an unsnapped pointer free', () => {
    expect(snapMeasure({ x: 8, y: 10 }, measureGeometry([A]), 0.5))
      .toEqual({ kind: 'free', point: { x: 8, y: 10 } });
  });

  it('7: measures points and formats a diagonal to the nearest 1/32 inch', () => {
    const result = measureBetween(corner(0, 0), corner(48, 34.5));
    expect(result).toMatchObject({ kind: 'points', from: { x: 0, y: 0 }, to: { x: 48, y: 34.5 }, dx: 48, dy: 34.5 });
    expect(result.distance).toBeCloseTo(59.1122, 4);
    expect(formatMeasure(result.distance)).toBe('~59 1/8"');
  });

  it('8: projects a point onto a vertical line without an extension', () => {
    expect(measureBetween(corner(0, 34.5), edge(48, 0, 48, 34.5, 48, 10)))
      .toEqual({ kind: 'point-line', from: { x: 0, y: 34.5 }, to: { x: 48, y: 34.5 }, distance: 48, dx: 48, dy: 0 });
  });

  it('9: preserves pick order when the first pick is a line', () => {
    expect(measureBetween(edge(0, 0, 30, 0, 10, 0), corner(20, 12)))
      .toEqual({ kind: 'point-line', from: { x: 20, y: 0 }, to: { x: 20, y: 12 }, distance: 12, dx: 0, dy: 12 });
  });

  it('10: measures parallel lines infinitely and extends to the nearest end', () => {
    const result = measureBetween(edge(0, 0, 0, 34.5, 0, 5), edge(30.5, 54, 30.5, 84, 30.5, 60));
    expect(result).toEqual({
      kind: 'lines', from: { x: 0, y: 5 }, to: { x: 30.5, y: 5 }, distance: 30.5, dx: 30.5, dy: 0,
      extension: { from: { x: 30.5, y: 5 }, to: { x: 30.5, y: 54 } },
    });
    expect(formatMeasure(result.distance)).toBe('30 1/2"');
  });

  it('11: measures picks on nonparallel lines with their acute angle', () => {
    const result = measureBetween(edge(0, 0, 30, 0, 10, 0), edge(40, 0, 50, 10, 45, 5));
    expect(result).toMatchObject({ kind: 'points', from: { x: 10, y: 0 }, to: { x: 45, y: 5 } });
    expect(result.distance).toBeCloseTo(35.3553, 4);
    expect(result.angle).toBeCloseTo(45, 10);
    expect(result).not.toHaveProperty('extension');
    expect(formatMeasure(result.distance)).toBe('~35 11/32"');
  });

  it('12: formats small, nearly exact and zero values', () => {
    expect(MEASURE_STEP).toBe(1 / 32);
    expect([0.03125, 12.0001, 0].map(formatMeasure)).toEqual(['1/32"', '12"', '0"']);
  });

  it('13: includes every wall outline point in plan room coordinates', () => {
    const model = syncRoom(room({ walls: [wall({ x1: 10, y1: 20, x2: 100, y2: 50 })] }), settings);
    const geometry = planMeasureGeometry(model, settings);
    for (const point of wallOutline(model, model.walls[0])) expect(geometry.corners).toContainEqual(point);
    expect(geometry.corners.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
  });

  it('14: includes all cabinet corners and the resolved wall rectangle', () => {
    const model = syncRoom(room({ walls: [wall({ runs: [run({ items: [auto('cabinet')] })] })] }), settings);
    const stored = model.walls[0];
    const geometry = elevationMeasureGeometry(model, stored, 'front', settings);
    const part = elevationParts(model, stored, 'front', settings).find(({ kind }) => kind === 'cabinet');
    expect(part).toBeDefined();
    for (const x of [part.x, part.x + part.width]) {
      for (const y of [part.z, part.z + part.height]) expect(geometry.corners).toContainEqual({ x, y });
    }
    expect(geometry.corners).toContainEqual({ x: 0, y: 0 });
    expect(geometry.corners).toContainEqual({ x: resolveWall(model, stored, 'front').length, y: stored.height });
  });

  it('15: shifts the second combined face into each opened face frame', () => {
    // The stepped A/J/B/K/C fixture from combinedPayload.test.js, using shared builders.
    const model = syncRoom(room({
      wallOrder: ['C', 'K', 'B', 'J', 'A'],
      combinedElevations: [{ id: 'g', on: true, faces: ['A', 'B', 'C'] }],
      walls: [
        wall({ id: 'A', x1: 0, y1: 0, x2: 100, y2: 0,
          connections: { start: null, end: { wallId: 'J', endpoint: 'start' } },
          runs: [run({ id: 'a', x: 10, width: 30, items: [auto('a-cabinet')] })] }),
        wall({ id: 'J', x1: 100, y1: 0, x2: 100, y2: 16,
          connections: { start: { wallId: 'A', endpoint: 'end' }, end: { wallId: 'B', endpoint: 'start' } } }),
        wall({ id: 'B', x1: 100, y1: 16, x2: 160, y2: 16,
          connections: { start: { wallId: 'J', endpoint: 'end' }, end: { wallId: 'K', endpoint: 'start' } },
          runs: [run({ id: 'b', x: 10, width: 30, items: [auto('b-cabinet')] })] }),
        wall({ id: 'K', x1: 160, y1: 16, x2: 160, y2: 0,
          connections: { start: { wallId: 'B', endpoint: 'end' }, end: { wallId: 'C', endpoint: 'start' } } }),
        wall({ id: 'C', x1: 160, y1: 0, x2: 240, y2: 0,
          connections: { start: { wallId: 'K', endpoint: 'end' }, end: null },
          runs: [run({ id: 'c', x: 10, width: 30, items: [auto('c-cabinet')] })] }),
      ],
    }), settings);
    const combined = combinedViewOf(model, 'C');
    expect(combined.faces.map(({ key, dx }) => [key, dx])).toEqual([['C', 0], ['B', 80], ['A', 140]]);
    const second = model.walls.find(({ id }) => id === 'B');
    const part = elevationParts(model, second, 'front', settings).find(({ kind }) => kind === 'cabinet');
    for (const active of combined.faces) {
      const stored = model.walls.find(({ id }) => id === active.wallId);
      const geometry = elevationMeasureGeometry(model, stored, active.side, settings);
      for (const x of [part.x, part.x + part.width]) {
        for (const y of [part.z, part.z + part.height]) {
          expect(geometry.corners).toContainEqual({ x: x + 80 - active.dx, y });
        }
      }
      for (const face of combined.faces) {
        expect(geometry.corners).toContainEqual({ x: face.dx - active.dx, y: 0 });
        expect(geometry.corners).toContainEqual({ x: face.dx - active.dx + face.length, y: face.height });
      }
    }
  });
});

describe('measure boundary rules', () => {
  it('closes polygons, leaves polylines open and drops only sub-microinch segments', () => {
    const points = [[0, 0], [4, 0], [4, 3]];
    expect(measureGeometry([{ kind: 'poly', points, closed: true }]).segments).toHaveLength(3);
    expect(measureGeometry([{ kind: 'poly', points, closed: false }]).segments).toHaveLength(2);
    const geometry = measureGeometry([
      { kind: 'poly', points: [[0, 0], [0, 0], [0.0000005, 0]], closed: false },
      { kind: 'poly', points: [[1, 0], [1, 0.000001]], closed: false },
    ]);
    expect(geometry.segments).toHaveLength(1);
    expect(geometry.corners).toHaveLength(1); // The kept ends share a rounded key.
    expect(measureGeometry([])).toEqual({ segments: [], arcs: [], corners: [], mids: [], centers: [] });
  });

  it('dedupes reversed rounded edges, endpoints and crossing midpoints', () => {
    const geometry = measureGeometry([
      { kind: 'poly', points: [[0, 0], [4, 0]], closed: false },
      { kind: 'poly', points: [[4.0001, 0], [0.0001, 0]], closed: false },
      { kind: 'poly', points: [[2, -2], [2, 2]], closed: false },
    ]);
    expect(geometry.segments).toEqual([{ x1: 0, y1: 0, x2: 4, y2: 0 }, { x1: 2, y1: -2, x2: 2, y2: 2 }]);
    expect(geometry.corners).toHaveLength(4);
    expect(geometry.mids).toEqual([{ x: 2, y: 0 }]);
  });

  it('prefers the nearest point, gives corners a 1e-9 tie, and includes the tolerance boundary', () => {
    const geometry = { corners: [{ x: 0, y: 0 }], mids: [{ x: 2, y: 0 }], segments: [] };
    expect(snapMeasure({ x: 1, y: 0 }, geometry, 1)).toEqual(corner(0, 0));
    expect(snapMeasure({ x: 1 + 2e-10, y: 0 }, geometry, 2)).toEqual(corner(0, 0));
    expect(snapMeasure({ x: 1.1, y: 0 }, geometry, 2)).toEqual({ kind: 'mid', point: { x: 2, y: 0 } });
    expect(snapMeasure({ x: 3, y: 4 }, null, 10)).toEqual({ kind: 'free', point: { x: 3, y: 4 } });
  });

  it('clamps edge snaps and keeps the first segment on a distance tie', () => {
    const first = { x1: 0, y1: 0, x2: 2, y2: 0 };
    const geometry = { corners: [], mids: [], segments: [first, { x1: 0, y1: 2, x2: 2, y2: 2 }] };
    expect(snapMeasure({ x: 1, y: 1 }, geometry, 1)).toEqual({ kind: 'edge', point: { x: 1, y: 0 }, segment: first });
    expect(snapMeasure({ x: 3, y: 0 }, geometry, 1)).toEqual({ kind: 'edge', point: { x: 2, y: 0 }, segment: first });
  });

  it('treats on-edge picks as points and extends beyond either segment end in pick order', () => {
    const line = edge(0, 0, 10, 0, 5, 0);
    expect(measureBetween({ ...line, kind: 'on-edge' }, corner(5, 12)))
      .toMatchObject({ kind: 'points', distance: 12 });
    expect(measureBetween(line, corner(20, 12))).toMatchObject({
      from: { x: 20, y: 0 }, to: { x: 20, y: 12 },
      extension: { from: { x: 20, y: 0 }, to: { x: 10, y: 0 } },
    });
    expect(measureBetween(corner(-5, 12), line)).toMatchObject({
      from: { x: -5, y: 12 }, to: { x: -5, y: 0 },
      extension: { from: { x: -5, y: 0 }, to: { x: 0, y: 0 } },
    });
    expect(measureBetween(corner(10 + 5e-9, 12), line)).not.toHaveProperty('extension');
  });

  it('uses the 0.1 degree parallel threshold and acute angles for reversed lines', () => {
    const line = edge(0, 0, 10, 0, 5, 0);
    const nearParallel = edge(0, 10, 10, 10 + 10 * Math.tan(0.099 * Math.PI / 180), 5, 10);
    const angled = edge(0, 10, 10, 10 + 10 * Math.tan(0.101 * Math.PI / 180), 5, 10);
    expect(measureBetween(line, nearParallel).kind).toBe('lines');
    expect(measureBetween(line, angled).angle).toBeCloseTo(0.101, 8);
    expect(measureBetween(line, edge(10, 10, 0, 0, 5, 5)).angle).toBeCloseTo(45, 10);
    expect(measureBetween(line, edge(10, 5, 0, 5, 5, 5))).toMatchObject({ kind: 'lines', distance: 5 });
  });

  it('marks rounding differences only above 0.001 inch and reduces fractions', () => {
    expect([1.0009, 1.0011, 0.0625, 0.09375, -0.125].map(formatMeasure))
      .toEqual(['1"', '~1"', '1/16"', '3/32"', '-1/8"']);
  });

  it('includes part outlines and detail lines without mutating the model', () => {
    const model = syncRoom(room({ walls: [wall({
      runs: [
        run({ id: 'framed', width: 90, style: { cabinetStyleId: 14 }, seamGap: 0,
          autoCount: false, ends: { left: { type: 'none' }, right: { type: 'none' } },
          items: [auto('A'), { ...auto('B'), top: { value: 2, source: 'manual' } }, auto('C')] }),
        run({ id: 'upper', width: 90, z: 54, height: 36,
          cabinetTypeId: CABINET_TYPE_IDS.UPPER, style: { cabinetStyleId: 13 },
          bottom: [{ id: 'rail', kind: 'light_rail', height: 1.5, doors: 'flush' }],
          items: [auto('upper-cabinet')] }),
      ],
    })] }), settings);
    const copy = structuredClone(model);
    const parts = faceParts(model, model.walls[0], 'front', settings);
    const geometry = elevationMeasureGeometry(model, model.walls[0], 'front', settings);
    expect(parts.some(({ outline }) => outline?.length > 4)).toBe(true);
    expect(parts.some(({ lines }) => lines?.length)).toBe(true);
    for (const part of parts) {
      for (const [x, y] of part.outline ?? []) expect(geometry.corners).toContainEqual({ x, y });
      for (const { x1, z1, x2, z2 } of part.lines ?? []) {
        expect(geometry.corners).toContainEqual({ x: x1, y: z1 });
        expect(geometry.corners).toContainEqual({ x: x2, y: z2 });
      }
    }
    expect(model).toEqual(copy);
  });
});

const R = {
  points: { b: [1, 0], c: [0, 1] },
  loops: [{ closed: false, segs: [{ type: 'arc', from: 'b', to: 'c', center: [0, 0], ccw: true }] }],
};
const Q = {
  points: { a: [0, 0], ...R.points },
  loops: [{ closed: true, segs: [
    { type: 'line', from: 'a', to: 'b' }, ...R.loops[0].segs, { type: 'line', from: 'c', to: 'a' },
  ] }],
};

describe('MS4 measure anchors', () => {
  it('1: builds the quarter disc lines, arc, corners, midpoints and center', () => {
    const geometry = profileMeasureGeometry([Q]);
    expect(geometry.segments).toHaveLength(2);
    expect(geometry.arcs).toEqual([{ cx: 0, cy: 0, r: 1, start: 0, sweep: Math.PI / 2, x1: 1, y1: 0, x2: 0, y2: 1 }]);
    expect(geometry.corners).toHaveLength(3);
    for (const point of [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]) {
      expect(geometry.corners).toContainEqual(point);
    }
    expect(geometry.mids).toHaveLength(3);
    expect(geometry.mids).toContainEqual({ x: 0.5, y: 0 });
    expect(geometry.mids).toContainEqual({ x: 0, y: 0.5 });
    expect(geometry.mids[1].x).toBeCloseTo(0.7071, 4);
    expect(geometry.mids[1].y).toBeCloseTo(0.7071, 4);
    expect(geometry.centers).toEqual([{ x: 0, y: 0 }]);
  });

  it('2: keeps the quarter arc midpoint when reversed clockwise', () => {
    const geometry = profileMeasureGeometry([{
      ...R, loops: [{ closed: false, segs: [{ ...R.loops[0].segs[0], from: 'c', to: 'b', ccw: false }] }],
    }]);
    expect(geometry.arcs[0].sweep).toBe(-Math.PI / 2);
    expect(geometry.mids[0].x).toBeCloseTo(0.7071, 4);
    expect(geometry.mids[0].y).toBeCloseTo(0.7071, 4);
  });

  it('3: snaps near the quarter arc midpoint', () => {
    const pick = snapMeasure({ x: 0.75, y: 0.75 }, profileMeasureGeometry([R]), 0.1);
    expect(pick.kind).toBe('mid');
    expect(pick.point.x).toBeCloseTo(0.7071, 4);
    expect(pick.point.y).toBeCloseTo(0.7071, 4);
  });

  it('4: projects onto the arc as a point pick with or without pointOnly', () => {
    const geometry = profileMeasureGeometry([R]);
    const pick = snapMeasure({ x: 0.9, y: 0.5 }, geometry, 0.1);
    expect(pick).toMatchObject({ kind: 'arc', arc: geometry.arcs[0] });
    expect(pick.point.x).toBeCloseTo(0.8742, 4);
    expect(pick.point.y).toBeCloseTo(0.4856, 4);
    expect(snapMeasure({ x: 0.9, y: 0.5 }, geometry, 0.1, { pointOnly: true })).toEqual(pick);
  });

  it('5: snaps near the arc center', () => {
    expect(snapMeasure({ x: 0.02, y: 0.01 }, profileMeasureGeometry([R]), 0.1))
      .toEqual({ kind: 'center', point: { x: 0, y: 0 } });
  });

  it('6: prefers the disc corner to its coincident arc center', () => {
    expect(snapMeasure({ x: 0.02, y: 0.01 }, profileMeasureGeometry([Q]), 0.1)).toEqual(corner(0, 0));
  });

  it('7: leaves a pointer outside the arc sweep free', () => {
    expect(snapMeasure({ x: -0.5, y: -0.5 }, profileMeasureGeometry([R]), 0.1))
      .toEqual({ kind: 'free', point: { x: -0.5, y: -0.5 } });
  });

  it('8: measures center and arc picks as points one inch apart', () => {
    const geometry = profileMeasureGeometry([R]);
    const center = snapMeasure({ x: 0.02, y: 0.01 }, geometry, 0.1);
    const arc = snapMeasure({ x: 0.9, y: 0.5 }, geometry, 0.1);
    const result = measureBetween(center, arc);
    expect(result).toMatchObject({ kind: 'points', from: center.point, to: arc.point });
    expect(result.distance).toBeCloseTo(1, 4);
    expect(measureBetween(arc, center)).toMatchObject({ kind: 'points', distance: 1 });
  });

  it('9: samples five arc points with the exact ends and quarter arc midpoint', () => {
    const arc = profileMeasureGeometry([R]).arcs[0];
    const points = arcPoints(arc, 4);
    expect(points).toHaveLength(5);
    expect(points[0]).toEqual({ x: 1, y: 0 });
    expect(points[2].x).toBeCloseTo(0.7071, 4);
    expect(points[2].y).toBeCloseTo(0.7071, 4);
    expect(points[4]).toEqual({ x: 0, y: 1 });
    expect(arcPoints(arc)).toHaveLength(25);
  });

  it('10: skips null profiles and dedupes the origin with a disc corner', () => {
    expect(profileMeasureGeometry([Q, null], { origin: true })).toEqual(profileMeasureGeometry([Q]));
    expect(profileMeasureGeometry([Q, null], { origin: true }).corners).toHaveLength(3);
  });

  it('11: includes every body corner of the square-profile door section fixture', () => {
    const style = {
      ...DEFAULT_DOOR_STYLE, designId: MICRO_SHAKER.id, stiles: { left: 1.5, right: 1.5 },
      panel: { type: 'flat', thickness: 0.625 },
    };
    const section = doorSection(style, MICRO_SHAKER, []);
    const geometry = sectionMeasureGeometry(section);
    expect(geometry.corners.length).toBeGreaterThan(0);
    for (const [x, y] of Object.values(section.body.points)) {
      expect(geometry.corners).toContainEqual({ x, y });
    }
  });
});

describe('MS4 arc boundary rules', () => {
  it('dedupes reversed rounded arc ends plus center, and dedupes centers across distinct arcs', () => {
    const reversed = {
      points: { b: [1.0001, 0], c: [0.0001, 1] },
      loops: [{ segs: [{ type: 'arc', from: 'c', to: 'b', center: [0.0001, 0], ccw: false }] }],
    };
    const bigger = { ...R, points: { b: [2, 0], c: [0, 2] } };
    const otherCenter = { ...R, loops: [{ segs: [{ ...R.loops[0].segs[0], center: [-1, -1] }] }] };
    const line = { ...R, loops: [{ segs: [{ type: 'line', from: 'b', to: 'c' }] }] };
    const input = [R, reversed, bigger, otherCenter, line];
    const copy = structuredClone(input);
    const geometry = profileMeasureGeometry(input);
    expect(geometry.arcs).toHaveLength(3);
    expect(geometry.arcs[0]).toEqual(profileMeasureGeometry([R]).arcs[0]);
    expect(geometry.centers).toEqual([{ x: 0, y: 0 }, { x: -1, y: -1 }]);
    expect(geometry.corners).toHaveLength(4);
    expect(geometry.segments).toHaveLength(1);
    expect(input).toEqual(copy);
  });

  it('drops arcs below one microinch radius and retains the boundary', () => {
    const tiny = { ...R, points: { b: [0.0000005, 0], c: [0, 0.0000005] } };
    expect(profileMeasureGeometry([tiny])).toEqual(profileMeasureGeometry([]));
    expect(profileMeasureGeometry([{ ...R, points: { b: [0.000001, 0], c: [0, 0.000001] } }]).arcs)
      .toHaveLength(1);
  });

  it('chooses the nearest point and breaks ties corner, midpoint, then center', () => {
    const geometry = { segments: [], arcs: [], corners: [{ x: -2, y: 0 }], mids: [{ x: 0, y: 0 }], centers: [{ x: 2, y: 0 }] };
    expect(snapMeasure({ x: -1, y: 0 }, geometry, 1)).toEqual(corner(-2, 0));
    expect(snapMeasure({ x: 1, y: 0 }, geometry, 1)).toEqual({ kind: 'mid', point: { x: 0, y: 0 } });
    expect(snapMeasure({ x: 1.1, y: 0 }, geometry, 1)).toEqual({ kind: 'center', point: { x: 2, y: 0 } });
    expect(profileMeasureGeometry([null], { origin: true })).toEqual({
      segments: [], arcs: [], corners: [{ x: 0, y: 0 }], mids: [], centers: [],
    });
  });

  it('compares segment and arc distances and clamps outside-sweep projections to an endpoint', () => {
    const arc = profileMeasureGeometry([R]).arcs[0];
    const segment = { x1: 1, y1: -1, x2: 1, y2: 2 };
    const geometry = { segments: [segment], arcs: [arc], corners: [], mids: [], centers: [] };
    expect(snapMeasure({ x: 0.9, y: 0.5 }, geometry, 0.1).kind).toBe('arc');
    expect(snapMeasure({ x: 1.01, y: 0.5 }, geometry, 0.1).kind).toBe('edge');
    const arcsOnly = { ...geometry, segments: [] };
    expect(snapMeasure({ x: 1, y: -0.1 }, arcsOnly, 0.1)).toEqual({ kind: 'arc', point: { x: 1, y: 0 }, arc });
    expect(snapMeasure({ x: -0.1, y: 1 }, arcsOnly, 0.1)).toEqual({ kind: 'arc', point: { x: 0, y: 1 }, arc });
    const zeroSweep = { ...arc, sweep: 0, x2: 1, y2: 0 };
    expect(snapMeasure({ x: 0, y: 1 }, { ...arcsOnly, arcs: [zeroSweep] }, 0.1).kind).toBe('free');
  });

  it('projects and samples clockwise, major and angle-wrapping sweeps in a translated frame', () => {
    for (const [from, to, ccw, target] of [
      ['b', 'c', true, { x: -2, y: -2 }],
      ['c', 'b', false, { x: -2, y: -2 }],
      ['b', 'c', false, { x: 2, y: 2 }],
      ['c', 'b', true, { x: 2, y: 2 }],
    ]) {
      const profile = { ...R, loops: [{ segs: [{ type: 'arc', from, to, ccw, center: [0, 0] }] }] };
      const arc = profileMeasureGeometry([profile]).arcs[0];
      const geometry = { segments: [], arcs: [arc], corners: [], mids: [], centers: [] };
      expect(snapMeasure(target, geometry, 0.1).kind).toBe('free');
      for (const sample of arcPoints(arc, 8)) {
        const pick = snapMeasure({ x: sample.x * 1.01, y: sample.y * 1.01 }, geometry, 0.02);
        expect(pick.kind).toBe('arc');
        expect(pick.point.x).toBeCloseTo(sample.x, 10);
        expect(pick.point.y).toBeCloseTo(sample.y, 10);
      }
    }
    const wrapped = {
      points: { b: [2, 5], c: [2, 3] },
      loops: [{ segs: [{ type: 'arc', from: 'b', to: 'c', center: [3, 4], ccw: true }] }],
    };
    const pick = snapMeasure({ x: 1.5, y: 4.2 }, profileMeasureGeometry([wrapped]), 0.1);
    expect(pick.kind).toBe('arc');
    expect(pick.point.x).toBeCloseTo(3 - Math.SQRT2 * 1.5 / Math.hypot(1.5, 0.2), 10);
    expect(pick.point.y).toBeCloseTo(4 + Math.SQRT2 * 0.2 / Math.hypot(1.5, 0.2), 10);
  });

  it('includes placed geometry in section coordinates and handles an absent section', () => {
    const placed = {
      points: { b: [4, -2], c: [3, -1] },
      loops: [{ segs: [{ ...R.loops[0].segs[0], center: [3, -2] }] }],
    };
    const section = { body: Q, placed: [{ geometry: placed }, { geometry: null }], cuts: [{ geometry: R }] };
    expect(sectionMeasureGeometry(section)).toEqual(profileMeasureGeometry([Q, placed]));
    expect(sectionMeasureGeometry(null)).toEqual(profileMeasureGeometry([]));
  });
});
