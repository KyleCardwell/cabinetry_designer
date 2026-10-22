import { describe, expect, it, vi } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { horizontalChains, openingChain, wallRow } from '../../model/dimensions.js';
import { syncRoom } from '../../model/room.js';
import { wallSideView } from '../../model/wallSides.js';
import { belowRowOffsets } from '../../canvas/dimensionLayout.js';
import DimensionRow from '../DimensionRow.jsx';
import ElevationDimensions from '../ElevationDimensions.jsx';

vi.mock('react-konva', () => ({
  Group: 'group', Layer: 'layer', Line: 'line', Rect: 'rect', Text: 'text',
}));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal(), useState: (initial) => [initial, vi.fn()], useMemo: (fn) => fn(),
}));
vi.mock('../../canvas/cursor.js', () => ({
  CURSORS: { select: 'select', explain: 'explain' }, useCursorKeys: () => ({ request: vi.fn(), release: vi.fn() }),
}));

const S = { ...DEFAULT_SETTINGS, runFlex: 0 };

function makeWall(id, x1, y1, x2, y2, overrides = {}) {
  return {
    id, name: '', numberOverride: null, x1, y1, x2, y2, height: 96, thickness: 4.5, flipped: false,
    connections: { start: null, end: null }, profile: {}, openings: [], joints: [], runs: [], ...overrides,
  };
}

function cabinetRun(id, cabinetTypeId, overrides = {}) {
  const upper = cabinetTypeId === CABINET_TYPE_IDS.UPPER;
  return {
    id, cabinetTypeId, x: 0, width: 30, z: upper ? 54 : 4,
    height: cabinetTypeId === CABINET_TYPE_IDS.TALL ? 86 : upper ? 36 : 30.5,
    depth: upper ? 12 : 24,
    ends: { left: { type: 'end_panel', width: null }, right: { type: 'end_panel', width: null } },
    autoCount: true, maxCabinetWidth: null, items: [], heightMode: 'auto', overrides: {},
    anchors: { left: false, right: false }, wallSide: 'front', ...overrides,
  };
}

/** Spec DM3 step a, case 1: tall + base joined, a window, a base. */
function anchorRoom() {
  const room = syncRoom({
    id: 'DM3',
    name: 'DM3',
    profile: { ...DEFAULT_SETTINGS.defaultProfile },
    wallOrder: ['A'],
    walls: [makeWall('A', 0, 0, 156, 0, {
      openings: [{
        id: 'window-1', kind: 'window', label: 'W1', measureMode: 'casing', width: 24, height: 48,
        sillZ: 36, offset: 90, offsetFrom: 'left', casing: { width: 3, thickness: 0.75 },
      }],
      runs: [
        cabinetRun('tall', CABINET_TYPE_IDS.TALL, { x: 0, width: 24 }),
        cabinetRun('base', CABINET_TYPE_IDS.BASE, { x: 24, width: 60 }),
        cabinetRun('base2', CABINET_TYPE_IDS.BASE, { x: 120, width: 36 }),
      ],
    })],
  }, S);
  return { room, wall: wallSideView(room.walls[0], 'front') };
}

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  if (typeof tree.type === 'function') return [tree, ...nodes(tree.type(tree.props))];
  return [tree, ...nodes(tree.props?.children)];
}

const transform = { scale: 4, offsetX: 0, offsetY: 400, wallHeight: 96 };

describe('DM3 step b canvas rows', () => {
  it('anchor: three rows below (inner, outer, wall); the inner row draws 0–84 and 120–156 apart', () => {
    const { room, wall } = anchorRoom();
    const lower = horizontalChains(room, wall, 'lower', S);
    const upper = horizontalChains(room, wall, 'upper', S);
    const chains = {
      lower,
      upper,
      openings: openingChain(room, wall, S),
      wall: wallRow(room, wall, S, lower.outer),
      clearances: [],
      vertical: { left: { inner: [], middle: [], outer: [] }, right: { inner: [], middle: [], outer: [] } },
    };
    const below = belowRowOffsets({ clearanceRow: false });
    const zero = { inner: 0, middle: 0, outer: 0 };
    const offsets = {
      lower: { inner: below.pieces, outer: below.overall },
      upper: { inner: 20, outer: 42 },
      vertical: { left: zero, right: zero },
      openings: below.openings,
      wall: below.openings,
      label: below.label,
      clear: { below: 0, above: 0, left: 0, right: 0 },
    };
    const tree = nodes(ElevationDimensions({
      dimensionChains: chains,
      dimensionOffsets: offsets,
      tool: 'select',
      transform,
      wall,
      room,
      selection: {},
      cursor: null,
    }));
    const drawnBelow = tree.filter(({ type, props }) => type === DimensionRow && props.side === 'below')
      .filter(({ props }) => props.segments.length > 0);
    expect(drawnBelow.map(({ props }) => props.offsetPx)).toEqual([below.pieces, below.overall, below.openings]);
    expect(drawnBelow[2].props.segments).toEqual([{ start: 0, end: 156, kind: 'wall' }]);
    expect(chains.openings).toEqual([]);

    // Lines plus their inline text gaps still cover 0–84 and 120–156, leaving the opening clear.
    const inner = nodes(DimensionRow({ ...drawnBelow[0].props, transform }));
    const rowY = (96 - 0) * 4 + 400 + below.pieces;
    const spans = inner
      .filter(({ type, props }) => type === 'line' && props.points[1] === rowY && props.points[3] === rowY)
      .map(({ props }) => [props.points[0] / 4, props.points[2] / 4])
      .concat(inner
        .filter(({ type, props }) => type === 'text' && props.y === rowY)
        .map(({ props }) => [(props.x - props.width / 2) / 4, (props.x + props.width / 2) / 4]))
      .sort((a, b) => a[0] - b[0]);
    const groups = [];
    for (const [start, end] of spans) {
      const last = groups.at(-1);
      if (last && Math.abs(start - last[1]) < 1e-6) last[1] = end;
      else groups.push([start, end]);
    }
    expect(groups).toEqual([[0, 84], [120, 156]]);
  });

  it('puts extension lines at every segment end of a gapped row, once each', () => {
    const segments = [
      { start: 0, end: 24, kind: 'piece' },
      { start: 24, end: 84, kind: 'piece' },
      { start: 120, end: 156, kind: 'piece' },
    ];
    const tree = nodes(DimensionRow({
      segments, orientation: 'horizontal', side: 'below', offsetPx: 20, transform,
    }));
    const extensions = tree.filter(({ type, props }) => type === 'line' && props.stroke === '#475569')
      .map(({ props }) => props.points[0] / 4);
    expect(extensions).toEqual([0, 24, 84, 120, 156]);
  });
});

describe('DM7 centred dimension text', () => {
  it('centres inline text in gapped rows and columns while retaining click bands and line styles', () => {
    const segment = { start: 0, end: 30, kind: 'run', pinned: true };
    const onSegmentClick = vi.fn();
    const cases = [
      { orientation: 'horizontal', side: 'below', x: 60, y: 804,
        points: [[0, 804, 49.4, 804], [70.6, 804, 120, 804]] },
      { orientation: 'horizontal', side: 'above', x: 60, y: 380,
        points: [[0, 380, 49.4, 380], [70.6, 380, 120, 380]] },
      { orientation: 'vertical', side: 'left', x: -20, y: 724,
        points: [[-20, 784, -20, 734.6], [-20, 713.4, -20, 664]] },
      { orientation: 'vertical', side: 'right', x: 644, y: 724,
        points: [[644, 784, 644, 734.6], [644, 713.4, 644, 664]] },
    ];
    for (const { orientation, side, x, y, points } of cases) {
      const tree = nodes(DimensionRow({
        segments: [segment], orientation, side, offsetPx: 20, transform,
        wallLength: 156, onSegmentClick,
      }));
      const lines = tree.filter(({ type, props }) => type === 'line' && props.stroke === '#e2e8f0');
      expect(lines.map(({ props }) => props.points)).toEqual(points);
      expect(lines.every(({ props }) => props.strokeWidth === 2.5 && props.listening === false)).toBe(true);
      expect(tree.find(({ type }) => type === 'text').props).toMatchObject({
        x, y, text: '30', width: 21.2, offsetX: 10.6, offsetY: 5.5,
        rotation: orientation === 'horizontal' ? 0 : -90,
      });
      const hits = tree.filter(({ type }) => type === 'rect');
      expect(hits).toHaveLength(2);
      expect(hits[0].props).toMatchObject(orientation === 'horizontal'
        ? { x: 0, y: y - 14, width: 120, height: 28 }
        : { x: x - 14, y: 664, width: 28, height: 120 });
      expect(hits[1].props).toMatchObject({ x, y, width: 29.2, height: 19 });
      const event = { target: { getStage: () => ({ getPointerPosition: () => ({ x, y }) }) } };
      hits[0].props.onClick(event);
      expect(event.cancelBubble).toBe(true);
      expect(onSegmentClick).toHaveBeenLastCalledWith(segment);
    }
  });

  it('keeps pop-out leaders, distances, full lines and hidden hit bands unchanged', () => {
    const tree = nodes(DimensionRow({
      segments: [0, 1, 2].map((start) => ({ start, end: start + 1, kind: 'run' })),
      orientation: 'horizontal', side: 'below', offsetPx: 20, transform,
      onSegmentClick: vi.fn(),
    }));
    const lines = tree.filter(({ type, props }) => type === 'line' && props.stroke === '#e2e8f0');
    expect(lines.filter(({ props }) => props.strokeWidth === 1.5).map(({ props }) => props.points))
      .toEqual([[0, 804, 4, 804], [4, 804, 8, 804], [8, 804, 12, 804]]);
    expect(lines.filter(({ props }) => props.strokeWidth === 0.75).map(({ props }) => props.points))
      .toEqual([[2, 804, 2, 816], [6, 804, 6, 828]]);
    expect(tree.filter(({ type }) => type === 'text').map(({ props }) => [props.x, props.y]))
      .toEqual([[2, 816], [6, 828]]);
    expect(tree.filter(({ type, props }) => type === 'rect' && props.height === 28)
      .map(({ props }) => [props.x, props.y, props.width]))
      .toEqual([[0, 790, 4], [4, 790, 4], [8, 790, 4]]);
  });
});
