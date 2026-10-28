import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { Circle, Rect, Stage, Text } from 'react-konva';
import { createInitialElevationState } from '../../store/elevationSlice.js';
import { auto, opening, room, run, wall } from '../../../test/builders.js';
import { CABINET_TYPE_IDS } from '../../model/constants.js';
import { wallFrame } from '../../model/geometry.js';
import { textScales } from '../../canvas/textScale.js';
import PlanCanvas from '../PlanCanvas.jsx';
import PlanScene from '../PlanScene.jsx';
import PlanOverlays from '../PlanOverlays.jsx';
import PlanWallShape from '../PlanWallShape.jsx';
import PlanOpening from '../PlanOpening.jsx';
import PlanRecess from '../PlanRecess.jsx';
import PlanRunFootprint from '../PlanRunFootprint.jsx';
import PlanClearances from '../PlanClearances.jsx';
import PlanElevationMarker from '../PlanElevationMarker.jsx';
import { PLAN_DIM_FONT_SIZE } from '../constants.js';
import { canvasDimensionRows, elevationMarkers, MARKER_RADIUS, MARKER_FLAG_LENGTH } from '../elevationMarkers.js';
import { depthDimension } from '../depthDimension.js';

// Keep hook state and effect lifecycles across renders without mounting Konva in a DOM.
let hooks;
vi.mock('react', async (original) => ({
  ...await original(),
  useState: (value) => hooks.state(value),
  useReducer: (reducer, value, init) => hooks.reducer(reducer, value, init),
  useRef: (value) => hooks.memo(() => ({ current: value }), []),
  useMemo: (callback, deps) => hooks.memo(callback, deps),
  useCallback: (callback, deps) => hooks.memo(() => callback, deps),
  useEffect: (callback, deps) => hooks.effect(callback, deps),
  useLayoutEffect: (callback, deps) => hooks.effect(callback, deps),
  useImperativeHandle: vi.fn(),
  useId: () => 'plan-text-scale',
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('react-konva', () => ({
  Circle: 'circle', Group: 'group', Label: 'label', Layer: 'layer', Line: 'line', Rect: 'rect', Shape: 'shape',
  Stage: 'stage', Tag: 'tag', Text: 'text',
}));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

let state;
let tree;
let render;
let fitRequest;
const node = (type) => tree.find((item) => item.type === type);

beforeEach(() => {
  const slots = [];
  let index = 0;
  let dirty = true;
  let effects = [];
  hooks = {
    state(initial) {
      const i = index++;
      if (!slots[i]) {
        let value = typeof initial === 'function' ? initial() : initial;
        if (value?.width === 0 && value?.height === 0) value = { width: 480, height: 480 };
        const slot = { value, set(next) {
          const value = typeof next === 'function' ? next(slot.value) : next;
          if (!Object.is(value, slot.value)) { slot.value = value; dirty = true; }
        } };
        slots[i] = slot;
      }
      return [slots[i].value, slots[i].set];
    },
    reducer(reducer, initial, init) {
      const [value, set] = hooks.state(init ? () => init(initial) : initial);
      return [value, hooks.memo(() => (action) => set((current) => reducer(current, action)), [])];
    },
    memo(callback, deps) {
      const i = index++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: callback(), deps };
      return slots[i].value;
    },
    effect(callback, deps) {
      const i = index++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        effects.push(() => {
          slots[i]?.cleanup?.();
          slots[i] = { deps, cleanup: callback() };
        });
      }
    },
    unmount() { slots.forEach((slot) => slot?.cleanup?.()); },
  };
  state = createInitialElevationState({
    rooms: [room({ walls: [wall({ x2: 120, endPanels: { start: { width: 0.75 } }, runs: ['front', 'back'].map((side) => run({
      id: `run-${side}`, wallSide: side, width: 120, anchors: { left: true, right: true }, autoCount: false, items: [auto('cabinet')],
      ends: { left: { type: 'none' }, right: { type: 'none' } },
    })), openings: [opening({ offset: 40 })], recesses: [{
      id: 'projection', label: 'P1', kind: 'projection', wallSide: 'front',
      offset: 90, offsetFrom: 'left', width: 20, height: 36, bottom: 0, depth: 24,
    }] })] })],
    activeRoomId: 'room-1', activeWallId: 'wall-1', view: 'plan',
  });
  useDispatch.mockReturnValue(vi.fn());
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('document', { querySelector: () => null });
  fitRequest = 0;
  render = () => {
    dirty = true;
    for (let count = 0; dirty; count += 1) {
      if (count > 20) throw new Error('Canvas did not settle');
      dirty = false;
      index = 0;
      effects = [];
      tree = nodes(PlanCanvas({ fitRequest }));
      node(Stage).ref.current = { getPointerPosition: () => ({ x: 240, y: 240 }) };
      effects.forEach((effect) => effect());
    }
  };
  render();
});

afterEach(() => {
  hooks.unmount();
  vi.unstubAllGlobals();
});

function wheel(direction, steps) {
  for (let index = 0; index < steps; index += 1) {
    node(Stage).props.onWheel({ evt: { preventDefault: vi.fn(), deltaY: direction } });
    render();
  }
}

it('anchor 1: fit zoom 0.8 gives factors 1/1, and a new fit resets the baseline', () => {
  const props = node(PlanScene).props;
  expect(props.scale).toBeCloseTo(3.2); // 384px / 120in; 4px per inch gives zoom 0.8.
  expect(props.text).toEqual({ label: 1, dimension: 1 });
  wheel(-1, 10);
  expect(node(PlanScene).props.text.label).toBeGreaterThan(1);
  fitRequest += 1;
  render();
  expect(node(PlanScene).props.text).toEqual({ label: 1, dimension: 1 });
  // Refitting after geometry changes remembers the new fit, including an empty room.
  state = { ...state, rooms: [room({ walls: [wall({ x2: 240 })] })] };
  fitRequest += 1;
  render();
  expect(node(PlanScene).props.scale).toBeCloseTo(1.6);
  expect(node(PlanScene).props.text).toEqual({ label: 1, dimension: 1 });
  state = { ...state, rooms: [room()] };
  fitRequest += 1;
  render();
  expect(node(PlanScene).props.scale).toBe(4);
  expect(node(PlanScene).props.text).toEqual({ label: 1, dimension: 1 });
});

it('anchor 2: fit 0.8, zoom 3.2 gives labels 4 and dimensions 2 throughout the scene', () => {
  // Wheel events keep the fit baseline as the zoom grows.
  wheel(-1, 36);
  expect(node(PlanScene).props.text.label).toBe(4);
  expect(node(PlanScene).props.text.dimension).toBeCloseTo(Math.sqrt(1.04 ** 36));
  const text = textScales(3.2 / 0.8);
  expect(text).toEqual({ label: 4, dimension: 2 });
  const props = { ...node(PlanScene).props, text, scale: 3.2 * 4 };
  const scene = nodes(PlanScene(props));
  const wallProps = scene.find(({ type }) => type === PlanWallShape).props;
  const wallTree = nodes(PlanWallShape(wallProps));
  const wallDimension = wallTree.find(({ type }) => type === Text);
  expect(wallDimension.props.fontSize).toBe(PLAN_DIM_FONT_SIZE * 2 / props.scale);
  expect(wallDimension.props.width).toBe((wallDimension.props.text.length * 0.6 * PLAN_DIM_FONT_SIZE + 8) * 2 / props.scale);
  const through = wallTree.find(({ key }) => key === 'through:0');
  expect(nodes(through).find(({ type }) => type === Text).props.fontSize).toBe(PLAN_DIM_FONT_SIZE * 2 / props.scale);
  const tinyWall = wall({ x2: 2 });
  const tinyRoom = room({ walls: [tinyWall] });
  const tinyRows = canvasDimensionRows(tinyRoom, tinyWall, props.settings, props.scale, 2);
  const popout = nodes(PlanWallShape({ ...wallProps, wall: tinyWall, room: tinyRoom }))
    .find(({ type }) => type === Text);
  expect(Math.abs(popout.props.y)).toBeCloseTo(tinyRows.dimensionOffset + 24 * 2 / props.scale);
  const wallNumber = wallTree.find(({ type, props }) => type === Text && props.fill === '#f8fafc');
  expect(wallNumber.props.fontSize).toBe(10 * 4 / props.scale);
  expect(wallTree.find(({ type }) => type === Circle).props.radius).toBe(9 / props.scale);
  const rows = canvasDimensionRows(props.room, wallProps.wall, props.settings, props.scale, 2);
  expect(rows.innerRowOffset - rows.outside).toBeCloseTo(22 * 2 / props.scale);
  expect(rows.dimensionOffset - rows.innerRowOffset).toBeCloseTo((20 + rows.layouts.front.levels * 14) * 2 / props.scale);
  for (const type of [PlanOpening, PlanRecess]) {
    const child = scene.find((item) => item.type === type);
    const labels = nodes(type(child.props)).filter((item) => item.type === Text);
    labels.forEach(({ props: label }) => expect(label.fontSize).toBe(PLAN_DIM_FONT_SIZE * 2 / props.scale));
  }
  const footprint = scene.find(({ type }) => type === PlanRunFootprint);
  const depthTree = nodes(PlanRunFootprint(footprint.props));
  const depthLabel = depthTree.find(({ type }) => type === Text);
  expect(depthLabel.props.fontSize).toBe(PLAN_DIM_FONT_SIZE * 4 / props.scale);
  const tick = depthTree.find(({ key }) => key === 'depth-tick:0').props.points;
  expect(Math.hypot(tick[2] - tick[0], tick[3] - tick[1]) * props.scale).toBeCloseTo(8);
  const clearanceProps = scene.find(({ type }) => type === PlanClearances).props;
  const clearance = nodes(PlanClearances({ ...clearanceProps, dimensions: [{
    kind: 'gap', from: { x: 0, y: 0 }, to: { x: 20, y: 0 }, length: 20,
  }] }));
  expect(clearance.find(({ type }) => type === Text).props.fontSize).toBe(PLAN_DIM_FONT_SIZE * 2 / props.scale);
  expect(clearance.find(({ type }) => type === Rect).props.height).toBe((PLAN_DIM_FONT_SIZE + 4) * 2 / props.scale);
  const overlay = nodes(PlanOverlays({ ...node(PlanOverlays).props, ...props,
    tool: 'wall', mouseWorldPos: { x: 0, y: 0, _faceLabel: 'Wall 1' },
  }));
  expect(overlay.find(({ type }) => type === Text).props.fontSize).toBe(10 * 4 / props.scale);
  expect(overlay.find(({ type }) => type === PlanElevationMarker).props.scale).toBe(props.scale);
  const frame = wallFrame(props.room, wallProps.wall);
  const marker = elevationMarkers(props.room, props.settings, props.scale, 2).find(({ side }) => side === 'back');
  const markerOffset = -((marker.point.x - frame.leftPoint.x) * frame.n.x + (marker.point.y - frame.leftPoint.y) * frame.n.y);
  expect(markerOffset - (MARKER_RADIUS + MARKER_FLAG_LENGTH) / props.scale).toBeGreaterThan(rows.dimensionOffset);
});

it('anchor 3: fit 0.8, zoom 0.4 keeps factors 1/1 when zooming out', () => {
  expect(textScales(0.4 / 0.8)).toEqual({ label: 1, dimension: 1 });
  wheel(1, 18);
  expect(node(PlanScene).props.scale).toBeCloseTo(3.2 / 1.04 ** 18);
  expect(node(PlanScene).props.text).toEqual({ label: 1, dimension: 1 });
});

it('anchor 4: doubling the depth font pops out a label that fitted, and spreads depth lanes', () => {
  const base = run({ x: 0, width: 120 });
  const normal = depthDimension(base, 24, 2);
  const larger = depthDimension(base, 24, 2, PLAN_DIM_FONT_SIZE * 2);
  expect(normal.fits).toBe(true);
  expect(normal.leader).toBeNull();
  expect(larger.fits).toBe(false);
  expect(larger.leader).not.toBeNull();
  expect(larger.label.x - larger.x).toBeCloseTo((10 + 2 + PLAN_DIM_FONT_SIZE / 2) * 2 / 2);
  const upper = run({ ...base, cabinetTypeId: CABINET_TYPE_IDS.UPPER });
  expect(depthDimension(upper, 24, 2, PLAN_DIM_FONT_SIZE * 2).x - base.width / 2).toBe(-28);
  expect(depthDimension(upper, 24, 2).x - base.width / 2).toBe(-14);
});
