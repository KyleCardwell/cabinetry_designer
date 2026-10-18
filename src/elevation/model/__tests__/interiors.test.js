import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  boxConstruction, boxPartLines, cabinetInterior, dragDividerPosition, interiorDepth, interiorDimensions,
  placeInterior, resolveInterior, wallInteriors,
} from '../index.js';
import { findLeaf, splitGridCell } from '../cellTree.js';
import { elevationParts } from '../elevationParts.js';
import * as elevationPartsModule from '../elevationParts.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const group = (direction, dividers, children = Array.from({ length: dividers.length + 1 }, () => ({}))) => (
  { direction, children, dividers }
);
const vertical = (...dividers) => group('vertical', dividers);
const horizontal = (...dividers) => group('horizontal', dividers);
const fixed = { kind: 'fixed' };
const partition = { kind: 'partition' };
const box = (width, height, depth = 24) => ({ width, height, depth });
const standard = boxConstruction({});
const resolve = (tree, dimensions) => resolveInterior(tree, dimensions, standard);
const section = (result, path) => result.sections.find((entry) => entry.path === path);

describe('IN2 interior rectangles', () => {
  it('anchor 1: an absent interior is one clear root section', () => {
    const rect = { x: 0.75, z: 0.75, width: 28.5, height: 29 };
    expect(resolve(undefined, box(30, 30.5))).toEqual({
      rect, depth: 23, sections: [{ path: 'r', ...rect, depth: 23 }], dividers: [], warnings: [],
      partLines: boxPartLines(box(30, 30.5), standard, 0.75),
    });
  });

  it('anchor 2: an auto shelf splits the clear height equally, top section first', () => {
    const result = resolve(vertical(fixed), box(24, 84));
    expect(result.sections).toEqual([
      { path: 'r.0', x: 0.75, z: 42.375, width: 22.5, height: 40.875, depth: 23 },
      { path: 'r.1', x: 0.75, z: 0.75, width: 22.5, height: 40.875, depth: 23 },
    ]);
    expect(result.dividers).toEqual([{
      path: 'r', index: 0, kind: 'fixed', x: 0.75, z: 41.625, width: 22.5, height: 0.75,
      depth: 23, fromBottom: 42, dimFrom: 'bottom', auto: true, depthAuto: true,
    }]);
  });

  it('anchor 3: a manual shelf is measured from the exterior bottom', () => {
    const result = resolve(vertical({ ...fixed, at: 36 }), box(24, 84));
    expect(section(result, 'r.1').height).toBe(34.875);
    expect(section(result, 'r.0')).toMatchObject({ z: 36.375, height: 46.875 });
    expect(result.dividers[0]).toMatchObject({ z: 35.625, fromBottom: 36, auto: false });
  });

  it('anchor 4: a nested partition stops at its parent shelf', () => {
    const tree = group('vertical', [{ ...fixed, at: 36 }], [horizontal(partition), {}]);
    const result = resolve(tree, box(36, 84));
    expect(result.dividers[1]).toEqual({
      path: 'r.0', index: 0, kind: 'partition', x: 17.625, z: 36.375, width: 0.75, height: 46.875,
      depth: 23, fromLeft: 18, fromRight: 18, dimFrom: 'left', auto: true, depthAuto: true,
    });
    expect(result.sections.map(({ path }) => path)).toEqual(['r.0.0', 'r.0.1', 'r.1']);
    expect(section(result, 'r.0.0')).toMatchObject({ x: 0.75, width: 16.875 });
    expect(section(result, 'r.0.1')).toMatchObject({ x: 18.375, width: 16.875 });
  });

  it('anchor 5: a double partition takes two sheet thicknesses around its centre', () => {
    const result = resolve(horizontal({ kind: 'double_partition' }), box(48, 30.5));
    expect(result.dividers[0]).toMatchObject({ x: 23.25, width: 1.5, fromLeft: 24 });
    expect(result.sections.map(({ x, width }) => ({ x, width })))
      .toEqual([{ x: 0.75, width: 22.5 }, { x: 24.75, width: 22.5 }]);
  });

  it('anchor 6: a right-origin partition stays measured from the right on resize', () => {
    const tree = horizontal({ ...partition, at: 12, from: 'right' });
    const result = resolve(tree, box(36, 30.5));
    expect(result.dividers[0]).toMatchObject({ x: 23.625, fromLeft: 24, fromRight: 12, dimFrom: 'right' });
    expect(section(result, 'r.0').width).toBe(22.875);
    expect(section(result, 'r.1')).toMatchObject({ x: 24.375, width: 10.875 });
    expect(resolve(tree, box(48, 30.5)).dividers[0])
      .toMatchObject({ fromLeft: 36, fromRight: 12, dimFrom: 'right' });
  });

  it('anchor 7: auto shelves split only the span above the manual shelf', () => {
    const result = resolve(vertical(fixed, { ...fixed, at: 30 }), box(24, 84));
    expect(section(result, 'r.2').height).toBe(28.875);
    expect(section(result, 'r.1')).toMatchObject({ z: 30.375, height: 26.0625 });
    expect(result.dividers[0].fromBottom).toBe(56.8125);
    expect(section(result, 'r.0')).toMatchObject({ z: 57.1875, height: 26.0625 });
  });

  it('anchor 8: a stretcher defaults to four inches deep', () => {
    const result = resolve(vertical({ kind: 'stretcher', at: 24.5 }), box(18, 30.5));
    expect(result.dividers[0]).toMatchObject({ z: 24.125, width: 16.5, depth: 4, depthAuto: true });
    expect(section(result, 'r.0')).toMatchObject({ z: 24.875, height: 4.875 });
    expect(section(result, 'r.1').height).toBe(23.375);
  });

  it('anchor 9: omitted bottom and left panels give their space back and use an inset back', () => {
    const construction = boxConstruction({ box: { bottom: 'none', left: false } });
    expect(resolveInterior(null, box(30, 30, 12), construction)).toMatchObject({
      rect: { x: 0, z: 0, width: 29.25, height: 29.25 }, depth: 11.25,
    });
  });

  it('anchor 10: keeps excessive depth and warns on sections below the minimum', () => {
    expect(interiorDepth(4, 'applied')).toBe(3.75);
    expect(interiorDepth(24, 'none')).toBe(24);
    const result = resolve(vertical({ ...fixed, at: 1, depth: 30 }), box(30, 30.5));
    expect(result.warnings).toEqual([
      { code: 'divider-too-deep', path: 'r', index: 0 },
      { code: 'section-too-small', path: 'r.1' },
    ]);
    expect(section(result, 'r.1')).toMatchObject({ z: 0.75, height: 0 });
    expect(result.dividers[0]).toMatchObject({ depth: 30, depthAuto: false, fromBottom: 1 });
  });

  it('splits auto spans between manual faces with mixed thicknesses and preserves input order', () => {
    const tree = horizontal(partition, { kind: 'double_partition', at: 10 }, partition,
      { ...partition, at: 20 }, { kind: 'double_partition' });
    const before = structuredClone(tree);
    const result = resolve(tree, box(30, 30.5));
    expect(result.sections.map(({ width }) => width)).toEqual([3.875, 3.875, 4.0625, 4.0625, 3.6875, 3.6875]);
    expect(result.dividers.map(({ fromLeft }) => fromLeft)).toEqual([5, 10, 15.1875, 20, 24.8125]);
    expect(result.dividers.at(-1).dimFrom).toBe('right');
    expect(tree).toEqual(before);
    const reversed = resolve(horizontal({ ...partition, at: 20 }, { ...partition, at: 10 }), box(30, 30.5));
    expect(reversed.dividers.map(({ fromLeft }) => fromLeft)).toEqual([20, 10]);
    expect(section(reversed, 'r.1').width).toBe(0);
    expect(reversed.warnings).toEqual([{ code: 'section-too-small', path: 'r.1' }]);
    const outside = resolve(horizontal({ ...partition, at: 40 }), box(30, 30.5));
    expect(outside.dividers[0].fromLeft).toBe(40);
    expect(section(outside, 'r.1').width).toBe(0);
  });

  it('uses sheet thickness, all construction ends and backs, and nested exterior measurements', () => {
    const settings = { sheetThickness: 0.5 };
    for (const top of ['between', 'overlay', 'spreaders', 'none']) {
      for (const bottom of ['between', 'overlay', 'spreaders', 'none']) {
        const construction = boxConstruction({ box: { top, bottom, right: false } });
        const result = resolveInterior(undefined, box(30, 30), construction, settings);
        expect(result.rect).toEqual({ x: 0.5, z: bottom === 'none' ? 0 : 0.5,
          width: 29.5, height: 30 - (top === 'none' ? 0 : 0.5) - (bottom === 'none' ? 0 : 0.5) });
      }
    }
    expect(['dado', 'inset', 'applied', 'none'].map((back) => interiorDepth(24, back, settings)))
      .toEqual([23, 23.5, 23.75, 24]);
    const tree = group('horizontal', [{ ...partition, at: 10 }], [{},
      vertical({ kind: 'double_fixed', at: 20, depth: 6 })]);
    expect(resolveInterior(tree, box(30, 30), standard, settings).dividers[1])
      .toMatchObject({ x: 10.25, z: 19.5, width: 19.25, height: 1, fromBottom: 20, depth: 6, depthAuto: false });
    expect(resolve(horizontal({ ...partition, at: 2.125 }), box(30, 30.5)).sections[0].width).toBe(1);
    expect(resolve(horizontal({ ...partition, at: 1.5 }), box(30, 30.5)).sections[0].width).toBe(0);
  });
});

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const settings = { ...document.settings, runFlex: 0 };

describe('cabinetInterior', () => {
  it('uses the full drawn blind box, the stored construction, and nested cabinet leaves', () => {
    const id = 'c38ca5a0-197f-4885-a084-d33ec4eafcff';
    const stored = structuredClone(document.rooms.find((room) => room.walls.some((wall) => (
      wall.runs.some((run) => findLeaf(run.grid, id))
    ))));
    const wall = stored.walls.find((entry) => entry.runs.some((run) => findLeaf(run.grid, id)));
    const run = wall.runs.find((entry) => findLeaf(entry.grid, id));
    let nextId = 0;
    run.grid = splitGridCell(run.grid, id, 'down', 2, () => `nested-${++nextId}`);
    const leaf = findLeaf(run.grid, id);
    leaf.box = { back: 'applied', left: false };
    leaf.interior = horizontal({ ...partition, at: 12, from: 'right' });
    const room = syncRoom(stored, settings);
    const syncedWall = room.walls.find((entry) => entry.id === wall.id);
    const part = elevationParts(room, syncedWall, 'front', settings).find((entry) => entry.id === id);
    const result = cabinetInterior(room, syncedWall, 'front', settings, id);
    expect(result.box).toEqual({ x: part.x, z: part.z, width: part.width,
      height: part.height, depth: part.front - part.back });
    expect(result.box.width).toBeGreaterThanOrEqual(leaf.blind.left);
    expect(result.construction).toMatchObject({ back: 'applied', left: false, sources: { back: 'manual' } });
    expect(result.rect.x).toBe(0);
    expect(result.depth).toBe(result.box.depth - 0.25);
    expect(result.dividers[0]).toMatchObject({ fromLeft: result.box.width - 12, fromRight: 12, dimFrom: 'right' });
  });

  it('returns null for absent items, other wall faces, and non-cabinet parts', () => {
    const room = syncRoom(document.rooms[0], settings);
    const wall = room.walls[0];
    const parts = elevationParts(room, wall, 'front', settings);
    const cabinet = parts.find((part) => part.kind === 'cabinet');
    const other = parts.find((part) => part.kind !== 'cabinet');
    expect(cabinetInterior(room, wall, 'front', settings, cabinet.id).sections[0].path).toBe('r');
    expect(cabinetInterior(room, wall, 'front', settings, other.id)).toBeNull();
    expect(cabinetInterior(room, wall, 'front', settings, 'missing')).toBeNull();
    expect(cabinetInterior(room, wall, 'back', settings, cabinet.id)).toBeNull();
    const rearRoom = structuredClone(room);
    rearRoom.walls[0].runs.forEach((run) => { run.wallSide = 'back'; });
    expect(cabinetInterior(rearRoom, rearRoom.walls[0], 'back', settings, cabinet.id).box.width).toBe(cabinet.width);
  });
});

const placedInterior = (tree, width, height, x, z) => placeInterior({
  box: { ...box(width, height), x, z }, ...resolve(tree, box(width, height)),
});

describe('IN3 interior view coordinates and dimensions', () => {
  it('anchor 1: places an auto shelf and sections, preserving all other fields and the input', () => {
    const local = { box: { ...box(24, 84), x: 30, z: 4 }, ...resolve(vertical(fixed), box(24, 84)) };
    const before = structuredClone(local);
    const placed = placeInterior(local);
    expect(section(placed, 'r.1')).toEqual({
      path: 'r.1', x: 30.75, z: 4.75, width: 22.5, height: 40.875, depth: 23,
    });
    expect(section(placed, 'r.0').z).toBe(46.375);
    expect(placed.dividers[0]).toEqual({ ...local.dividers[0], x: 30.75, z: 45.625 });
    expect(placed).toEqual({
      ...local, sections: placed.sections, dividers: placed.dividers, partLines: placed.partLines,
    });
    expect(placed.partLines[0]).toEqual({ part: 'left', x: 30.75, z: 4, width: 0, height: 84 });
    expect(interiorDimensions(placed)).toEqual([{
      key: 'r:0', path: 'r', index: 0, axis: 'vertical',
      from: { x: 30.75, z: 4 }, to: { x: 30.75, z: 46 },
      value: 42, side: 'bottom', manual: false, lane: 0,
    }]);
    expect(local).toEqual(before);
  });

  it('anchor 2: dimensions a manual shelf and its nested auto partition from the box exterior', () => {
    const tree = group('vertical', [{ ...fixed, at: 36 }], [horizontal(partition), {}]);
    expect(interiorDimensions(placedInterior(tree, 36, 84, 10, 0))).toEqual([
      { key: 'r:0', path: 'r', index: 0, axis: 'vertical',
        from: { x: 10.75, z: 0 }, to: { x: 10.75, z: 36 },
        value: 36, side: 'bottom', manual: true, lane: 0 },
      { key: 'r.0:0', path: 'r.0', index: 0, axis: 'horizontal',
        from: { x: 10, z: 83.25 }, to: { x: 28, z: 83.25 },
        value: 18, side: 'left', manual: false, lane: 0 },
    ]);
  });

  it('anchor 3: dimensions a partition from the right at its top end', () => {
    const tree = horizontal({ ...partition, at: 12, from: 'right' });
    expect(interiorDimensions(placedInterior(tree, 36, 30.5, 0, 4))).toEqual([{
      key: 'r:0', path: 'r', index: 0, axis: 'horizontal',
      from: { x: 36, z: 33.75 }, to: { x: 24, z: 33.75 },
      value: 12, side: 'right', manual: true, lane: 0,
    }]);
  });

  it('anchor 4: assigns lanes by increasing value while keeping divider order', () => {
    const placed = placedInterior(vertical(fixed, { ...fixed, at: 30 }), 24, 84, 0, 0);
    expect(interiorDimensions(placed)).toEqual([
      { key: 'r:0', path: 'r', index: 0, axis: 'vertical',
        from: { x: 0.75, z: 0 }, to: { x: 0.75, z: 56.8125 },
        value: 56.8125, side: 'bottom', manual: false, lane: 1 },
      { key: 'r:1', path: 'r', index: 1, axis: 'vertical',
        from: { x: 0.75, z: 0 }, to: { x: 0.75, z: 30 },
        value: 30, side: 'bottom', manual: true, lane: 0 },
    ]);
  });

  it('anchor 5: drags on the dimension side, snapping to sixteenths with only a minimum', () => {
    const bottom = interiorDimensions(placedInterior(vertical(fixed), 24, 84, 30, 4))[0];
    const right = interiorDimensions(placedInterior(
      horizontal({ ...partition, at: 12, from: 'right' }), 36, 30.5, 0, 4,
    ))[0];
    const left = interiorDimensions(placedInterior(
      group('vertical', [{ ...fixed, at: 36 }], [horizontal(partition), {}]), 36, 84, 10, 0,
    ))[1];
    expect(dragDividerPosition(bottom, { z: 3.03 })).toEqual({ at: 45 });
    expect(dragDividerPosition(right, { x: 2.5 })).toEqual({ at: 9.5, from: 'right' });
    expect(dragDividerPosition(left, { x: -0.04 })).toEqual({ at: 17.9375, from: 'left' });
    expect(dragDividerPosition(bottom, { z: -45 })).toEqual({ at: 0.0625 });
    expect(dragDividerPosition(bottom, { x: 500, z: 100 })).toEqual({ at: 142 });
    expect(dragDividerPosition(right, { x: 50, z: 500 })).toEqual({ at: 0.0625, from: 'right' });
    expect(dragDividerPosition(left, { x: -50, z: 500 })).toEqual({ at: 0.0625, from: 'left' });
  });

  it('anchor 6: resolves two base cabinets and no filler in one elevation parts pass', () => {
    const stored = structuredClone(document.rooms.find((room) => room.name === 'G1 Euro kitchen'));
    const wall = stored.walls[0];
    const run = wall.runs.find((entry) => entry.id === 'b822e8ac-1a44-47ca-acec-ecb93caf7b8a');
    wall.runs = [run];
    run.grid.cols = run.grid.cols.slice(0, 2).map(({ id }) => ({ id, size: null, sizeMode: 'auto' }));
    run.grid.cells = run.grid.cells.slice(0, 2);
    run.grid.cells[0].node.interior = vertical({ kind: 'stretcher' });
    const room = syncRoom(stored, settings);
    const syncedWall = room.walls[0];
    const parts = elevationParts(room, syncedWall, 'front', settings);
    expect(parts.filter((part) => part.kind === 'filler')).toHaveLength(1);
    const spy = vi.spyOn(elevationPartsModule, 'elevationParts');
    let interiors;
    try {
      interiors = wallInteriors(room, syncedWall, 'front', settings);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
    expect(interiors).toHaveLength(2);
    expect(interiors).toEqual(parts.filter((part) => part.kind === 'cabinet').map((part) => ({
      itemId: part.id, runId: run.id,
      ...placeInterior(cabinetInterior(room, syncedWall, 'front', settings, part.id)),
    })));
    expect(interiors[1].sections).toHaveLength(1);
    expect(interiorDimensions(interiors[1])).toEqual([]);
    expect(wallInteriors(room, syncedWall, 'back', settings)).toEqual([]);
    syncedWall.runs.forEach((entry) => { entry.wallSide = 'back'; });
    expect(wallInteriors(room, syncedWall, 'back', settings)).toEqual(
      elevationParts(room, syncedWall, 'back', settings).filter((part) => part.kind === 'cabinet')
        .map((part) => ({ itemId: part.id, runId: run.id,
          ...placeInterior(cabinetInterior(room, syncedWall, 'back', settings, part.id)) })),
    );
  });

  it('shares lanes across paths only on the same axis, anchor and side for all five kinds', () => {
    const tree = group('horizontal', [
      { ...partition, at: 10 }, { kind: 'double_partition', at: 20 },
      { ...partition, at: 6, from: 'right' },
    ], [
      vertical({ kind: 'stretcher', at: 30 }, { kind: 'double_fixed', at: 20 }),
      horizontal({ ...partition, at: 13 }, { ...partition, at: 17 }),
      group('vertical', [{ ...fixed, at: 40 }], [{}, horizontal({ ...partition, at: 24 })]),
      horizontal({ ...partition, at: 3, from: 'right' }),
    ]);
    const placed = placedInterior(tree, 36, 84, 10, 4);
    const before = structuredClone(placed);
    expect(interiorDimensions(placed).map(({ key, lane }) => [key, lane])).toEqual([
      ['r:0', 0], ['r:1', 3], ['r:2', 1], ['r.0:0', 1], ['r.0:1', 0],
      ['r.1:0', 1], ['r.1:1', 2], ['r.2:0', 0], ['r.2.1:0', 0], ['r.3:0', 0],
    ]);
    expect(placed).toEqual(before);
    const warned = { box: { ...box(30, 30.5), x: 10, z: 4 },
      ...resolve(vertical({ ...fixed, at: 1, depth: 30 }), box(30, 30.5)) };
    expect(placeInterior(warned).warnings).toEqual(warned.warnings);
  });
});

describe('IN3.1 box part lines (doors-off view)', () => {
  const lines = (construction) => boxPartLines({ width: 30, height: 30.5 }, construction, 0.75);
  it('standard box: sides run the full height, top and bottom run between them', () => {
    expect(lines(standard)).toEqual([
      { part: 'left', x: 0.75, z: 0, width: 0, height: 30.5 },
      { part: 'right', x: 29.25, z: 0, width: 0, height: 30.5 },
      { part: 'bottom', x: 0.75, z: 0.75, width: 28.5, height: 0 },
      { part: 'top', x: 0.75, z: 29.75, width: 28.5, height: 0 },
    ]);
  });

  it('overlay top and bottom run the full width and cut the side lines between them', () => {
    expect(lines(boxConstruction({ box: { top: 'overlay', bottom: 'overlay' } }))).toEqual([
      { part: 'left', x: 0.75, z: 0.75, width: 0, height: 29 },
      { part: 'right', x: 29.25, z: 0.75, width: 0, height: 29 },
      { part: 'bottom', x: 0, z: 0.75, width: 30, height: 0 },
      { part: 'top', x: 0, z: 29.75, width: 30, height: 0 },
    ]);
  });

  it('parts left off draw nothing; between parts then run to the open side', () => {
    expect(lines(boxConstruction({ box: { left: false, top: 'none' } }))).toEqual([
      { part: 'right', x: 29.25, z: 0, width: 0, height: 30.5 },
      { part: 'bottom', x: 0, z: 0.75, width: 29.25, height: 0 },
    ]);
  });
});
