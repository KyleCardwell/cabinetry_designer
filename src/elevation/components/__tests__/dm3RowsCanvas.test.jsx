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

    // The inner row's dimension lines (the segment lines on the row) group into 0–84 and 120–156.
    const inner = nodes(DimensionRow({ ...drawnBelow[0].props, transform }));
    const rowY = (96 - 0) * 4 + 400 + below.pieces;
    const spans = inner
      .filter(({ type, props }) => type === 'line' && props.points[1] === rowY && props.points[3] === rowY)
      .map(({ props }) => [props.points[0] / 4, props.points[2] / 4])
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
