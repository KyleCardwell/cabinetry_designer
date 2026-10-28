import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { connectWallStops } from './helpers/wallStops.js';
import { room as buildRoom, run as buildRun, wall as buildWall } from '../../../test/builders.js';
import { runItems } from '../grid.js';
import { Line } from 'react-konva';
import PlanRunFootprint from '../../plan/PlanRunFootprint.jsx';
import { normalizeElevationDocument } from '../../store/persistence.js';
import { CABINET_TYPE_IDS } from '../constants.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { wallFrame } from '../geometry.js';
import { planParts } from '../planParts.js';
import { planRunPieces } from '../planPieces.js';
import { resolveWall, syncRoom } from '../room.js';

vi.mock('react', async (original) => ({
  ...await original(),
  useState: (initial) => [initial, vi.fn()],
  useMemo: (callback) => callback(),
  useRef: (current) => ({ current }),
  useId: () => 'waterfall-plan',
  useEffect: vi.fn(),
}));
vi.mock('react-konva', () => ({
  Group: 'group', Label: 'label', Line: 'line', Tag: 'tag', Text: 'text',
}));

const document = normalizeElevationDocument(JSON.parse(readFileSync(
  new URL('./fixtures/golden.json', import.meta.url), 'utf8',
)));
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
const settings = { ...document.settings, sectionProfiles: [nz1] };

function setup(props = {}, wallProps = {}, wallStops = false) {
  const stored = buildRoom(structuredClone(document.rooms[0]));
  const wall = stored.walls[0];
  const base = wall.runs.find(({ cabinetTypeId }) => cabinetTypeId === CABINET_TYPE_IDS.BASE);
  stored.profile = { ...stored.profile, nosingProfileId: 'nz1' };
  stored.walls = [buildWall({ ...wall, x1: 0, y1: 0, x2: 120, y2: 0,
    flipped: false, profile: {}, connections: { start: null, end: null }, openings: [], joints: [],
    endPanels: { start: null, end: null }, ...wallProps,
    runs: [buildRun({ ...base, items: runItems(base), id: 'base', x: 30, width: 36, top: 'stone', anchors: {},
      ends: { left: { type: 'none' }, right: { type: 'none' } },
      waterfall: { left: {} }, ...props })],
  })];
  if (wallStops) connectWallStops(stored, stored.walls[0]);
  const room = syncRoom(stored, settings);
  const view = resolveWall(room, room.walls[0]);
  const run = view.runs[0];
  const layout = layoutRun(room, view, run, settings);
  const pieces = planRunPieces(room, view, run, settings, layout,
    runFaceLayouts(room, view, run, settings, layout));
  return { room, wall: view, run, pieces, settings, frame: wallFrame(room, view),
    legs: planParts(room, settings).filter(({ kind, runId }) => kind === 'countertop' && runId === run.id) };
}

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];

describe('SPEC-50.10 step 508 waterfall legs in plan', () => {
  it.each([
    ['stone (anchor 1)', 'stone', 25.625],
    ['wood nz1 (anchor 2)', 'wood', 25.375],
  ])('%s uses the core thickness and full top depth in the canvas and DXF', (_, top, front) => {
    const input = setup({ top });
    expect(input.pieces.waterfallLegs).toEqual([{
      key: 'base:waterfall:left', kind: 'countertop',
      start: 28.5, end: 30, back: 0, front, top: 36,
    }]);
    expect(input.pieces.span).toEqual({ start: 28.5, end: 66 });
    expect(input.legs).toEqual([{
      id: 'base:waterfall:left', kind: 'countertop', runId: 'base', top: 36,
      points: [[28.5, 0], [30, 0], [30, -front], [28.5, -front]],
    }]);
    const leg = nodes(PlanRunFootprint({ ...input, scale: 4, selectable: true }))
      .find(({ type, key }) => type === Line && key === 'base:waterfall:left');
    expect(leg.props).toMatchObject({
      closed: true, points: [28.5, 0, 30, 0, 30, front, 28.5, front],
    });
  });

  it('mirrors both legs and moves them with side, front and back overhangs without double shifting', () => {
    const input = setup({ top: 'wood', outset: 3,
      waterfall: { left: {}, right: { baseToLeg: true } },
      topOverhang: { left: 12, right: 6, front: 2, back: 1 },
      overrides: { countertopThickness: 0.75 },
    });
    expect(input.pieces.waterfallLegs).toEqual([
      { key: 'base:waterfall:left', kind: 'countertop', start: 17.25, end: 18,
        back: 2, front: 30.375, top: 35.25 },
      { key: 'base:waterfall:right', kind: 'countertop', start: 72, end: 72.75,
        back: 2, front: 30.375, top: 35.25 },
    ]);
    expect(input.legs.map(({ points, top }) => ({ points, top }))).toEqual([
      { points: [[17.25, -2], [18, -2], [18, -30.375], [17.25, -30.375]], top: 35.25 },
      { points: [[72, -2], [72.75, -2], [72.75, -30.375], [72, -30.375]], top: 35.25 },
    ]);
    const right = setup({ waterfall: { right: {} } }, { x1: 10, y1: 20, x2: 10, y2: 140 });
    expect(right.legs).toEqual([{
      id: 'base:waterfall:right', kind: 'countertop', runId: 'base', top: 36,
      points: [[10, -86], [10, -87.5], [-15.625, -87.5], [-15.625, -86]],
    }]);
  });

  it('keeps unpicked, blocked and non-countertop ends out of the plan and export', () => {
    for (const props of [
      { waterfall: undefined },
      { anchors: { left: true } },
      { anchors: { left: { to: 'wall', wallId: 'other' } } },
      { top: 'crown' }, { top: 'topMold' }, { top: 'none' },
    ]) {
      const input = setup(props, {}, true);
      expect(input.pieces).not.toHaveProperty('waterfallLegs');
      expect(input.legs).toEqual([]);
      expect(nodes(PlanRunFootprint({ ...input, scale: 4 }))
        .some(({ key }) => key === 'base:waterfall:left')).toBe(false);
    }
  });
});
