import { describe, expect, it, vi } from 'vitest';
import { Circle, Group, Line, Text } from 'react-konva';
import { auto, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { wallFrame } from '../../model/geometry.js';
import { syncRoom } from '../../model/room.js';
import PlanWallShape, { PlanWallDimensions } from '../PlanWallShape.jsx';
import { PLAN_DIM_FONT_SIZE } from '../constants.js';

vi.mock('react-konva', () => ({ Circle: 'circle', Group: 'group', Line: 'line', Text: 'text' }));
vi.mock('../../canvas/cursor.js', () => ({ useCursorKeys: () => ({}) }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const text = { label: 2, dimension: 1.5 };

describe('FX6 b plan zoom', () => {
  it('scales wall numbers and all ticks, centring through text in a split line', () => {
    for (const scale of [2, 4]) {
      for (const overrides of [{}, { flipped: true }, { x2: 0, y2: 96 }, { x2: 57.6, y2: 76.8 }]) {
        const r = syncRoom(room({ walls: [wall({ x2: 96, ...overrides,
          endPanels: { start: { width: 0.75 }, end: { width: 0.75 } },
          runs: ['front', 'back'].map((side) => run({ id: side, wallSide: side,
            width: 96, anchors: { left: true, right: true }, autoCount: false, items: [auto(side)],
            ends: { left: { type: 'none' }, right: { type: 'none' } },
          })),
        })] }), settings);
        const props = { room: r, wall: r.walls[0], settings, scale, text };
        const tree = [...nodes(PlanWallDimensions(props)), ...nodes(PlanWallShape(props))];
        expect(tree.find(({ type }) => type === Circle).props.radius).toBe(18 / scale);
        const number = tree.find(({ type, props }) => type === Text && props.fill === '#f8fafc');
        expect(number.props.width).toBe(36 / scale);
        expect(number.props.fontSize).toBe(20 / scale);
        const centerTick = tree.find(({ type, props }) => type === Line && props.stroke === '#22d3ee');
        const [cx1, cy1, cx2, cy2] = centerTick.props.points;
        expect(Math.hypot(cx2 - cx1, cy2 - cy1)).toBeCloseTo(12 / scale);
        for (const tick of tree.filter(({ type, props }) => type === Line && props.stroke === '#cbd5e1')) {
          const [x1, y1, x2, y2] = tick.props.points;
          expect(Math.hypot(x2 - x1, y2 - y1) / 2).toBeCloseTo(6 / scale);
          expect(tick.props.strokeWidth).toBe(1 / scale);
        }
        const through = nodes(tree.find(({ type, key }) => type === Group && key === 'through:0'));
        const ticks = through.filter(({ type, props }) => type === Line && props.stroke === '#cbd5e1');
        const [start, end] = ticks.map(({ props: { points: [x1, y1, x2, y2] } }) => ({
          x: (x1 + x2) / 2, y: (y1 + y2) / 2,
        }));
        const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
        const label = through.find(({ type }) => type === Text).props;
        expect(label.x).toBeCloseTo(center.x);
        expect(label.y).toBeCloseTo(center.y);
        expect(label.width).toBe((label.text.length * 0.6 * PLAN_DIM_FONT_SIZE + 8) * 1.5 / scale);
        expect(label.offsetX).toBe(label.width / 2);
        expect(label.offsetY).toBe(label.fontSize / 2);
        const lines = through.filter(({ type, props }) => type === Line && props.stroke === '#94a3b8');
        expect(lines).toHaveLength(2);
        const length = Math.hypot(end.x - start.x, end.y - start.y);
        const unit = { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
        const expected = [
          [start.x, start.y, center.x - unit.x * label.width / 2, center.y - unit.y * label.width / 2],
          [center.x + unit.x * label.width / 2, center.y + unit.y * label.width / 2, end.x, end.y],
        ];
        lines.forEach(({ props }, i) => props.points.forEach((value, j) => expect(value).toBeCloseTo(expected[i][j])));
        expect(through.some(({ type, props }) => type === Line && props.stroke === '#64748b')).toBe(false);
      }
    }
  });

  it('pops short through labels away from either wall end with a scaled midpoint leader', () => {
    for (const endpoint of ['start', 'end']) {
      for (const overrides of [{}, { flipped: true }, { x2: 0, y2: 96 }, { x2: 57.6, y2: 76.8 }]) {
        const r = syncRoom(room({ walls: [wall({ x2: 96, ...overrides,
          endPanels: { [endpoint]: { width: 0.75 } },
          runs: ['front', 'back'].map((side) => run({ id: side, wallSide: side,
            width: 96, anchors: { left: true, right: true }, autoCount: false, items: [auto(side)],
          })),
        })] }), settings);
        const scale = 0.5;
        const props = { room: r, wall: r.walls[0], settings, scale, text };
        const tree = [...nodes(PlanWallDimensions(props)), ...nodes(PlanWallShape(props))];
        const through = nodes(tree.find(({ key }) => key === 'through:0'));
        const lines = through.filter(({ type, props }) => type === Line && props.stroke === '#94a3b8');
        expect(lines).toHaveLength(1);
        const [x1, y1, x2, y2] = lines[0].props.points;
        const center = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
        const label = through.find(({ type }) => type === Text).props;
        const leader = through.find(({ type, props }) => type === Line && props.stroke === '#64748b');
        expect(leader.props.points).toEqual([center.x, center.y, label.x, label.y]);
        expect(Math.hypot(label.x - center.x, label.y - center.y)).toBeCloseTo(10 * 1.5 / scale);
        const frame = wallFrame(r, r.walls[0]);
        const wallCenter = { x: 48 * frame.d.x, y: 48 * frame.d.y };
        expect((label.x - center.x) * (center.x - wallCenter.x)
          + (label.y - center.y) * (center.y - wallCenter.y)).toBeGreaterThan(0);
        expect(Math.abs(label.rotation)).toBeLessThanOrEqual(90);
      }
    }
  });
});
