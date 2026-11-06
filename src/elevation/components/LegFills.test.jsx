import { describe, expect, it, vi } from 'vitest';
import { Rect, Shape } from 'react-konva';
import { auto, room, run, wall } from '../../test/builders.js';
import { DEFAULT_SETTINGS, ELEVATION_BG, ELEVATION_LINE } from '../model/constants.js';
import { legPreset } from '../model/legs.js';
import { legShape } from '../model/__tests__/fixtures/legs.js';
import { elevationToPlan } from '../model/geometry.js';
import { wallSideFrame } from '../model/wallSides.js';
import LegShapes from './LegShapes.jsx';
import PieceRect from './PieceRect.jsx';
import RunGroup from './RunGroup.jsx';
import PlanLegs from '../plan/PlanLegs.jsx';

vi.mock('react', async (original) => ({
  ...await original(), useMemo: (callback) => callback(), useState: (value) => [value, vi.fn()],
  useId: () => 'leg-fills', useRef: (current) => ({ current }), useEffect: vi.fn(),
}));
vi.mock('react-konva', () => ({
  Group: 'group', Label: 'label', Line: 'line', Rect: 'rect', Shape: 'shape', Tag: 'tag', Text: 'text',
}));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const settings = { ...DEFAULT_SETTINGS, shapes: [legShape()] };
let nextId = 0;
const four = legPreset('four', { shapeId: 'leg', proud: 0.5 }, () => ['LF', 'LB', 'RF', 'RB'][nextId++]);
const transform = { scale: 4, offsetX: 20, offsetY: 30, wallHeight: 96 };

describe('SH7.2 step c canvas leg fills', () => {
  it('draws fills after the rear legs and before faces/front legs, selecting their leg and respecting preview', () => {
    for (const type of ['panel', 'filler']) {
      for (const doorsOff of [false, true]) {
        const r = run({ x: 10, width: 36, autoCount: false, items: [auto('cabinet')],
          legs: four.map((leg, i) => i === 0 ? { ...leg, fill: { type } } : leg) });
        const w = wall({ runs: [r] });
        const input = { room: room({ walls: [w] }), wall: w, run: r, settings, transform, doorsOff };
        const onSelectRun = vi.fn();
        const tree = nodes(RunGroup.type({ ...input, onSelectRun }));
        const fill = tree.find(({ key }) => key === 'LF:fill');
        expect(fill.type).toBe(Rect);
        expect(fill.props).toMatchObject({ ...(type === 'panel'
          ? { x: 61, y: 276, width: 3.25, height: 138 } : { x: 60, y: 276, width: 14, height: 122 }),
          stroke: ELEVATION_LINE, strokeWidth: 1, fill: ELEVATION_BG, listening: true });
        expect(tree.some(({ key }) => key === 'LF:fill:return')).toBe(false);
        const rear = tree.findIndex(({ type }) => type === LegShapes);
        expect(tree.indexOf(fill)).toBe(rear + 1);
        expect(tree.indexOf(fill)).toBeLessThan(tree.findIndex(({ type }) => type === PieceRect));
        expect(tree.indexOf(fill)).toBeLessThan(tree.findLastIndex(({ type }) => type === LegShapes));
        const event = {};
        fill.props.onClick(event);
        expect(onSelectRun).toHaveBeenCalledWith(r.id, { legId: 'LF' });
        expect(event.cancelBubble).toBe(true);
        expect(nodes(RunGroup.type({ ...input, preview: true })).find(({ key }) => key === 'LF:fill')
          .props.listening).toBe(false);
      }
    }
  });

  it('maps panel and filler plan rectangles on rotated and back faces, using the leg selection handler', () => {
    for (const fill of [{ type: 'panel' }, { type: 'filler' }, { type: 'panel', returns: 'both' }]) {
      const { type } = fill;
      for (const wallSide of ['front', 'back']) {
        for (const rotated of [false, true]) {
          const r = run({ x: 10, width: 36, wallSide,
            legs: four.map((leg, i) => i === 0 ? { ...leg, fill } : leg) });
          const w = wall({ x1: 7, y1: 11, x2: rotated ? 7 : 151, y2: rotated ? 155 : 11, runs: [r] });
          const input = room({ walls: [w] });
          const frame = wallSideFrame(input, w, wallSide);
          const onSelect = vi.fn();
          const shapes = PlanLegs({ room: input, wall: w, run: r, settings, frame, scale: 4,
            stroke: '#abc', onSelect });
          const expectedFills = type === 'panel'
            ? [['LF:fill', [[10.25, 3.5], [11.0625, 3.5], [11.0625, 21.875], [10.25, 21.875]]]]
            : [['LF:fill', [[10, 21.0625], [13.5, 21.0625], [13.5, 21.875], [10, 21.875]]],
              ['LF:fill:return', [[12.75, 18.6875], [13.5, 18.6875], [13.5, 21.1875], [12.75, 21.1875]]]];
          if (fill.returns) expectedFills.push(
            ['LF:fill:return-front', [[11.0625, 21.0625], [14.75, 21.0625], [14.75, 21.875], [11.0625, 21.875]]],
            ['LF:fill:return-back', [[11.0625, 3.5], [14.75, 3.5], [14.75, 4.3125], [11.0625, 4.3125]]],
          );
          expect(shapes.filter(({ key }) => key.startsWith('LF:fill'))).toHaveLength(expectedFills.length);
          for (const [id, points] of expectedFills) {
            const fill = shapes.find(({ key }) => key === id);
            expect(fill.type).toBe(Shape);
            expect(fill.props).toMatchObject({ stroke: '#abc', strokeWidth: 0.25, fillEnabled: false });
            const ctx = Object.fromEntries(['beginPath', 'moveTo', 'lineTo', 'closePath', 'fillStrokeShape']
              .map((name) => [name, vi.fn()]));
            fill.props.sceneFunc(ctx, {});
            const expected = points.map(([u, v]) => elevationToPlan(frame, u, v));
            const drawn = [...ctx.moveTo.mock.calls, ...ctx.lineTo.mock.calls];
            expect(drawn).toHaveLength(4);
            expected.forEach((point, i) => {
              expect(drawn[i][0]).toBeCloseTo(point.x);
              expect(drawn[i][1]).toBeCloseTo(point.y);
            });
            expect(ctx.closePath).toHaveBeenCalledOnce();
            const event = {};
            fill.props.onClick(event);
            expect(onSelect).toHaveBeenCalledWith(event);
          }
        }
      }
    }
  });

  it('draws returns immediately before their panel with its style, height, selection and preview behavior', () => {
    for (const [index, x] of [[0, 64.25], [2, 185]]) {
      for (const preview of [false, true]) {
        const r = run({ x: 10, width: 36,
          legs: four.map((leg, i) => i === index
            ? { ...leg, fill: { type: 'panel', returns: 'both', bottom: 1, top: 2 } } : leg) });
        const w = wall({ runs: [r] });
        const onSelectRun = vi.fn();
        const tree = nodes(RunGroup.type({ room: room({ walls: [w] }), wall: w, run: r,
          settings, transform, preview, onSelectRun }));
        const id = `${four[index].id}:fill`;
        const panelIndex = tree.findIndex(({ key }) => key === id);
        expect(tree.slice(panelIndex - 2, panelIndex).map(({ key }) => key))
          .toEqual([`${id}:return-front`, `${id}:return-back`]);
        for (const node of tree.slice(panelIndex - 2, panelIndex)) {
          expect(node.type).toBe(Rect);
          expect(node.props).toMatchObject({ x, y: 284, width: 14.75, height: 126,
            fill: ELEVATION_BG, stroke: ELEVATION_LINE, strokeWidth: 1, listening: !preview });
          const event = {};
          node.props.onClick(event);
          expect(event.cancelBubble).toBe(true);
          expect(onSelectRun).toHaveBeenLastCalledWith(r.id, { legId: four[index].id });
          expect(node.props.onMouseEnter).toBe(tree[panelIndex].props.onMouseEnter);
          expect(node.props.onMouseLeave).toBe(tree[panelIndex].props.onMouseLeave);
        }
      }
    }
  });
});
