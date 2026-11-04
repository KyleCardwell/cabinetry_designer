import { describe, expect, it, vi } from 'vitest';
import { Group, Shape } from 'react-konva';
import { auto, room, run, wall } from '../../test/builders.js';
import { DEFAULT_SETTINGS } from '../model/constants.js';
import { legShape } from '../model/__tests__/fixtures/legs.js';
import { elevationToPlan } from '../model/geometry.js';
import { frontDepth } from '../model/corners.js';
import { runLegs } from '../model/legs.js';
import { wallSideFrame } from '../model/wallSides.js';
import InteriorShapes from './InteriorShapes.jsx';
import LegShapes from './LegShapes.jsx';
import PieceRect from './PieceRect.jsx';
import RunGroup from './RunGroup.jsx';
import PlanLegs from '../plan/PlanLegs.jsx';
import PlanRunFootprint from '../plan/PlanRunFootprint.jsx';
import usePicker from './canvas/usePicker.js';
import usePlanSelectHandlers from '../plan/usePlanSelectHandlers.js';
import { setActiveWall, setSelection } from '../store/elevationSlice.js';

vi.mock('react', async (original) => ({
  ...await original(), useMemo: (callback) => callback(), useState: (value) => [value, vi.fn()],
  useCallback: (callback) => callback,
  useRef: (current) => ({ current }), useId: () => 'legs', useEffect: vi.fn(),
}));
vi.mock('react-konva', () => ({
  Group: 'group', Label: 'label', Line: 'line', Rect: 'rect', Shape: 'shape', Tag: 'tag', Text: 'text',
}));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const settings = { ...DEFAULT_SETTINGS, shapes: [legShape()] };
const leg = { id: 'lg-1', shapeId: 'leg', from: 'left', x: 0, yFrom: 'front', y: 0, height: 'full' };
const transform = { scale: 4, offsetX: 20, offsetY: 30, wallHeight: 96 };
const context = () => Object.fromEntries(
  ['beginPath', 'moveTo', 'lineTo', 'arc', 'closePath', 'fillStrokeShape'].map((name) => [name, vi.fn()]),
);

function fixture(legs = [leg], wallOverrides = {}, runOverrides = {}) {
  const r = run({ x: 10, width: 36, autoCount: false, items: [auto('cabinet')], legs, ...runOverrides });
  const w = wall({ runs: [r], ...wallOverrides });
  const input = room({ walls: [w] });
  return { room: input, wall: w, run: r, settings, transform,
    frame: wallSideFrame(input, w, r.wallSide), scale: 4, selectable: true };
}

describe('SH7 step c canvas legs', () => {
  it('anchor 1: draws the left front leg proud by 1/2 inch over the pieces, including doors-off', () => {
    for (const y of [-0.5, 0, 0.5e-6]) {
      for (const doorsOff of [false, true]) {
        const input = fixture([{ ...leg, y }]);
        const tree = nodes(RunGroup.type({ ...input, doorsOff }));
        const layer = tree.find(({ type, props }) => type === LegShapes && props.legs.length);
        expect(layer.props.legs[0].front).toBeCloseTo(frontDepth(input.run, settings) - y);
        expect(tree.indexOf(layer)).toBeGreaterThan(tree.findIndex(({ type }) => type === PieceRect));
        if (doorsOff) expect(tree.indexOf(layer)).toBeGreaterThan(tree.findIndex(({ type }) => type === InteriorShapes));
        const shapes = nodes(LegShapes(layer.props)).filter(({ type }) => type === Shape);
        expect(shapes.length).toBeGreaterThan(0);
        expect(shapes.some(({ props }) => props.fillEnabled && props.fill)).toBe(true);
      }
    }
  });

  it('anchor 2: draws the left back leg behind the pieces, including doors-off', () => {
    for (const doorsOff of [false, true]) {
      const tree = nodes(RunGroup.type({ ...fixture([{ ...leg, yFrom: 'back' }]), doorsOff }));
      const layer = tree.find(({ type, props }) => type === LegShapes && props.legs.length);
      expect(layer.props.legs[0]).toMatchObject({ front: 3.5, back: 0 });
      expect(tree.indexOf(layer)).toBeLessThan(tree.findIndex(({ type }) => type === PieceRect));
      if (doorsOff) expect(tree.indexOf(layer)).toBeLessThan(tree.findIndex(({ type }) => type === InteriorShapes));
    }
  });

  it('anchor 3: draws a 3 1/2 square and true 3-inch circle over the left front plan footprint', () => {
    for (const wallSide of ['front', 'back']) {
      for (const mirror of [undefined, true]) {
        for (const wallOverrides of [{}, { x1: 7, y1: 11, x2: 107, y2: 111 }]) {
          const input = fixture([{ ...leg, ...(mirror ? { mirror } : {}) }], wallOverrides, { wallSide });
          const tree = nodes(PlanRunFootprint(input));
          const layer = tree.find(({ type }) => type === PlanLegs);
          const lastFootprint = tree.findLastIndex(({ props }) => props.closed && props.fill);
          expect(tree.indexOf(layer)).toBeGreaterThan(lastFootprint);
          const shapes = PlanLegs(layer.props);
          expect(shapes).toHaveLength(2);
          expect(shapes.every(({ type, props }) => type === Shape && !props.fillEnabled)).toBe(true);
          const square = context();
          shapes[0].props.sceneFunc(square, {});
          const F = frontDepth(input.run, settings);
          const left = input.run.x;
          const expected = [[left, F], [left + 3.5, F], [left + 3.5, F - 3.5], [left, F - 3.5]]
            .map(([u, v]) => elevationToPlan(input.frame, u, v));
          const drawn = [...square.moveTo.mock.calls, ...square.lineTo.mock.calls];
          expect(drawn).toHaveLength(4);
          for (const point of expected) expect(drawn.some(([x, y]) => Math.hypot(x - point.x, y - point.y) < 1e-6)).toBe(true);
          expect(square.arc).not.toHaveBeenCalled();
          expect(square.closePath).toHaveBeenCalledOnce();
          const circle = context();
          shapes[1].props.sceneFunc(circle, {});
          const center = elevationToPlan(input.frame, left + 1.75, F - 1.75);
          expect(circle.arc).toHaveBeenCalledTimes(2);
          for (const [cx, cy, radius, start, end, ccw] of circle.arc.mock.calls) {
            expect(cx).toBeCloseTo(center.x);
            expect(cy).toBeCloseTo(center.y);
            expect(radius).toBeCloseTo(1.5);
            expect(Math.abs(end - start)).toBeCloseTo(Math.PI);
            expect(ccw).toBe(!mirror);
          }
        }
      }
    }
  });

  it('anchor 4: clicking a leg selects its run and stops the canvas click; previews do not listen', () => {
    const dispatch = vi.fn();
    for (const yFrom of ['front', 'back']) {
      for (const doorsOff of [false, true]) {
        const input = fixture([{ ...leg, yFrom }]);
        const { pick: onSelectRun } = usePicker({ ...input, tool: 'select', dispatch,
          suppressClickRef: { current: false }, stageRef: { current: null } });
        const tree = nodes(RunGroup.type({ ...input, doorsOff, onSelectRun }));
        const layer = tree.find(({ type, props }) => type === LegShapes && props.legs.length);
        const group = nodes(LegShapes(layer.props)).find(({ type }) => type === Group);
        const event = {};
        expect(group.props.listening).toBe(true);
        group.props.onClick(event);
        expect(dispatch).toHaveBeenLastCalledWith(setSelection({ runId: input.run.id }));
        expect(event.cancelBubble).toBe(true);
        const preview = nodes(RunGroup.type({ ...input, preview: true }));
        expect(preview.filter(({ type }) => type === LegShapes).every(({ props }) => props.listening === false)).toBe(true);
      }
    }
    const input = fixture([{ ...leg, x: -4 }]);
    const pickAt = vi.fn();
    const { handleRunSelect: onSelect } = usePlanSelectHandlers({ ...input, walls: [input.wall],
      tool: 'select', dispatch, pickAt, closePicker: vi.fn() });
    const footprint = PlanRunFootprint({ ...input, onSelect });
    const layer = nodes(footprint).find(({ type }) => type === PlanLegs);
    const event = {};
    PlanLegs(layer.props)[0].props.onClick(event);
    expect(dispatch.mock.calls.slice(-2).map(([action]) => action)).toEqual([
      setActiveWall(input.wall.id), setSelection({ runId: input.run.id, pieceId: null }),
    ]);
    expect(pickAt).not.toHaveBeenCalled();
    expect(event.cancelBubble).toBe(true);
  });

  it('fills only outer closed elevation loops, preserves open arcs, and keeps inner details above fills', () => {
    const input = fixture();
    const [placed] = runLegs(input.room, input.wall, input.run, settings);
    const inner = { closed: true, outline: [[11, 28], [12, 28], [12, 29], [11, 29]] };
    const shapes = nodes(LegShapes({ legs: [{ ...placed, outlines: [inner, ...placed.outlines] }], transform }))
      .filter(({ type }) => type === Shape);
    const detail = shapes.find(({ key }) => key === '0');
    expect(detail.props.fillEnabled).toBe(false);
    expect(shapes.indexOf(detail)).toBeGreaterThan(shapes.findLastIndex(({ props }) => props.fillEnabled));
    const traces = shapes.map(({ props }) => {
      const ctx = context();
      props.sceneFunc(ctx, {});
      return ctx;
    });
    expect(traces.some((ctx) => ctx.arc.mock.calls.length > 0)).toBe(true);
    shapes.forEach(({ props }, index) => {
      if (!traces[index].closePath.mock.calls.length) expect(props.fillEnabled).toBe(false);
    });
  });

  it('omits missing/no-height legs and draws the fallback plan rectangle when a shape has no plan', () => {
    const input = fixture([{ ...leg, shapeId: 'missing' }, { ...leg, id: 'feet', height: 'feet' }], {}, { z: 0 });
    const layers = nodes(RunGroup.type(input)).filter(({ type }) => type === LegShapes);
    expect(layers.every(({ props }) => LegShapes(props).length === 0)).toBe(true);
    expect(PlanLegs(input)).toHaveLength(0);
    const shape = structuredClone(settings.shapes[0]);
    delete shape.views.plan;
    const fallback = PlanLegs({ ...fixture(), settings: { ...settings, shapes: [shape] }, stroke: '#fff' });
    expect(fallback).toHaveLength(1);
    const ctx = context();
    fallback[0].props.sceneFunc(ctx, {});
    expect(ctx.lineTo).toHaveBeenCalledTimes(3);
    expect(ctx.closePath).toHaveBeenCalledOnce();
    expect(ctx.arc).not.toHaveBeenCalled();
  });
});
