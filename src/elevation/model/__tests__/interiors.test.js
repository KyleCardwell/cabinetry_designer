import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { boxConstruction, cabinetInterior, interiorDepth, resolveInterior } from '../index.js';
import { findLeaf, splitGridCell } from '../cellTree.js';
import { elevationParts } from '../elevationParts.js';
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
