import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Group, Line, Rect, Shape } from 'react-konva';
import { cornerShapes } from '../../model/cornerParts.js';
import { resolveWall, syncRoom } from '../../model/room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';
import Hatch from '../Hatch.jsx';
import NeighborProfiles from '../NeighborProfiles.jsx';
import NeighborReturns from '../NeighborReturns.jsx';
import RunGroup from '../RunGroup.jsx';

// Inspect Konva nodes without a browser or canvas runtime.
vi.mock('react', async (original) => ({
  ...await original(),
  useMemo: (callback) => callback(),
  useState: (initial) => [initial, vi.fn()],
  useRef: (current) => ({ current }),
  useId: () => 'molding-canvas',
  useEffect: vi.fn(),
}));
vi.mock('react-konva', () => ({
  Group: 'group', Label: 'label', Line: 'line', Rect: 'rect', Shape: 'shape', Tag: 'tag', Text: 'text',
}));
vi.mock('../../model/cornerParts.js', async (original) => {
  const module = await original();
  return { ...module, cornerShapes: vi.fn(module.cornerShapes) };
});

const load = (name) => JSON.parse(readFileSync(new URL(`../../model/__tests__/fixtures/${name}.json`, import.meta.url), 'utf8'));
const document = normalizeElevationDocument(load('golden'));
const settings = { ...document.settings, sectionProfiles: load('sectionProfiles').profiles };
const picks = { topMoldProfileId: 'tm3', crownProfileId: 'cr45' };
const transform = { scale: 4, offsetX: 10, offsetY: 20, wallHeight: 108 };
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const trace = (callback) => {
  const path = [];
  callback({
    beginPath: () => path.push('begin'),
    moveTo: (...point) => path.push(['move', ...point]),
    lineTo: (...point) => path.push(['line', ...point]),
    arc: (...args) => path.push(['arc', ...args]),
    closePath: () => path.push('close'),
    fillStrokeShape: () => {},
  });
  return path;
};

function setup(profile = picks, cabinetTypeId = 2) {
  const stored = structuredClone(document.rooms[0]);
  stored.profile = { ...stored.profile, ...profile };
  const source = stored.walls[0].runs.find((run) => run.cabinetTypeId === cabinetTypeId);
  stored.walls = [{
    ...stored.walls[0], x1: 0, y1: 0, x2: 120, y2: 0,
    connections: { start: null, end: null }, openings: [], joints: [],
    runs: [{ ...source, x: 20, width: 60, anchors: {}, ends: {} }],
  }];
  const room = syncRoom(stored, settings);
  const wall = resolveWall(room, room.walls[0]);
  return { room, wall, run: wall.runs[0], settings, transform };
}

describe('SPEC-50.8 step 500 nosing canvas', () => {
  const nz1 = {
    id: 'nz1', name: 'Chamfer nosing', kind: 'nosing',
    geometry: {
      units: 'in', points: { a: [0, 0], b: [0.25, 0], c: [0.5, -0.25], d: [0.5, -1.5], e: [0, -1.5] },
      loops: [{ id: 'L1', closed: true, segs: ['a', 'b', 'c', 'd', 'e'].map((from, i, ids) => ({
        type: 'line', from, to: ids[(i + 1) % ids.length],
      })) }],
    },
    drawnPoints: { elevation: ['c'] },
  };
  const render = (top, nosingProfileId) => {
    const props = setup({ countertopThickness: 1.5 }, 1);
    Object.assign(props.run, {
      x: 30, width: 36, z: 4, height: 30.5, depth: 24, top,
      ends: { left: { type: 'none' }, right: { type: 'none' } },
      overrides: { nosingProfileId },
    });
    props.settings = { ...props.settings, sectionProfiles: [nz1] };
    return nodes(RunGroup.type(props));
  };

  it('draws the wood nosing outline as a closed path and its thin elevation line', () => {
    const tree = render('wood', 'nz1');
    const top = tree.find(({ type, props }) => type === Shape && props.stroke === '#64748b');
    expect(top).toBeDefined();
    expect(top.props).toMatchObject({ fill: '#c8a27a', strokeWidth: 1, opacity: 0.9, listening: false });
    expect(trace(top.props.sceneFunc)).toEqual([
      'begin', ['move', 125, 314], ['line', 279, 314], ['line', 279, 309],
      ['line', 278, 308], ['line', 126, 308], ['line', 125, 309], 'close',
    ]);
    const lines = tree.filter(({ type, props }) => type === Line && props.stroke === '#64748b');
    expect(lines).toHaveLength(1);
    expect(lines[0].props).toMatchObject({
      points: [125, 309, 279, 309], strokeWidth: 0.5, opacity: 0.9, listening: false,
    });
    expect(tree.some(({ type, props }) => type === Rect && props.stroke === '#64748b')).toBe(false);
  });

  it.each([['wood', null, '#c8a27a'], ['stone', 'nz1', '#cbd5e1']])(
    'keeps %s without an applicable nosing rectangular', (kind, pick, fill) => {
      const tree = render(kind, pick);
      const top = tree.find(({ type, props }) => type === Rect && props.stroke === '#64748b');
      expect(top.props).toMatchObject({ x: 127, y: 308, width: 150, height: 6, fill });
      expect(tree.some(({ type, props }) => type === Shape && props.stroke === '#64748b')).toBe(false);
      expect(tree.some(({ type, props }) => type === Line && props.stroke === '#64748b')).toBe(false);
    },
  );
});

describe('Step 490 furniture base canvas', () => {
  it('renders a profiled furniture base outline and its thin contour line without a toe kick rect', () => {
    const tree = nodes(RunGroup.type(setup({
      baseKind: 'furniture_base', furnitureBaseProfileId: 'fb4',
    }, 1)));
    const base = tree.find(({ type, props }) => type === Shape && props.stroke === '#cbd5e1');
    expect(base).toBeDefined();
    expect(trace(base.props.sceneFunc).at(-1)).toBe('close');
    expect(base.props).toMatchObject({
      fill: '#94a3b8', opacity: 0.9, strokeWidth: 1, listening: false,
    });
    const lines = tree.filter(({ type, props }) => type === Line && props.stroke === '#cbd5e1');
    expect(lines).toHaveLength(1);
    expect(lines[0].props).toMatchObject({
      points: [86.75, 437.25, 333.25, 437.25],
      strokeWidth: 0.5, opacity: 0.9, listening: false,
    });
    expect(tree.some(({ type, props }) => type === Rect && props.stroke === '#334155')).toBe(false);
  });

  it('renders a plain furniture base as a molding rectangle without profile lines or a toe kick', () => {
    const tree = nodes(RunGroup.type(setup({ baseKind: 'furniture_base' }, 1)));
    const base = tree.find(({ type, props }) => type === Rect && props.stroke === '#cbd5e1');
    expect(base.props).toMatchObject({
      x: 86.75, y: 436, width: 246.5, height: 16,
      fill: '#94a3b8', opacity: 0.9, strokeWidth: 1, listening: false,
    });
    expect(tree.some(({ type, props }) => type === Line && props.stroke === '#cbd5e1')).toBe(false);
    expect(tree.some(({ type, props }) => type === Rect && props.stroke === '#334155')).toBe(false);
  });
});

describe('Step 472 molding canvas', () => {
  it('renders the crown picks as thin lines stopped on the returned front contours', () => {
    const render = (profile) => nodes(RunGroup.type(setup(profile)));
    const picked = render(picks);
    const crown = picked.find(({ type, props }) => type === Shape && props.stroke === '#f8fafc');
    const lines = picked.filter(({ type, props }) => type === Line && props.stroke === crown.props.stroke);
    expect(lines).toHaveLength(2);
    expect(lines.map(({ props }) => props.points)).toEqual([
      [77, 72, 343, 72], [87, 84, 333, 84],
    ]);
    for (const { props } of lines) {
      expect(props.strokeWidth).toBeLessThan(crown.props.strokeWidth);
      expect(props).toMatchObject({ opacity: crown.props.opacity, listening: false });
    }
    expect(picked.filter(({ type, props }) => type === Line && props.stroke === '#cbd5e1')
      .map(({ props }) => props.points)).toEqual([[89, 89, 331, 89]]);
    expect(render({}).filter(({ type, props }) => type === Line
      && ['#f8fafc', '#cbd5e1'].includes(props.stroke))).toHaveLength(0);
  });

  it.each([
    ['return', NeighborReturns, 'crown'], ['profile', NeighborProfiles, 'crown'],
    ['furniture base return', NeighborReturns, 'furniture_base'],
  ])('renders a %s part outline as a closed path and keeps plain parts rectangular', (label, Component, partKind) => {
    const kind = Component === NeighborReturns ? 'return' : 'profile';
    const part = {
      id: partKind, kind: partKind, x: 13.125, z: 91.5, width: 3, height: 4.5,
      outline: [[13.125, 96], [16.125, 96], [16.125, 95], [13.625, 92], [13.625, 91.5], [13.125, 91.5]],
    };
    const { room, wall } = setup();
    const render = (piece) => {
      cornerShapes.mockReturnValueOnce([{ key: 'corner', kind, wallId: wall.id, parts: [piece] }]);
      return nodes(Component({ room, wall, settings, transform }));
    };
    const polygon = render(part).find(({ type }) => type === Shape);
    expect(polygon.props).toMatchObject({
      strokeWidth: 1, listening: false,
    });
    if (kind === 'return') {
      expect(polygon.props).toMatchObject({ fill: undefined, stroke: '#94a3b8', opacity: 1 });
    }
    expect(trace(polygon.props.sceneFunc)).toEqual([
      'begin', ['move', 62.5, 68], ['line', 74.5, 68], ['line', 74.5, 72],
      ['line', 64.5, 84], ['line', 64.5, 86], ['line', 62.5, 86], 'close',
    ]);
    const curved = render({ ...part, outline: part.outline.map((point, index) => (
      [...point, index === 2 ? 0.414214 : 0]
    )) }).find(({ type }) => type === Shape);
    expect(trace(curved.props.sceneFunc).filter((command) => command[0] === 'arc')).toHaveLength(1);
    const rect = render({ ...part, outline: undefined }).find(({ type }) => type === Rect);
    expect(rect.props).toMatchObject({ x: 62.5, y: 68, width: 12, height: 18 });
  });

  it('clips section hatching to its polygon while retaining rectangle clipping', () => {
    const { room, wall } = setup();
    const part = {
      id: 'section', kind: 'section', x: 0, z: 0, width: 2, height: 3,
      outline: [[0, 0], [2, 0], [1, 3]],
    };
    cornerShapes.mockReturnValueOnce([{ key: 'return', kind: 'return', wallId: wall.id, parts: [part] }]);
    const tree = nodes(NeighborReturns({ room, wall, settings, transform }));
    const clip = tree.find(({ type, props }) => type === Group && props.clipFunc);
    const path = [];
    clip.props.clipFunc({
      beginPath: () => path.push('begin'),
      moveTo: (...point) => path.push(['move', ...point]),
      lineTo: (...point) => path.push(['line', ...point]),
      closePath: () => path.push('close'),
    });
    expect(path).toEqual(['begin', ['move', 10, 452], ['line', 18, 452], ['line', 14, 440], 'close']);
    const hatch = nodes(clip).find(({ type }) => type === Hatch);
    const strokes = Hatch(hatch.props);
    expect(strokes.props).toMatchObject({ clipX: 10, clipY: 440, clipWidth: 8, clipHeight: 12 });
    expect(nodes(strokes).filter(({ type }) => type === Line).length).toBeGreaterThan(0);
  });

  it('renders picked band outlines as paths and unprofiled bands as rectangles', () => {
    const picked = nodes(RunGroup.type(setup()));
    const plain = nodes(RunGroup.type(setup({})));
    for (const stroke of ['#cbd5e1', '#f8fafc']) {
      const band = picked.find(({ type, props }) => type === Shape && props.stroke === stroke);
      expect(trace(band.props.sceneFunc).at(-1)).toBe('close');
      expect(picked.some(({ type, props }) => type === Rect && props.stroke === stroke)).toBe(false);
      expect(plain.some(({ type, props }) => type === Rect && props.stroke === stroke)).toBe(true);
    }
  });

  it('uses the same true arc path for a section and its hatch clip', () => {
    const { room, wall } = setup();
    const part = {
      id: 'section', kind: 'section', x: 0, z: 0, width: 4, height: 4,
      outline: [[0, 0, 0], [4, 0, 0.414214], [0, 4, 0]],
    };
    cornerShapes.mockReturnValueOnce([{ key: 'return', kind: 'return', wallId: wall.id, parts: [part] }]);
    const tree = nodes(NeighborReturns({ room, wall, settings, transform }));
    const clip = tree.find(({ type, props }) => type === Group && props.clipFunc);
    const shape = tree.find(({ type }) => type === Shape);
    const path = trace(shape.props.sceneFunc);
    expect(trace(clip.props.clipFunc)).toEqual(path);
    const arcs = path.filter((command) => command[0] === 'arc');
    expect(arcs).toHaveLength(1);
    expect(arcs[0][3]).toBeCloseTo(16, 4);
  });
});
