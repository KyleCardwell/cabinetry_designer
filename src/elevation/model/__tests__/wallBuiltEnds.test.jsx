import { describe, expect, it, vi } from 'vitest';
import { auto, room as makeRoom, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { planClearances } from '../clearances.js';
import { elevationDimensions } from '../elevationDimensions.js';
import { planDimensions } from '../planDimensions.js';
import { syncRoom } from '../room.js';
import { wallBuiltEnds, wallEndPanelPolygon, wallEndPanels } from '../wallEndPanels.js';
import { wallOutline } from '../wallOutline.js';
import PlanWallShape, { PlanWallDimensions } from '../../plan/PlanWallShape.jsx';

vi.mock('react', async (original) => ({ ...await original(),
  useMemo: (callback) => callback(), useState: (initial) => [initial, vi.fn()],
  useRef: (current) => ({ current }), useId: () => 'built-ends', useEffect: vi.fn(),
}));
vi.mock('react-redux', () => ({
  useDispatch: () => vi.fn(),
  useSelector: (selector) => selector({ elevation: { settings: S, prefs: {}, rooms: [] } }),
}));
vi.mock('react-konva', () => ({ Group: 'group', Line: 'line', Text: 'text', Circle: 'circle' }));

const S = { ...DEFAULT_SETTINGS, runFlex: 0.25 };
const OFF = { ...S, runFlex: 0 };
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];

function island() {
  return makeRoom({
    id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: ['I'],
    walls: [wall({ id: 'I', x1: 0, y1: 0, x2: 90, y2: 0, thickness: 0, thicknessOverride: 0,
      endPanels: { start: { width: null }, end: { width: null } },
      runs: [run({
        id: 'R', cabinetTypeId: 1, x: 0, width: 90, z: 4, height: 30.5, depth: 24,
        ends: { left: { type: 'end_panel', width: null }, right: { type: 'end_panel', width: null } },
        autoCount: true, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
        anchors: { left: true, right: true },
        items: [1, 2, 3].map((n) => auto(`R${n}`)),
      })],
    })],
  });
}

function planTree(room, settings = S) {
  const props = { room, wall: room.walls[0], scale: 4, settings };
  return [...nodes(PlanWallShape(props)), ...nodes(PlanWallDimensions(props))];
}

describe('SPEC-RF3 step b built wall ends', () => {
  it('draws and dimensions the 90-inch island at 90 1/8, with panel outer faces at -1/16 and 90 1/16', () => {
    const room = syncRoom(island(), S);
    const wall = room.walls[0];
    expect(wallBuiltEnds(wall)).toEqual({ start: 0.0625, end: 0.0625 });
    expect(wallOutline(room, wall).map(({ x }) => x)).toEqual([-0.0625, 90.0625, 90.0625, -0.0625]);
    const panels = wallEndPanels(room, wall, S);
    expect(panels.map((panel) => {
      const xs = wallEndPanelPolygon(room, wall, panel).map(({ x }) => x);
      return panel.endpoint === 'start' ? Math.min(...xs) : Math.max(...xs);
    })).toEqual([-0.0625, 90.0625]);
    const dimension = planDimensions(room, S).find(({ row }) => row === 'wall');
    expect([dimension.start[0], dimension.end[0], dimension.text]).toEqual([-0.0625, 90.0625, '90 1/8']);
    const canvas = planTree(room);
    expect(canvas.filter(({ type }) => type === 'text').map(({ props }) => props.text)).toContain('90 1/8');
    expect(canvas.some(({ type, props }) => type === 'line'
      && JSON.stringify(props.points) === JSON.stringify([-0.0625, 0, 90.0625, 0]))).toBe(true);
  });

  it('dimensions 90 1/8 overall on front and back elevations, including the face without runs', () => {
    const room = syncRoom(island(), S);
    for (const side of ['front', 'back']) {
      // DM3: the overall is the wall row below on a face with runs, the upper run row on one without.
      const overall = elevationDimensions(room, room.walls[0], side, S)
        .find(({ row, kind }) => (row === 'wall' || row === 'upper.outer') && kind === 'wall');
      expect([overall.start, overall.end, overall.text]).toEqual([-0.0625, 90.0625, '90 1/8']);
      const lower = elevationDimensions(room, room.walls[0], side, S)
        .filter(({ row }) => row === 'lower.outer');
      expect([lower[0].start, lower.at(-1).end]).toEqual([-0.0625, 90.0625]);
    }
  });

  it('measures 41 15/16 from the built island end to a wall 42 inches from the drawn end', () => {
    const source = island();
    const link = (wallId, endpoint) => ({ wallId, endpoint });
    source.walls.push(
      wall({ id: 'S', x1: -42, y1: -100, x2: 132, y2: -100, thickness: 4.5, connections: { start: link('W', 'end'), end: link('E', 'start') } }),
      wall({ id: 'E', x1: 132, y1: -100, x2: 132, y2: 100, thickness: 4.5, connections: { start: link('S', 'end'), end: link('N', 'start') } }),
      wall({ id: 'N', x1: 132, y1: 100, x2: -42, y2: 100, thickness: 4.5, connections: { start: link('E', 'end'), end: link('W', 'start') } }),
      wall({ id: 'W', x1: -42, y1: 100, x2: -42, y2: -100, thickness: 4.5, connections: { start: link('N', 'end'), end: link('S', 'start') } }),
    );
    source.wallOrder = source.walls.map(({ id }) => id);
    const room = syncRoom(source, S);
    const ends = planClearances(room, S).filter(({ from, to }) => Math.abs(to.x - from.x) > 1);
    expect(ends).toHaveLength(2);
    expect(ends.map(({ length }) => length)).toEqual([41.9375, 41.9375]);
    expect(planDimensions(room, S).filter(({ row, text }) => row === 'clearance' && text === '41 15/16')).toHaveLength(2);
    const drawn = syncRoom(source, OFF);
    expect(planClearances(drawn, OFF).filter(({ from, to }) => Math.abs(to.x - from.x) > 1)
      .map(({ length }) => length)).toEqual([42, 42]);
  });

});
