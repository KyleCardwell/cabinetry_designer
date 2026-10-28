import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { Text } from 'react-konva';
import { room, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import CombinedFaces from '../CombinedFaces.jsx';
import DoorDetails from '../DoorDetails.jsx';
import ElevationDimensions from '../ElevationDimensions.jsx';
import FaceOutlines from '../FaceOutlines.jsx';
import InteriorShapes, { placedAccessoryShape } from '../InteriorShapes.jsx';
import NeighborReturns from '../NeighborReturns.jsx';
import PieceRect from '../PieceRect.jsx';
import RecessShapes, { RecessOutline } from '../RecessShapes.jsx';
import ShowThroughInteriors from '../ShowThroughInteriors.jsx';
import SoffitShapes from '../SoffitShapes.jsx';
import WallFrame from '../WallFrame.jsx';

vi.mock('react', async (original) => ({
  ...await original(),
  useMemo: (callback) => callback(),
  useRef: (current) => ({ current }),
  useState: vi.fn((initial) => [initial, vi.fn()]),
}));
vi.mock('react-konva', () => ({
  Group: 'group', Label: 'label', Layer: 'layer', Line: 'line', Rect: 'rect',
  Shape: 'shape', Tag: 'tag', Text: 'text',
}));
vi.mock('../../canvas/cursor.js', async (original) => ({
  ...await original(), useCursorKeys: () => ({ request: vi.fn(), release: vi.fn() }),
}));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const texts = (tree) => nodes(tree).filter(({ type }) => type === Text).map(({ props }) => props);
const base = { scale: 10, offsetX: 20, offsetY: 30, wallHeight: 96 };
const scaled = { ...base, text: { label: 2, dimension: 1.4 } };
const panel = { id: 'back', kind: 'back_panel', x: 0, z: 0, width: 24, height: 30 };

beforeEach(() => {
  useState.mockReset().mockImplementation((initial) => [initial, vi.fn()]);
});

describe('TX1 elevation labels', () => {
  it.each([
    [1, 13], [2, 26], [undefined, 13],
  ])('anchors 1–3: back-panel sub-label with factor %s uses %s px', (factor, fontSize) => {
    const transform = factor === undefined ? base : { ...base, text: { label: factor } };
    const notes = factor === 2 ? ['Painted'] : [];
    const render = (piece = panel) => texts(PieceRect({ piece, transform, subLabel: 'back', notes }));
    expect(render()).toEqual([expect.objectContaining({
      text: ['back', ...notes].join('\n'), fontSize,
    })]);
    if (factor === 2) {
      expect(render({ ...panel, width: 6 })).toHaveLength(0);
      expect(render({ ...panel, height: 3 })).toHaveLength(0);
      useState.mockReturnValueOnce([true, vi.fn()]);
      const hovered = texts(PieceRect({
        piece: { ...panel, kind: 'cabinet', auto: false }, transform, subLabel: 'back',
      }));
      expect(hovered.find(({ text }) => text === '*')).toMatchObject({ fontSize: 26, width: 16 });
      expect(hovered.find(({ text }) => text.includes(' · back'))).toMatchObject({ fontSize: 22 });
    }
  });

  it('anchor 4: accessory labels use 30 px at factor 3, including placed labels and their fit checks', () => {
    const transform = { ...base, text: { label: 3 } };
    const section = { path: 'r', x: 0, z: 0, width: 24, height: 30 };
    const render = (width = 24) => texts(InteriorShapes({
      entries: [{ itemId: 'cabinet', sections: [{ ...section, width }], dividers: [] }],
      drawnPieces: [], transform,
      accessories: new Map([['cabinet', new Map([['r', {
        warnings: [], items: [{ index: 0, qty: 1, warnings: [],
          accessory: { name: 'Tray', attachesTo: 'section' } }],
      }]])]]),
    }));
    expect(render()).toEqual([expect.objectContaining({ text: 'Tray', fontSize: 30 })]);
    expect(render(7)).toHaveLength(0); // 70 px cannot fit 4 × 18 px plus the insets.
    const placed = (box, rect) => texts(placedAccessoryShape({
      shapeKey: 'tray', text: 'Tray', color: '#94a3b8', transform, box, rect,
    }));
    expect(placed({ x: 0, y: 0, width: 100, height: 40 }, { x: 0, y: 0, width: 100, height: 40 })[0])
      .toMatchObject({ fontSize: 30, verticalAlign: 'middle' });
    expect(placed({ x: 0, y: 0, width: 20, height: 40 }, { x: 0, y: 0, width: 120, height: 60 })[0])
      .toMatchObject({ fontSize: 30, x: 23, y: 5 });
    expect(placed({ x: 0, y: 60, width: 20, height: 10 }, { x: 0, y: 0, width: 100, height: 100 })[0])
      .toMatchObject({ fontSize: 30, y: 27 });
    expect(placed({ x: 0, y: 0, width: 70, height: 29 }, { x: 0, y: 0, width: 70, height: 29 }))
      .toHaveLength(0);
  });

  it('anchor 5: door tags use 18 px at factor 2 and scaled fit thresholds', () => {
    const part = { key: 'door', label: 'Shaker', x: 0, z: 0, width: 24, height: 30 };
    const render = (width, height, transform = scaled) => texts(DoorDetails({
      parts: [{ ...part, width, height }], warnings: [], transform, showTags: true,
    }));
    expect(render(24, 30)).toEqual([expect.objectContaining({ text: 'Shaker', fontSize: 18 })]);
    expect(render(2.7, 2.4)).toHaveLength(0);
    expect(render(2.8, 2.3)).toHaveLength(0);
    expect(render(2.8, 2.4)).toHaveLength(1);
    expect(render(1.4, 1.2, base)[0].fontSize).toBe(9);
  });

  it('scales face sizes and show-through rollout labels, hiding them when the scaled text cannot fit', () => {
    const face = { path: 'r', x: 0, z: 0, width: 24, height: 30 };
    const faceLabels = (width, height, transform) => texts(FaceOutlines({
      faces: [{ ...face, width, height }], transform, showSizes: true,
    }));
    expect(faceLabels(24, 30, scaled)[0].fontSize).toBe(20);
    expect(faceLabels(24, 2.5, scaled)).toHaveLength(0);
    expect(faceLabels(2, 30, scaled)).toHaveLength(0);
    expect(faceLabels(2, 30, base)).toHaveLength(1);
    const rolloutLabels = (width, height, transform) => texts(ShowThroughInteriors({
      entries: [{ itemId: 'cabinet', windows: [], glass: [],
        items: [{ ...face, key: 'rollout', kind: 'rollout', width, height }] }], transform,
    }));
    expect(rolloutLabels(24, 4, scaled)[0].fontSize).toBe(20);
    expect(rolloutLabels(24, 2, scaled)).toHaveLength(0);
    expect(rolloutLabels(24, 2, base)).toHaveLength(1);
    expect(rolloutLabels(4, 4, scaled)).toHaveLength(0);
  });

  it('scales recess, soffit, neighbor, crown, combined depth and elevation title labels', () => {
    const w = wall({ length: 144, height: 96, elevationForced: true,
      recesses: [{ id: 'recess', label: 'Niche', width: 36, depth: 12, bottom: 0,
        offset: 0, offsetFrom: 'left' }],
      soffits: [{ id: 'soffit', x: 60, width: 24, depth: 12, bottom: 84 }],
    });
    const r = room({ walls: [w], wallOrder: [w.id] });
    const props = { room: r, wall: w, settings: DEFAULT_SETTINGS, transform: scaled };
    for (const tree of [RecessShapes(props), RecessOutline({ ...props, recessId: 'recess' }), SoffitShapes(props)]) {
      expect(texts(tree)).toEqual([expect.objectContaining({ fontSize: 20 })]);
    }
    expect(texts(WallFrame({ ...props, crownTop: 90 }))[0]).toMatchObject({ fontSize: 22 });
    expect(texts(NeighborReturns({ ...props, shapes: [{
      kind: 'return', key: 'return', wallId: w.id,
      parts: [{ id: 'section', kind: 'section', x: 0, z: 0, width: 24, height: 30 }],
    }] }))[0]).toMatchObject({ fontSize: 20 });
    const faces = [
      { key: 'active', wallId: w.id, dx: 0, depth: 24, length: 144, height: 96 },
      { key: 'other', wallId: w.id, dx: 144, depth: 12, length: 144, height: 96 },
    ];
    expect(texts(CombinedFaces({ ...props, combined: { faces }, activeKey: 'active',
      faces: new Map([['other', { wall: w, shapes: [] }]]), doorsOff: true, diagnostics: {},
    }))[0]).toMatchObject({ text: '12" back', fontSize: 24 });
    const rows = { inner: [], middle: [], outer: [] };
    const offsets = { inner: 10, middle: 20, outer: 30 };
    expect(texts(ElevationDimensions({ ...props, selection: {},
      dimensionChains: { lower: rows, upper: rows, vertical: { left: rows, right: rows } },
      dimensionOffsets: { lower: offsets, upper: offsets, vertical: { left: offsets, right: offsets },
        clear: {}, label: 50 },
    }))[0]).toMatchObject({ text: 'Elevation A', fontSize: 40, width: 280, offsetX: 140 });
  });
});
