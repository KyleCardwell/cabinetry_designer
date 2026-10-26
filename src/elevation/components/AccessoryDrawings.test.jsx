import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Group, Rect, Shape, Text } from 'react-konva';
import { room, wall, run, auto } from '../../test/builders.js';
import { newAccessory } from '../model/accessories.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../model/constants.js';
import { moveShapeOriginTo } from '../model/libraryShapes.js';
import { wallInteriorData } from '../model/shelves.js';
import { wallShowThrough } from '../model/showThrough.js';
import { wallRectToScreen } from '../canvas/transform.js';
import InteriorShapes from './InteriorShapes.jsx';
import ShowThroughInteriors from './ShowThroughInteriors.jsx';

vi.mock('react', async (original) => ({
  ...await original(), useRef: (current) => ({ current }), useMemo: (callback) => callback(),
}));
vi.mock('react-konva', () => ({ Group: 'group', Line: 'line', Rect: 'rect', Shape: 'shape', Text: 'text' }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const transform = { scale: 2, offsetX: 20, offsetY: 30, wallHeight: 120 };

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

let effective, currentRoom, currentWall, data, entry;
beforeEach(() => {
  effective = structuredClone(settings);
  currentWall = wall({ height: 120, runs: [run({
    cabinetTypeId: CABINET_TYPE_IDS.TALL, x: 99.25, width: 37.5, height: 84, autoCount: false,
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    items: [{ ...auto('cabinet'), face: { type: 'open', size: null },
      interior: { accessories: [{ accessoryId: 'ROD-ACC', fromBottom: 66 }] } }],
  })] });
  currentRoom = room({ walls: [currentWall] });
  data = wallInteriorData(currentRoom, currentWall, 'front', effective);
  entry = data.interiors.get('cabinet');
});

describe('SH3 step d accessory shapes', () => {
  it('anchor 1: draws six doors-off outlines and labels the 36 × 3 rod above its bounds', () => {
    const resolved = data.accessories.get('cabinet').get('r').items[0];
    expect(resolved.drawing.bounds).toMatchObject({ width: 36, height: 3 });
    for (const [selectedPieceId, color] of [['cabinet', '#7dd3fc'], [null, '#64748b']]) {
      const tree = nodes(InteriorShapes({ entries: [entry], accessories: data.accessories,
        drawnPieces: [], transform, selectedPieceId }));
      const group = tree.find(({ type, key }) => type === Group && key === 'placed-accessory:r:0');
      const children = nodes(group);
      const shapes = children.filter(({ type }) => type === Shape);
      expect(shapes).toHaveLength(6);
      expect(children.some(({ type }) => type === Rect)).toBe(false);
      const label = children.find(({ type }) => type === Text);
      const box = wallRectToScreen(resolved.drawing.bounds, transform);
      expect(label.props).toMatchObject({ text: 'Closet rod', x: box.x + 3, y: box.y - 13,
        fill: color, listening: false });
      shapes.forEach(({ props }, index) => {
        expect(props).toMatchObject({ stroke: color, strokeWidth: 1, fillEnabled: false, listening: false });
        const ctx = Object.fromEntries(['beginPath', 'moveTo', 'lineTo', 'arc', 'closePath', 'fillStrokeShape']
          .map((name) => [name, vi.fn()]));
        props.sceneFunc(ctx, {});
        expect(ctx.closePath).toHaveBeenCalledTimes(index < 4 ? 1 : 0);
        if (index === 2 || index === 3) expect(ctx.arc).toHaveBeenCalledTimes(2);
      });
    }
  });

  it('anchor 2: draws the same six outlines through an open face on the normal elevation', () => {
    const entries = [...wallShowThrough(currentRoom, currentWall, 'front', effective).values()];
    expect(entries).toHaveLength(1);
    const tree = nodes(ShowThroughInteriors({ entries, transform, room: currentRoom,
      wall: currentWall, settings: effective }));
    const group = tree.find(({ type, key }) => type === Group && key === 'accessory:r:0');
    const children = nodes(group);
    const shapes = children.filter(({ type }) => type === Shape);
    expect(shapes).toHaveLength(6);
    expect(children.some(({ type }) => type === Rect)).toBe(false);
    expect(shapes.every(({ props }) => props.stroke === '#94a3b8' && props.strokeWidth === 1
      && props.fillEnabled === false && props.listening === false)).toBe(true);
    const bounds = data.accessories.get('cabinet').get('r').items[0].drawing.bounds;
    expect(children.find(({ type }) => type === Text).props).toMatchObject({ text: 'Closet rod',
      y: wallRectToScreen(bounds, transform).y - 13 });
    const ctx = { beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fillStrokeShape: vi.fn() };
    shapes[4].props.sceneFunc(ctx, {});
    expect(ctx.lineTo).toHaveBeenCalledOnce();
    expect(ctx.closePath).not.toHaveBeenCalled();
  });

  it('anchor 3: keeps an amber labelled Rect when the drawing is missing', () => {
    effective.shapes = [];
    data = wallInteriorData(currentRoom, currentWall, 'front', effective);
    const tree = nodes(InteriorShapes({ entries: [entry], accessories: data.accessories,
      drawnPieces: [], transform, selectedPieceId: 'cabinet' }));
    const children = nodes(tree.find(({ type, key }) => type === Group && key === 'placed-accessory:r:0'));
    expect(children.some(({ type }) => type === Shape)).toBe(false);
    expect(children.find(({ type }) => type === Rect).props).toMatchObject({ stroke: '#f59e0b',
      strokeWidth: 1, fillEnabled: false, listening: false });
    expect(children.find(({ type }) => type === Text).props).toMatchObject({ text: 'Closet rod', fill: '#f59e0b' });
  });
});
