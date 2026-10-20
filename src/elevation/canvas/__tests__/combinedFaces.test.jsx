import { describe, expect, it, vi } from 'vitest';
import { combinedViewOf } from '../../model/combinedElevations.js';
import { cornerShapes } from '../../model/cornerParts.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { combinedDepthNote, combinedFaceTransforms, fitWallToViewport, wallToScreen } from '../transform.js';
import CombinedFaces, { resolveCombinedFaces } from '../../components/CombinedFaces.jsx';
import RunGroup from '../../components/RunGroup.jsx';

vi.mock('react', async (original) => ({ ...await original(), useMemo: (callback) => callback() }));
vi.mock('react-konva', () => ({
  Group: 'group', Layer: 'layer', Rect: 'rect', Text: 'text', Line: 'line',
  Shape: 'shape', Label: 'label', Tag: 'tag',
}));
vi.mock('../../model/cornerParts.js', () => ({ cornerShapes: vi.fn(() => []) }));
vi.mock('../../model/showThrough.js', () => ({ wallShowThrough: vi.fn(() => new Map()) }));

const wall = (id, x1, y1, x2, y2, start, end, runs = []) => ({
  id, name: '', x1, y1, x2, y2, height: 96, thickness: 4.5, flipped: false,
  runs, openings: [], recesses: [], soffits: [], connections: { start, end },
});
const to = (wallId, endpoint) => ({ wallId, endpoint });

/** A stepped wall: A, a 16" jog J, B set back 16", a jog K, then C; cabinets on A and C. */
function steppedRoom(extra = {}) {
  return {
    id: 'room-1',
    wallOrder: ['A', 'J', 'B', 'K', 'C'],
    walls: [
      wall('A', 0, 0, 100, 0, null, to('J', 'start'), [{ id: 'a' }]),
      wall('J', 100, 0, 100, 16, to('A', 'end'), to('B', 'start')),
      wall('B', 100, 16, 160, 16, to('J', 'end'), to('K', 'start')),
      wall('K', 160, 16, 160, 0, to('B', 'end'), to('C', 'start')),
      wall('C', 160, 0, 240, 0, to('K', 'end'), null, [{ id: 'c' }]),
    ],
    ...extra,
  };
}

const room = () => steppedRoom({ combinedElevations: [{ id: 'g', on: true, faces: ['A', 'B', 'C'] }] });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];

describe('combined canvas faces', () => {
  it('places A, B and C at the anchor offsets regardless of which face is opened', () => {
    const layout = combinedViewOf(room(), 'A');
    expect(layout).toMatchObject({ length: 240, height: 96 });
    for (const [activeKey, offsetX] of [['A', 380], ['B', 260]]) {
      const transform = { scale: 2, offsetX, offsetY: 10, wallHeight: 96 };
      expect([...combinedFaceTransforms(transform, layout, activeKey)]).toEqual([
        ['A', { scale: 2, offsetX: 380, offsetY: 10, wallHeight: 96 }],
        ['B', { scale: 2, offsetX: 260, offsetY: 10, wallHeight: 96 }],
        ['C', { scale: 2, offsetX: 100, offsetY: 10, wallHeight: 96 }],
      ]);
      expect(transform.offsetX).toBe(offsetX);
    }
  });

  it('notes depth from the opened face, including fractions and equal-depth tolerance', () => {
    const [a, b, c] = combinedViewOf(room(), 'A').faces;
    expect(combinedDepthNote(b, a)).toBe('16" back');
    expect(combinedDepthNote(c, a)).toBeNull();
    expect(combinedDepthNote(a, b)).toBe('16" out');
    expect(combinedDepthNote(c, b)).toBe('16" out');
    expect(combinedDepthNote({ depth: -16.5 }, a)).toBe('16 1/2" back');
    expect(combinedDepthNote({ depth: 1e-7 }, a)).toBeNull();
  });

  it('fits the full elevation with a common floor, leaving the single-wall fit unchanged when off', () => {
    const stored = room();
    stored.walls[2].height = 72;
    const layout = combinedViewOf(stored, 'B');
    const viewport = { width: 520, height: 252 };
    const fitted = fitWallToViewport(layout, viewport, 20);
    expect(fitted).toEqual({ scale: 2, offsetX: 20, offsetY: 30, wallHeight: 96 });
    const active = { ...fitted, offsetX: fitted.offsetX + 80 * fitted.scale };
    const transforms = combinedFaceTransforms(active, layout, 'B');
    for (const face of layout.faces) {
      expect(wallToScreen({ x: 0, z: 0 }, transforms.get(face.key)).y).toBe(222);
    }
    stored.combinedElevations[0].on = false;
    const off = combinedViewOf(stored, 'B');
    expect(off).toBeNull();
    expect(combinedFaceTransforms(active, off, 'B').size).toBe(0);
    expect(fitWallToViewport(off ?? { length: 120, height: 60 }, { width: 340, height: 220 }, 20)).toEqual({
      scale: 2.5, offsetX: 20, offsetY: 35, wallHeight: 60,
    });
  });

  it('keeps shared neighbour part IDs on the first face even when another face is opened', () => {
    const stored = room();
    const layout = combinedViewOf(stored, 'B');
    cornerShapes.mockImplementation((_room, wall) => [{
      key: 'neighbor', kind: 'profile', parts: [{ id: 'shared' }, { id: `${wall.id}:own` }],
    }]);
    const faces = resolveCombinedFaces(stored, layout, {});
    expect(faces.get('A').shapes[0].parts.map(({ id }) => id)).toEqual(['shared', 'A:own']);
    expect(faces.get('B').shapes[0].parts.map(({ id }) => id)).toEqual(['B:own']);
    expect(faces.get('C').shapes[0].parts.map(({ id }) => id)).toEqual(['C:own']);
    cornerShapes.mockReset().mockReturnValue([]);
  });

  it('makes inactive faces display only and switches faces through their hit surfaces', () => {
    const stored = room();
    const layout = combinedViewOf(stored, 'B');
    const onActivate = vi.fn();
    const tree = nodes(CombinedFaces({
      room: stored, combined: layout, faces: resolveCombinedFaces(stored, layout, DEFAULT_SETTINGS),
      activeKey: 'B', settings: DEFAULT_SETTINGS, diagnostics: {},
      transform: { scale: 2, offsetX: 260, offsetY: 10, wallHeight: 96 }, onActivate,
    }));
    expect(tree[0].type).toBe('layer');
    expect(tree.filter(({ type, props }) => type === 'group' && props.listening === false)).toHaveLength(2);
    expect(tree.filter(({ type }) => type === RunGroup).map(({ props }) => props)).toEqual([
      expect.objectContaining({ stretchable: false, showDimensions: false }),
      expect.objectContaining({ stretchable: false, showDimensions: false }),
    ]);
    expect(tree.filter(({ type }) => type === 'text').map(({ props }) => props)).toEqual([
      expect.objectContaining({ x: 380, y: 20, width: 200, text: '16" out' }),
      expect.objectContaining({ x: 100, y: 20, width: 160, text: '16" out' }),
    ]);
    const hits = tree.filter(({ type, props }) => type === 'rect' && props.onClick);
    expect(hits).toHaveLength(2);
    const down = { cancelBubble: false };
    hits[0].props.onMouseDown(down);
    expect(down.cancelBubble).toBe(true);
    expect(onActivate).not.toHaveBeenCalled();
    const click = { cancelBubble: false };
    hits[1].props.onClick(click);
    expect(click.cancelBubble).toBe(true);
    expect(onActivate).toHaveBeenCalledWith(layout.faces[2]);
  });
});
