import { afterEach, describe, expect, it, vi } from 'vitest';
import { auto, room, run, wall } from '../../../test/builders.js';
import { newAccessory } from '../accessories.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { shapeBlockName, toDrawingPayload } from '../drawingPayload.js';
import { gridLeaves } from '../grid.js';
import { moveShapeOriginTo } from '../libraryShapes.js';
import * as showThroughModule from '../showThrough.js';

const ROD = {
  id: '3f9a2c1e-0000-0000-0000-000000000000', name: 'Closet rod', kind: 'accessory', version: 1, archived: false,
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
const HOOK = { ...ROD, id: 'a1b2c3d4-0000', name: 'Hook', box: { x: 0, y: 0, z: 0, w: 2, h: 4, d: 1.5 },
  views: { front: { units: 'in', points: { a: [0, 0], b: [2, 0], c: [2, 4], d: [0, 4] },
    loops: [{ id: 'hook', closed: true, segs: [
      { type: 'line', from: 'a', to: 'b' }, { type: 'line', from: 'b', to: 'c' },
      { type: 'line', from: 'c', to: 'd' }, { type: 'line', from: 'd', to: 'a' },
    ] }],
  } } };
const rodAccessory = { ...newAccessory([], 'ROD-ACC'), name: 'Closet rod', shapeId: RODC.id,
  size: { width: 'section', height: 3, depth: 2 }, depthAnchor: { at: 'centre', offset: 0 } };
const hookAccessory = { ...newAccessory([], 'HOOK-ACC'), name: 'Hook', shapeId: HOOK.id };
const settings = { ...DEFAULT_SETTINGS, shapes: [RODC, HOOK], accessories: [rodAccessory, hookAccessory] };
const source = room({ walls: [wall({ id: 'A', runs: [run({ id: 'r', x: 99.25, z: 9.25,
  width: 37.5, height: 81.5, depth: 23, cabinetTypeId: CABINET_TYPE_IDS.TALL, autoCount: false,
  ends: { left: { type: 'none' }, right: { type: 'none' } },
  items: [{ ...auto('cabinet'), face: { type: 'open', size: null },
    interior: { accessories: [{ accessoryId: 'ROD-ACC', fromBottom: 66 }] } }],
})] })], wallOrder: ['A'] });

afterEach(() => vi.restoreAllMocks());

describe('SH4 step d shape payloads', () => {
  it('anchor 1: exports the six stretched rod loops with depth, drawing label bounds and no box lines', () => {
    const before = structuredClone({ source, settings });
    const payload = toDrawingPayload(source, settings);
    const elevation = payload.elevations[0];
    expect(payload.payloadVersion).toBe(1);
    expect(elevation.letter).toBe('A');
    expect(elevation.shapes).toHaveLength(1);
    const [shape] = elevation.shapes;
    expect(shape).toMatchObject({ partId: 'cabinet', kind: 'accessory', depth: 10 });
    expect(shape).not.toHaveProperty('block');
    expect(shape.loops).toEqual([
      { closed: true, points: [[100, 74.5, 0], [103, 74.5, 0], [103, 77.5, 0], [100, 77.5, 0]] },
      { closed: true, points: [[133, 74.5, 0], [136, 74.5, 0], [136, 77.5, 0], [133, 77.5, 0]] },
      { closed: true, points: [[100.875, 76, 1], [102.125, 76, 1]] },
      { closed: true, points: [[133.875, 76, 1], [135.125, 76, 1]] },
      { closed: false, points: [[103, 76.53125, 0], [133, 76.53125, 0]] },
      { closed: false, points: [[103, 75.46875, 0], [133, 75.46875, 0]] },
    ]);
    const interior = elevation.interiors.find(({ partId }) => partId === 'cabinet');
    expect(interior.labels).toEqual([{ text: 'Closet rod', x: 100, z: 74.5, width: 36, height: 3 }]);
    for (const z of [74.5, 77.5]) {
      expect(interior.lines).not.toContainEqual({ x1: 100, z1: z, x2: 136, z2: z });
      expect(interior.lines).not.toContainEqual({ x1: 136, z1: z, x2: 100, z2: z });
    }
    expect({ source, settings }).toEqual(before);
  });

  it('anchor 2: exports fixed and mirrored hook blocks at their resolved insert points', () => {
    for (const [mirror, x] of [[false, 117], [true, 119]]) {
      const copy = structuredClone(source);
      gridLeaves(copy.walls[0].runs[0].grid)[0].interior.accessories = [
        { accessoryId: 'HOOK-ACC', fromBottom: 50, mirror },
      ];
      const [shape] = toDrawingPayload(copy, settings).elevations[0].shapes;
      expect(shape.block).toEqual({ name: 'SHAPE_HOOK_A1B2C3', x, z: 60, mirror });
      expect(shape.loops[0].points).toEqual(mirror
        ? [[119, 60, 0], [117, 60, 0], [117, 64, 0], [119, 64, 0]]
        : [[117, 60, 0], [119, 60, 0], [119, 64, 0], [117, 64, 0]]);
    }
  });

  it('anchor 3: omits shapes when opaque doors hide the drawings or a drawing is unavailable', () => {
    const copy = structuredClone(source);
    gridLeaves(copy.walls[0].runs[0].grid)[0].face.type = 'door';
    for (const elevation of toDrawingPayload(copy, settings).elevations) {
      expect(elevation).not.toHaveProperty('shapes');
    }
    const elevation = toDrawingPayload(source, { ...settings, shapes: [] }).elevations[0];
    expect(elevation).not.toHaveProperty('shapes');
    expect(elevation.interiors[0].lines).toContainEqual({ x1: 100, z1: 74.5, x2: 136, z2: 74.5 });
    expect(elevation.interiors[0].labels).toEqual([{ text: 'Closet rod', x: 100, z: 74.5, width: 36, height: 3 }]);
  });

  it('anchor 4: shifts second-face rod points and hook block x by 120, preserving bulges and depth', () => {
    const copy = structuredClone(source);
    const second = copy.walls[0];
    second.id = 'B';
    second.x1 = 120;
    second.x2 = 264;
    second.connections = { start: { wallId: 'A', endpoint: 'end' }, end: null };
    gridLeaves(second.runs[0].grid)[0].interior.accessories.push(
      { accessoryId: 'HOOK-ACC', fromBottom: 50, mirror: true });
    copy.walls.unshift(wall({ id: 'A', x1: 0, x2: 120,
      connections: { start: null, end: { wallId: 'B', endpoint: 'start' } } }));
    copy.wallOrder = ['A', 'B'];
    const separate = toDrawingPayload(copy, settings).elevations.find(({ wallId }) => wallId === 'B').shapes;
    copy.combinedElevations = [{ id: 'combined', on: true, faces: ['A', 'B'] }];
    const combined = toDrawingPayload(copy, settings).elevations[0];
    expect(combined.faces.map(({ dx }) => dx)).toEqual([0, 120]);
    expect(combined.shapes).toEqual(separate.map((shape) => ({ ...shape,
      loops: shape.loops.map((loop) => ({ ...loop, points: loop.points.map(([x, ...rest]) => [x + 120, ...rest]) })),
      ...(shape.block ? { block: { ...shape.block, x: shape.block.x + 120 } } : {}),
    })));
    const withoutDrawings = toDrawingPayload(copy, { ...settings, shapes: [] }).elevations[0];
    expect(withoutDrawings).not.toHaveProperty('shapes');
  });

  it('anchor 5: sanitizes block names, truncating the label and alphanumeric id independently', () => {
    expect(shapeBlockName('Closet rod', '3f9a2c1e-0000')).toBe('SHAPE_CLOSET_ROD_3F9A2C');
    expect(shapeBlockName('  hook (left)!! ', 'ab-12')).toBe('SHAPE_HOOK_LEFT_AB12');
    const long = shapeBlockName('a'.repeat(60), 'abc-123456');
    expect(long).toBe(`SHAPE_${'A'.repeat(40)}_ABC123`);
    expect(long).toMatch(/^[A-Z0-9_]{1,64}$/);
  });

  it('filters unknown part ids, retains label-only interiors and emits one drawing per item in order', () => {
    const drawing = { shapeId: HOOK.id, shapeName: HOOK.name, depth: 2, stretched: false,
      insert: { x: 117, z: 60 }, mirror: false,
      outlines: [{ closed: false, outline: [[117, 60, 0.414214], [119, 64, 0]] }] };
    const item = { kind: 'accessory', label: '2 × Hook', x: 117, z: 60, width: 2, height: 4, drawing };
    const entry = { itemId: 'cabinet', glass: [], items: [item,
      { ...item, label: 'Closet rod', drawing: { ...drawing, depth: 10, stretched: true } }] };
    const show = vi.spyOn(showThroughModule, 'wallShowThrough').mockReturnValue(new Map([
      ['cabinet', entry], ['missing', { ...entry, itemId: 'missing' }],
    ]));
    const before = structuredClone(entry);
    const elevation = toDrawingPayload(source, settings).elevations[0];
    expect(elevation.shapes.map(({ partId, depth }) => [partId, depth])).toEqual([['cabinet', 2], ['cabinet', 10]]);
    expect(elevation.shapes[0].loops).toEqual([{ closed: false, points: [[117, 60, 0.414214], [119, 64, 0]] }]);
    expect(elevation.interiors).toEqual([{ partId: 'cabinet', lines: [], labels: [
      { text: '2 × Hook', x: 117, z: 60, width: 2, height: 4 },
      { text: 'Closet rod', x: 117, z: 60, width: 2, height: 4 },
    ] }]);
    expect(entry).toEqual(before);
    show.mockReturnValue(new Map([['cabinet', { ...entry, items: [] }]]));
    expect(toDrawingPayload(source, settings).elevations[0]).not.toHaveProperty('shapes');
  });
});
