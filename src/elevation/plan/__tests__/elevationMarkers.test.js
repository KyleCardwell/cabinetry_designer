import { describe, expect, it, vi } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { elevationMarkers } from '../elevationMarkers.js';
import { boxesOverlap, lineHitsBox } from '../../model/planBoxes.js';
import { polygonContainsPoint } from '../../model/footprints.js';
import * as placement from '../../model/planMarkPlacement.js';
import { planSolidParts } from '../../model/planParts.js';
import { goldenRooms } from '../../model/__tests__/helpers/goldenRooms.js';
import { room, run, wall } from '../../../test/builders.js';

describe('elevationMarkers', () => {
  it('clears N4 cabinet footprints and keeps already clear marker points (GC5.2)', () => {
    const { room, settings } = goldenRooms().find(({ key }) => key === 'N4').load();
    const place = vi.spyOn(placement, 'placePlanMarks');
    try {
      const markers = elevationMarkers(room, settings, 4, 1);
      const [items, , options] = place.mock.calls[0];
      const [, blockers] = place.mock.calls[2];
      const moved = place.mock.results[2].value;
      const withoutFootprints = placement.placePlanMarks(items, {}, options);
      const footprints = planSolidParts(room, settings)
        .filter(({ kind }) => kind === 'cabinet' || kind === 'wall')
        .map(({ id, kind, points }) => ({ id, kind, points: points.map(([x, y]) => [x, -y]) }));
      expect(blockers.polygons).toEqual(footprints.map(({ points }) => points));
      const boxAt = (key, at) => {
        const item = items.find((item) => item.key === key);
        return {
          center: at.map((value, i) => value + item.shift[i]),
          axes: item.axes,
          half: item.half.map((half) => half + options.gap / 2),
        };
      };
      const hits = (box, { points }) => polygonContainsPoint(points.map(([x, y]) => ({ x, y })),
        { x: box.center[0], y: box.center[1] })
        || points.some((point, i) => lineHitsBox([point, points[(i + 1) % points.length]], box));
      const cabinets = footprints.filter(({ kind }) => kind === 'cabinet');
      const clearBefore = withoutFootprints.filter(({ key, at }) => (
        !footprints.some((polygon) => hits(boxAt(key, at), polygon))
      ));
      expect(markers.map(({ letter }) => letter)).toEqual(expect.arrayContaining(['E', 'F']));
      for (const { key, point, letter } of markers) {
        const box = boxAt(key, [point.x, point.y]);
        expect(cabinets.filter((polygon) => hits(box, polygon)).map(({ id }) => id), letter).toEqual([]);
      }
      for (const { key, hits } of moved) {
        expect(hits, markers.find((marker) => marker.key === key).letter).toBe(0);
      }
      expect(clearBefore.length).toBeGreaterThan(0);
      for (const { key, at } of clearBefore) {
        expect(markers.find((marker) => marker.key === key).point).toEqual({ x: at[0], y: at[1] });
      }
    } finally {
      place.mockRestore();
    }
  });

  it('separates nearby marker footprints at full and smaller zoom (GC5.1)', () => {
    const testRoom = room({ walls: [
      wall({ id: 'A', y1: 0, y2: 0, elevationForced: true }),
      wall({ id: 'B', y1: 10, y2: 10, elevationForced: true }),
    ] });

    for (const scale of [1, 0.5]) {
      const markers = elevationMarkers(testRoom, DEFAULT_SETTINGS, scale);
      expect(markers).toHaveLength(2);
      const boxes = markers.map(({ point, direction }) => {
        const u = [-direction.x, -direction.y];
        return {
          center: [point.x + u[0] * 5.6 / scale, point.y + u[1] * 5.6 / scale],
          axes: [u, [-u[1], u[0]]],
          half: [21.1 / scale, 22.5 / scale], // Footprint plus half of the 3px gap on each side.
        };
      });
      expect(boxesOverlap(boxes[0], boxes[1])).toBe(false);
    }
  });

  it('places front and back markers past the deepest run', () => {
    const testRoom = room({ walls: [wall({ id: 'H', x1: 0, y1: 0, x2: 246, y2: 0, thickness: 4.5, runs: [
      run({ id: 'B1', cabinetTypeId: CABINET_TYPE_IDS.BASE, depth: 24, width: 30, x: 20 }),
      run({ id: 'U1', cabinetTypeId: CABINET_TYPE_IDS.UPPER, depth: 12, width: 30, x: 100, wallSide: 'back' }),
    ] })] });

    expect(elevationMarkers(testRoom, DEFAULT_SETTINGS, 2)).toEqual([
      {
        key: 'H',
        wallId: 'H',
        side: 'front',
        letter: 'A',
        point: { x: 35, y: 43.375 },
        direction: { x: 0, y: 1 },
      },
      {
        key: 'H:back',
        wallId: 'H',
        side: 'back',
        letter: 'B',
        point: { x: 131, y: -52.875 },
        direction: { x: 0, y: -1 },
      },
    ]);
  });

  it('centres a marker on the span of the side runs', () => {
    const testRoom = room({ walls: [wall({ id: 'H', x1: 0, y1: 0, x2: 246, y2: 0, thickness: 4.5, runs: [
      run({ id: 'B1', cabinetTypeId: CABINET_TYPE_IDS.BASE, depth: 24, width: 30, x: 20 }),
      run({ id: 'B2', cabinetTypeId: CABINET_TYPE_IDS.BASE, depth: 24, x: 140, width: 40 }),
    ] })] });

    expect(elevationMarkers(testRoom, DEFAULT_SETTINGS, 2)).toEqual([
      {
        key: 'H',
        wallId: 'H',
        side: 'front',
        letter: 'A',
        point: { x: 100, y: 43.375 },
        direction: { x: 0, y: 1 },
      },
    ]);
  });

  it('keeps the shifted wall-centre marker for a side with no runs', () => {
    const testRoom = room({ walls: [wall({ id: 'H', x1: 0, y1: 0, x2: 246, y2: 0, thickness: 4.5, elevationForced: true })] });

    expect(elevationMarkers(testRoom, DEFAULT_SETTINGS, 2)).toEqual([
      {
        key: 'H',
        wallId: 'H',
        side: 'front',
        letter: 'A',
        point: { x: 135, y: 18.5 },
        direction: { x: 0, y: 1 },
      },
    ]);
  });

  it('Kyle 2026-10-23: a combined elevation centres its marker on all its walls, past every face\'s cabinets', () => {
    const to = (wallId, endpoint) => ({ wallId, endpoint });
    const testRoom = room({ walls: [
      wall({ id: 'A', x1: 0, y1: 0, x2: 100, y2: 0, thickness: 4.5, connections: { start: null, end: to('J', 'start') },
        runs: [run({ id: 'A1', cabinetTypeId: CABINET_TYPE_IDS.BASE, depth: 24, width: 30, x: 10 })] }),
      wall({ id: 'J', x1: 100, y1: 0, x2: 100, y2: 16, thickness: 4.5, connections: { start: to('A', 'end'), end: to('B', 'start') } }),
      wall({ id: 'B', x1: 100, y1: 16, x2: 160, y2: 16, thickness: 4.5, connections: { start: to('J', 'end'), end: to('K', 'start') },
        runs: [run({ id: 'B1', cabinetTypeId: CABINET_TYPE_IDS.BASE, depth: 24, width: 30, x: 0 })] }),
      wall({ id: 'K', x1: 160, y1: 16, x2: 160, y2: 0, thickness: 4.5, connections: { start: to('B', 'end'), end: to('C', 'start') } }),
      wall({ id: 'C', x1: 160, y1: 0, x2: 240, y2: 0, thickness: 4.5, connections: { start: to('K', 'end'), end: null },
        runs: [run({ id: 'C1', cabinetTypeId: CABINET_TYPE_IDS.BASE, depth: 24, width: 30, x: 0 })] }),
    ] });
    const alone = elevationMarkers(testRoom, DEFAULT_SETTINGS, 2);
    testRoom.combinedElevations = [{ id: 'g', on: true, faces: ['A', 'B', 'C'] }];
    const markers = elevationMarkers(testRoom, DEFAULT_SETTINGS, 2);
    expect(markers).toHaveLength(1);
    const [marker] = markers;
    const along = (m) => m.point.x * Math.abs(m.direction.y) + m.point.y * Math.abs(m.direction.x);
    const across = (m) => m.point.x * m.direction.x + m.point.y * m.direction.y;
    const walls = testRoom.walls.filter(({ id }) => ['A', 'B', 'C'].includes(id));
    const ends = walls.flatMap((wall) => [wall.x1, wall.x2]);
    expect(along(marker)).toBeCloseTo((Math.min(...ends) + Math.max(...ends)) / 2, 6);
    for (const single of alone) expect(across(marker)).toBeGreaterThanOrEqual(across(single) - 1e-6);
  });
});
