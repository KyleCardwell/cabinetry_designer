import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Group, Line, Rect } from 'react-konva';
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
  Group: 'group', Label: 'label', Line: 'line', Rect: 'rect', Tag: 'tag', Text: 'text',
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

function setup(profile = picks) {
  const stored = structuredClone(document.rooms[0]);
  stored.profile = { ...stored.profile, ...profile };
  const upper = stored.walls[0].runs.find(({ id }) => id.startsWith('434f1164'));
  stored.walls = [{
    ...stored.walls[0], x1: 0, y1: 0, x2: 120, y2: 0,
    connections: { start: null, end: null }, openings: [], joints: [],
    runs: [{ ...upper, x: 20, width: 60, anchors: {}, ends: {} }],
  }];
  const room = syncRoom(stored, settings);
  const wall = resolveWall(room, room.walls[0]);
  return { room, wall, run: wall.runs[0], settings, transform };
}

describe('Step 472 molding canvas', () => {
  it('renders the case-2 crown picks as two extra thin lines across the band', () => {
    const render = (profile) => nodes(RunGroup.type(setup(profile)));
    const picked = render(picks);
    const crown = picked.find(({ type, props }) => type === Rect && props.stroke === '#f8fafc');
    const lines = picked.filter(({ type, props }) => type === Line && props.stroke === crown.props.stroke);
    expect(lines).toHaveLength(2);
    expect(lines.map(({ props }) => props.points)).toEqual([
      [77, 72, 343, 72], [77, 84, 343, 84],
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
    ['return', NeighborReturns], ['profile', NeighborProfiles],
  ])('renders a %s part outline as a closed polygon and keeps plain parts rectangular', (kind, Component) => {
    const part = {
      id: 'crown', kind: 'crown', x: 13.125, z: 91.5, width: 3, height: 4.5,
      outline: [[13.125, 96], [16.125, 96], [16.125, 95], [13.625, 92], [13.625, 91.5], [13.125, 91.5]],
    };
    const { room, wall } = setup();
    const render = (piece) => {
      cornerShapes.mockReturnValueOnce([{ key: 'corner', kind, wallId: wall.id, parts: [piece] }]);
      return nodes(Component({ room, wall, settings, transform }));
    };
    const polygon = render(part).find(({ type }) => type === Line);
    expect(polygon.props).toMatchObject({
      points: [62.5, 68, 74.5, 68, 74.5, 72, 64.5, 84, 64.5, 86, 62.5, 86],
      closed: true, strokeWidth: 1, listening: false,
    });
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
});
