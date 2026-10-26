import { describe, expect, it } from 'vitest';
import { room, wall, run, auto } from '../../../test/builders.js';
import { newAccessory, sectionAccessories } from '../accessories.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { toDrawingPayload } from '../drawingPayload.js';
import { moveShapeOriginTo } from '../libraryShapes.js';
import { wallInteriorData } from '../shelves.js';
import { wallShowThrough } from '../showThrough.js';

const ROD = {
  id: 'rod', name: 'Closet rod', kind: 'accessory', version: 1, archived: false,
  box: { x: 0, y: 0, z: 0, w: 30, h: 3, d: 2 }, stretch: {},
  views: { front: {
    units: 'in',
    points: {
      a: [0, 0], b: [3, 0], c: [3, 3], d: [0, 3],
      e: [27, 0], f: [30, 0], g: [30, 3], h: [27, 3],
      hl: [0.875, 1.5], hr: [2.125, 1.5], jl: [27.875, 1.5], jr: [29.125, 1.5],
      r1: [3, 2.03125], r2: [27, 2.03125], r3: [3, 0.96875], r4: [27, 0.96875],
    },
    loops: [
      { id: 'left', closed: true, segs: [
        { type: 'line', from: 'a', to: 'b' }, { type: 'line', from: 'b', to: 'c' },
        { type: 'line', from: 'c', to: 'd' }, { type: 'line', from: 'd', to: 'a' },
      ] },
      { id: 'right', closed: true, segs: [
        { type: 'line', from: 'e', to: 'f' }, { type: 'line', from: 'f', to: 'g' },
        { type: 'line', from: 'g', to: 'h' }, { type: 'line', from: 'h', to: 'e' },
      ] },
      { id: 'hole-left', closed: true, segs: [
        { type: 'arc', from: 'hl', to: 'hr', center: [1.5, 1.5], ccw: true },
        { type: 'arc', from: 'hr', to: 'hl', center: [1.5, 1.5], ccw: true },
      ] },
      { id: 'hole-right', closed: true, segs: [
        { type: 'arc', from: 'jl', to: 'jr', center: [28.5, 1.5], ccw: true },
        { type: 'arc', from: 'jr', to: 'jl', center: [28.5, 1.5], ccw: true },
      ] },
      { id: 'rod-top', closed: false, segs: [{ type: 'line', from: 'r1', to: 'r2' }] },
      { id: 'rod-bottom', closed: false, segs: [{ type: 'line', from: 'r3', to: 'r4' }] },
    ],
  } },
};

const RODC = moveShapeOriginTo({ ...ROD, stretch: { x: [[3, 27]] } }, { x: 15, z: 1.5 });
const accessory = { ...newAccessory([], 'ROD-ACC'), name: 'Closet rod', shapeId: RODC.id,
  size: { width: 'section', height: 3, depth: 2 } };
const settings = { ...DEFAULT_SETTINGS, accessories: [accessory], shapes: [RODC] };
const section = { path: 'r', x: 100, z: 10, width: 36, height: 80, depth: 24 };
const interior = { tree: { accessories: [{ accessoryId: accessory.id, fromBottom: 66 }] }, sections: [section] };

// These are already resolved interior sections, in wall coordinates.
const resolve = (effective = settings, inside = interior) => sectionAccessories({ interior: inside,
  settings: effective }).get('r').items[0];

describe('SH3 step c accessory drawings', () => {
  it('anchor 1: resolves all six RODC outlines and uses their placed bounds without mutating inputs', () => {
    const before = structuredClone({ interior, settings });
    const item = resolve();
    expect(item.drawing.bounds).toEqual({ x: 100, z: 74.5, width: 36, height: 3 });
    expect(item.rect).toBe(item.drawing.bounds);
    expect(item.drawing.outlines).toHaveLength(6);
    expect(item.drawing.outlines.slice(4)).toEqual([
      { closed: false, outline: [[103, 76.53125, 0], [133, 76.53125, 0]] },
      { closed: false, outline: [[103, 75.46875, 0], [133, 75.46875, 0]] },
    ]);
    expect(item.warnings).toEqual([]);
    expect({ interior, settings }).toEqual(before);
  });

  it('anchor 2: keeps the labelled box for a missing drawing and warns, but permits no drawing pick', () => {
    const item = resolve({ ...settings, accessories: [{ ...accessory, shapeId: 'gone' }] });
    expect(item).not.toHaveProperty('drawing');
    expect(item.rect).toEqual({ x: 100, z: 74.5, width: 36, height: 3 });
    expect(item.warnings).toEqual([{ code: 'accessory-shape-missing' }]);
    expect(resolve({ ...settings, shapes: undefined }).warnings).toEqual(item.warnings);
    const plain = resolve({ ...settings, accessories: [{ ...accessory, shapeId: null }] });
    expect(plain).not.toHaveProperty('drawing');
    expect(plain.rect).toEqual(item.rect);
    expect(plain.warnings).toEqual([]);
  });

  it('anchor 3: leaves an undersized rod unstretched and checks its actual bounds against the section', () => {
    const item = resolve(settings, { ...interior, sections: [{ ...section, width: 5 }] });
    expect(item.drawing.bounds).toEqual({ x: section.x - 12.5, z: 74.5, width: 30, height: 3 });
    expect(item.rect).toBe(item.drawing.bounds);
    expect(item.warnings).toEqual([
      { code: 'accessory-shape-too-small', axis: 'x', fixed: 6, target: 5 },
      { code: 'accessory-outside', sectionHeight: 80 },
    ]);
  });

  it('uses the shape box for blank sizes, draws archived picks, mirrors arcs and leaves unplaced picks undrawn', () => {
    const effective = { ...settings, shapes: [{ ...RODC, archived: true }],
      accessories: [{ ...accessory, size: { width: null, height: null, depth: null } }] };
    const mirrored = resolve(effective, { ...interior,
      tree: { accessories: [{ ...interior.tree.accessories[0], mirror: true }] } });
    expect(mirrored.rect).toEqual({ x: 103, z: 74.5, width: 30, height: 3 });
    expect(mirrored.drawing.outlines[2].outline).toEqual([[132.125, 76, -1], [130.875, 76, -1]]);
    expect(mirrored.warnings).toEqual([]);
    const unplaced = resolve(effective, { ...interior, tree: { accessories: [{ accessoryId: accessory.id }] } });
    expect(unplaced).not.toHaveProperty('drawing');
    expect(unplaced.rect).toBeNull();
    expect(unplaced.warnings).toEqual([]);
  });

  it('carries drawing bounds and outlines through show-through while exporting labelled boxes', () => {
    const source = room({ walls: [wall({ runs: [run({ width: 40, height: 84,
      cabinetTypeId: CABINET_TYPE_IDS.TALL, autoCount: false,
      ends: { left: { type: 'none' }, right: { type: 'none' } },
      items: [{ ...auto('cabinet'), face: { type: 'open', size: null },
        interior: { accessories: [{ accessoryId: accessory.id, qty: 2, fromBottom: 66 }] } }],
    })] })] });
    // The fixed shape is narrower than the section: show-through must use drawing bounds.
    const effective = { ...settings, shapes: [{ ...RODC, stretch: {} }] };
    const front = source.walls[0];
    const data = wallInteriorData(source, front, 'front', effective);
    const resolved = data.accessories.get('cabinet').get('r').items[0];
    const shown = wallShowThrough(source, front, 'front', effective).get('cabinet').items
      .find(({ kind }) => kind === 'accessory');
    expect(shown).toEqual({ key: 'accessory:r:0', kind: 'accessory', ...resolved.drawing.bounds,
      drawing: resolved.drawing, label: '2 × Closet rod' });
    expect(shown.width).toBe(30);
    const payload = toDrawingPayload(source, effective);
    const exported = payload.elevations.flatMap(({ interiors = [] }) => interiors)
      .find(({ partId }) => partId === 'cabinet');
    expect(exported.labels).toContainEqual({ text: '2 × Closet rod', ...resolved.drawing.bounds });
    expect(exported).not.toHaveProperty('drawing');
    expect(exported.lines).toContainEqual({ x1: shown.x, z1: shown.z, x2: shown.x + shown.width, z2: shown.z });
  });
});
