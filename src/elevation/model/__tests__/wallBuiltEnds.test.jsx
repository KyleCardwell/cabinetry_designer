import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { planClearances } from '../clearances.js';
import { elevationDimensions } from '../elevationDimensions.js';
import { wallFrame, wallLength } from '../geometry.js';
import { gridFromItems } from '../grid.js';
import { wallBadgeGroups } from '../partNumbers.js';
import { roomParts } from '../parts.js';
import { pickStack } from '../pick.js';
import { planDimensions } from '../planDimensions.js';
import { planParts } from '../planParts.js';
import { resolveWall, syncRoom } from '../room.js';
import { wallBuiltEnds, wallEndPanelPolygon, wallEndPanels } from '../wallEndPanels.js';
import { wallOutline } from '../wallOutline.js';
import { wallParts } from '../wallParts.js';
import { shippingList } from '../../../reports/shippingList.js';
import WallHeightProperties from '../../components/properties/WallHeightProperties.jsx';
import PlanWallShape from '../../plan/PlanWallShape.jsx';

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
const panelParts = (parts) => parts.filter(({ kind }) => kind === 'wall_end_panel');
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];

function wall(id, x1, y1, x2, y2, extra = {}) {
  return {
    id, name: '', numberOverride: null, x1, y1, x2, y2, height: 96, thickness: 0,
    flipped: false, connections: { start: null, end: null }, profile: {}, openings: [],
    joints: [], runs: [], endPanels: { start: null, end: null }, ...extra,
  };
}

function island() {
  return {
    id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: ['I'],
    walls: [wall('I', 0, 0, 90, 0, {
      endPanels: { start: { width: null }, end: { width: null } },
      runs: [{
        id: 'R', cabinetTypeId: 1, x: 0, width: 90, z: 4, height: 30.5, depth: 24,
        ends: { left: { type: 'end_panel', width: null }, right: { type: 'end_panel', width: null } },
        autoCount: true, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
        anchors: { left: true, right: true },
        grid: gridFromItems('R', [1, 2, 3].map((n) => ({ id: `R${n}`, kind: 'cabinet', width: null }))),
      }],
    })],
  };
}

function planTree(room, settings = S) {
  return nodes(PlanWallShape({ room, wall: room.walls[0], scale: 4, settings }));
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
      wall('S', -42, -100, 132, -100, { thickness: 4.5, connections: { start: link('W', 'end'), end: link('E', 'start') } }),
      wall('E', 132, -100, 132, 100, { thickness: 4.5, connections: { start: link('S', 'end'), end: link('N', 'start') } }),
      wall('N', 132, 100, -42, 100, { thickness: 4.5, connections: { start: link('E', 'end'), end: link('W', 'start') } }),
      wall('W', -42, 100, -42, -100, { thickness: 4.5, connections: { start: link('N', 'end'), end: link('S', 'start') } }),
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

  it('moves panel plan pieces, wall parts, badges and picking while keeping parts and shipping sizes', () => {
    const source = island();
    const drawn = syncRoom(source, OFF);
    const room = syncRoom(source, S);
    const parts = panelParts(roomParts(room, S));
    const before = panelParts(roomParts(drawn, OFF));
    expect(parts.map(({ x }) => x)).toEqual([-0.0625, 89.25]);
    expect(parts.map(({ width, height }) => [width, height])).toEqual(before.map(({ width, height }) => [width, height]));
    expect(panelParts(shippingList(room, S).rows).map(({ size }) => size))
      .toEqual(panelParts(shippingList(drawn, OFF).rows).map(({ size }) => size));
    expect(panelParts(planParts(room, S)).map(({ points }) => points[0][0])).toEqual([-0.0625, 89.25]);
    for (const side of ['front', 'back']) {
      const view = resolveWall(room, room.walls[0], side);
      const panels = panelParts(wallParts(room, room.walls[0], side, S));
      expect(panels.map(({ x }) => x).sort((a, b) => a - b)).toEqual([-0.0625, 89.25]);
      const badges = wallBadgeGroups(room, view, S).filter(({ key }) => key.startsWith('panel:'));
      expect(badges.map(({ pieces }) => pieces[0].x).sort((a, b) => a - b)).toEqual([-0.0625, 89.25]);
      expect(pickStack(room, view, S, { x: -0.03125, z: 1 }).some(({ kind }) => kind === 'end_panel')).toBe(true);
    }
  });

  it('keeps the length field at 90 drawn and restores all end geometry and dimensions when flex is zero', () => {
    const source = island();
    const room = syncRoom(source, S);
    const view = resolveWall(room, room.walls[0], 'front');
    const field = nodes(WallHeightProperties({ room, wall: view, plan: true }))
      .find(({ props }) => props?.ariaLabel === 'Wall length');
    expect(field.props.value).toBe(90);
    expect(wallLength(room.walls[0])).toBe(90);
    expect([view.x1, view.y1, view.x2, view.y2]).toEqual([0, 0, 90, 0]);
    const off = syncRoom(room, OFF);
    const drawn = syncRoom(source, OFF);
    expect(wallBuiltEnds(off.walls[0])).toEqual({ start: 0, end: 0 });
    expect(wallOutline(off, off.walls[0])).toEqual([{ x: 0, y: 0 }, { x: 90, y: 0 }, { x: 90, y: 0 }, { x: 0, y: 0 }]);
    expect(planTree(off, OFF).filter(({ type }) => type === 'text').map(({ props }) => props.text)).toContain('90');
    expect(planParts(off, OFF)).toEqual(planParts(drawn, OFF));
    expect(planDimensions(off, OFF)).toEqual(planDimensions(drawn, OFF));
    expect(planClearances(off, OFF)).toEqual(planClearances(drawn, OFF));
    expect(roomParts(off, OFF)).toEqual(roomParts(drawn, OFF));
    expect(shippingList(off, OFF)).toEqual(shippingList(drawn, OFF));
    for (const side of ['front', 'back']) {
      expect(elevationDimensions(off, off.walls[0], side, OFF)).toEqual(elevationDimensions(drawn, drawn.walls[0], side, OFF));
      expect(wallParts(off, off.walls[0], side, OFF)).toEqual(wallParts(drawn, drawn.walls[0], side, OFF));
    }
  });

  it('maps a single built endpoint through flipped and angled views and preserves a connected corner', () => {
    for (const flipped of [false, true]) {
      const room = island();
      const wall = room.walls[0];
      Object.assign(wall, { x2: 54, y2: 72, thickness: 4.5, flipped, _endFlex: { end: 0.125 } });
      expect(wallOutline(room, wall).slice(0, 2)).toEqual([{ x: 0, y: 0 }, { x: 54.075, y: 72.1 }]);
      for (const side of ['front', 'back']) {
        const view = resolveWall(room, wall, side);
        expect(wallBuiltEnds(view)).toEqual({ start: 0, end: 0.125 });
        const frame = wallFrame(room, view);
        const overall = elevationDimensions(room, wall, side, S)
          .find(({ row, kind }) => (row === 'wall' || row === 'upper.outer') && kind === 'wall');
        expect([overall.start, overall.end, overall.text]).toEqual(frame.leftEndpoint === 'end'
          ? [-0.125, 90, '90 1/8'] : [0, 90.125, '90 1/8']);
      }
    }
    const room = island();
    const wallI = room.walls[0];
    Object.assign(wallI, { thickness: 4.5, _endFlex: { start: 0.0625 }, connections: { end: { wallId: 'B', endpoint: 'start' } } });
    room.walls.push(wall('B', 90, 0, 90, 96, { thickness: 4.5, connections: { start: { wallId: 'I', endpoint: 'end' } } }));
    room.wallOrder.push('B');
    expect(wallOutline(room, wallI)).toEqual([
      { x: -0.0625, y: 0 }, { x: 90, y: 0 }, { x: 94.5, y: -4.5 }, { x: -0.0625, y: -4.5 },
    ]);
    expect(planParts(room, S).find(({ kind }) => kind === 'wall').points.map(([x]) => x)).toEqual([-0.0625, 90, 94.5, -0.0625]);
  });
});
