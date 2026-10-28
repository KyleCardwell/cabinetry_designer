import { describe, expect, it, vi } from 'vitest';
import { Circle, Group, Line, Text } from 'react-konva';
import { auto, opening, room as makeRoom, run, wall as makeWall } from '../../../test/builders.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { elevationToPlan, wallFrame } from '../../model/geometry.js';
import { planThroughDimensions } from '../../model/planDimensions.js';
import { syncRoom } from '../../model/room.js';
import { wallSideFrame } from '../../model/wallSides.js';
import PlanOpening from '../PlanOpening.jsx';
import PlanRecess from '../PlanRecess.jsx';
import PlanRunFootprint from '../PlanRunFootprint.jsx';
import PlanWallShape from '../PlanWallShape.jsx';
import { canvasDimensionRows, elevationMarkers, MARKER_FLAG_LENGTH, MARKER_RADIUS } from '../elevationMarkers.js';
import { depthDimension } from '../depthDimension.js';
import { PLAN_DIM_FONT_SIZE } from '../constants.js';

vi.mock('react', async (original) => ({
  ...await original(),
  useMemo: (callback) => callback(),
  useRef: (current) => ({ current }),
  useId: () => 'dm1-canvas',
  useEffect: vi.fn(),
  useState: (value) => [value, vi.fn()],
}));
vi.mock('react-konva', () => ({ Circle: 'circle', Group: 'group', Label: 'label', Line: 'line', Tag: 'tag', Text: 'text' }));

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];

function setup({ window = false, panels = [], ...overrides } = {}) {
  const room = syncRoom(makeRoom({
    id: 'dm1', profile: {}, wallOrder: ['wall'],
    walls: [makeWall({
      id: 'wall', x1: 0, y1: 0, x2: 96, y2: 0, height: 96, thickness: 4.5,
      connections: { start: null, end: null }, landings: { start: null, end: null },
      endPanels: Object.fromEntries(panels.map((end) => [end, { width: 0.75 }])),
      runs: ['front', 'back'].map((side) => run({
        id: side, cabinetTypeId: CABINET_TYPE_IDS.BASE, wallSide: side,
        x: 0, width: 96, depth: 24,
        ends: { left: { type: 'none' }, right: { type: 'none' } },
        anchors: { left: true, right: true }, autoCount: false,
        items: [auto(`${side}-cabinet`)],
      })), joints: [],
      openings: window ? [opening({
        id: 'window', label: 'W1', kind: 'window', width: 36, height: 36, sillZ: 40,
        measureMode: 'jamb', offset: 30, offsetFrom: 'left', casing: null,
      })] : [], ...overrides,
    })],
  }), settings);
  const wall = room.walls[0];
  return { room, wall, settings, scale: 2, frame: wallFrame(room, wall) };
}

function outwardDistance(point, frame, direction = -1) {
  return direction * ((point.x - frame.leftPoint.x) * frame.n.x
    + (point.y - frame.leftPoint.y) * frame.n.y);
}

function checkMarker(input, tree) {
  const wallLine = tree.find(({ type, props }) => type === Line && props.stroke === '#94a3b8');
  const rowOffset = outwardDistance({ x: wallLine.props.points[0], y: wallLine.props.points[1] }, input.frame);
  const marker = elevationMarkers(input.room, settings, input.scale).find(({ side }) => side === 'back');
  const markerOffset = outwardDistance(marker.point, input.frame);
  expect(rowOffset).toBeGreaterThan(29.375);
  expect(markerOffset).toBeGreaterThan(rowOffset);
  const flagTip = markerOffset - (MARKER_RADIUS + MARKER_FLAG_LENGTH) / input.scale;
  const rowLabels = tree.filter(({ type, props }) => type === Text && props.fill === '#e2e8f0');
  expect(flagTip).toBeGreaterThan(Math.max(...rowLabels.map(({ props }) => outwardDistance(props, input.frame))));
  const number = tree.find(({ type }) => type === Circle);
  expect(outwardDistance(number.props, input.frame)).toBeCloseTo(rowOffset + 24 / input.scale);
  return rowOffset;
}

describe('DM1 step b canvas render anchors', () => {
  it('puts the island marker beyond its rows and opening/recess labels beyond opposite-side runs', () => {
    // Step a case 2: 4 1/2 wall and two 24 7/8-deep Euro base runs.
    const island = setup();
    expect(checkMarker(island, nodes(PlanWallShape(island)))).toBe(40.375);
    for (const overrides of [{}, { flipped: true }, { x2: 0, y2: 96 }]) {
      const input = setup({ window: true, ...overrides });
      checkMarker(input, nodes(PlanWallShape(input)));
      const opening = input.wall.openings[0];
      const label = nodes(PlanOpening({ ...input, opening })).find(({ type }) => type === Text);
      expect(label.props.text).toBe('W1 · 36"');
      expect(outwardDistance(label.props, input.frame)).toBe(34.375);
      expect(outwardDistance(label.props, input.frame)).toBeGreaterThan(29.375);
      for (const side of ['front', 'back']) {
        const frame = wallSideFrame(input.room, input.wall, side);
        for (const [kind, depth, bump] of [['recess', 2, 0], ['recess', 8, 8], ['projection', 8, 0]]) {
          const recess = { id: 'recess', label: 'R1', wallSide: side, kind, offset: 30, offsetFrom: 'left',
            width: 36, height: 36, bottom: 40, depth };
          const text = nodes(PlanRecess({ ...input, frame, recess })).find(({ type }) => type === Text);
          expect(outwardDistance(text.props, frame)).toBeCloseTo(34.375 + bump);
        }
      }
    }
    // A back-face recess creates a room-side row; its marker follows the row past front runs.
    for (const depth of [8, 40]) {
      const input = setup({ recesses: [{
        id: 'back-recess', label: 'R1', kind: 'recess', wallSide: 'back',
        offset: 30, offsetFrom: 'left', width: 36, height: 36, bottom: 40, depth,
      }] });
      const tree = nodes(PlanWallShape(input));
      const backRow = tree.find(({ type, key }) => type === Group && key === 'back');
      const line = nodes(backRow).find(({ type }) => type === Line);
      const rowDepth = outwardDistance({ x: line.props.points[0], y: line.props.points[1] }, input.frame, 1);
      expect(rowDepth).toBe(Math.max(depth, 24.875) + 42 / input.scale);
      const marker = elevationMarkers(input.room, settings, input.scale).find(({ side }) => side === 'front');
      const flagDepth = outwardDistance(marker.point, input.frame, 1)
        - (MARKER_RADIUS + MARKER_FLAG_LENGTH) / input.scale;
      const labels = nodes(backRow).filter(({ type }) => type === Text);
      expect(flagDepth).toBeGreaterThan(Math.max(...labels.map(({ props }) => outwardDistance(props, input.frame, 1))));
    }
    // A short window makes dimension text pop out; the wall row and marker follow those levels.
    const short = setup({ window: true, x2: 10 });
    checkMarker(short, nodes(PlanWallShape(short)));
  });

  it('renders through-depth model numbers with a line, two ticks and a readable label at the outer panel end', () => {
    for (const overrides of [{}, { flipped: true }, { x2: 0, y2: 96 }, { x2: 57.6, y2: 76.8 }]) {
      for (const panels of [[], ['start'], ['end'], ['start', 'end']]) {
        const input = setup({ panels, ...overrides });
        const groups = nodes(PlanWallShape(input)).filter(({ type, key }) => (
          type === Group && key?.startsWith('through:')
        ));
        expect(groups).toHaveLength(panels.length ? 1 : 0);
        groups.forEach((group, index) => {
          const children = nodes(group);
          const lines = children.filter(({ type }) => type === Line);
          const label = children.find(({ type }) => type === Text);
          const record = planThroughDimensions(input.room, input.wall, settings)[index];
          expect(lines).toHaveLength(3);
          expect(lines[0].props.points).toEqual([record.start[0], -record.start[1], record.end[0], -record.end[1]]);
          expect(label.props.text).toBe('54 1/4');
          expect(Math.abs(label.props.rotation)).toBeLessThanOrEqual(90);
          const [x1, y1, x2, y2] = lines[0].props.points;
          expect(Math.hypot(x2 - x1, y2 - y1)).toBeCloseTo(54.25);
          if (!Object.keys(overrides).length) {
            const x = panels[0] === 'end' ? 105 : -9;
            expect(lines[0].props.points).toEqual([x, 24.875, x, -29.375]);
          }
        });
      }
    }
  });
});

function expectPoint(actual, expected) {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
}

function expectGap(lines, start, end, label, scale) {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const direction = { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
  const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  expectPoint(label.props, center);
  expect(label.props.offsetY).toBe(label.props.fontSize / 2);
  expect(label.props.offsetX).toBe(label.props.width / 2);
  expect(Math.abs(label.props.rotation)).toBeLessThanOrEqual(90);
  expect(lines).toHaveLength(2);
  const expected = [
    [start.x, start.y, center.x - direction.x * label.props.width / 2, center.y - direction.y * label.props.width / 2],
    [center.x + direction.x * label.props.width / 2, center.y + direction.y * label.props.width / 2, end.x, end.y],
  ];
  lines.forEach(({ props }, index) => {
    expect(props.strokeWidth).toBe(1 / scale);
    props.points.forEach((value, coordinate) => expect(value).toBeCloseTo(expected[index][coordinate]));
    const [x1, y1, x2, y2] = props.points;
    expect(Math.hypot(x2 - x1, y2 - y1) * scale).toBeGreaterThanOrEqual(4 - 1e-8);
  });
}

const orientations = [{}, { flipped: true }, { x2: 0, y2: 96 }, { x2: 57.6, y2: 76.8 }];

describe('DM7 step d centred plan dimensions', () => {
  it('centres wall overall and both face rows with padded gaps at multiple angles and scales', () => {
    for (const overrides of orientations) {
      for (const scale of [2, 4]) {
        const input = { ...setup({ window: true, ...overrides, recesses: [{
          id: 'back-recess', label: 'R1', kind: 'recess', wallSide: 'back',
          offset: 30, offsetFrom: 'left', width: 36, height: 36, bottom: 40, depth: 2,
        }] }), scale };
        const tree = nodes(PlanWallShape(input));
        const rows = canvasDimensionRows(input.room, input.wall, settings, scale);
        const overall = tree.find(({ type, props }) => type === Group && props.listening === false
          && nodes(props.children).some(({ key }) => key === 'overall:0'));
        const overallNodes = nodes(overall);
        const lineNodes = overallNodes.filter(({ type, props }) => type === Line && props.stroke === '#94a3b8');
        const ticks = overallNodes.filter(({ type, props }) => type === Line && props.stroke === '#cbd5e1');
        const endpoints = ticks.map(({ props: { points: [x1, y1, x2, y2] } }) => ({ x: (x1 + x2) / 2, y: (y1 + y2) / 2 }));
        expect(endpoints).toHaveLength(2);
        expectGap(lineNodes, ...endpoints, overallNodes.find(({ type }) => type === Text), scale);
        for (const side of ['front', 'back']) {
          const rowTree = nodes(tree.find(({ type, key }) => type === Group && key === side));
          const frame = wallSideFrame(input.room, input.wall, side);
          const offset = side === 'front' ? -rows.innerRowOffset : rows.backRowOffset;
          // Back-face rows use the opposite normal and their own reversed x axis.
          const rowPoint = (x) => ({
            x: frame.leftPoint.x + frame.r.x * x + input.frame.n.x * offset,
            y: frame.leftPoint.y + frame.r.y * x + input.frame.n.y * offset,
          });
          const lines = rowTree.filter(({ type, props }) => type === Line && props.stroke === '#94a3b8');
          const labels = rowTree.filter(({ type }) => type === Text);
          expect(labels).toHaveLength(rows.segments[side].length);
          rows.segments[side].forEach((segment, index) => {
            expectGap(lines.slice(index * 2, index * 2 + 2), rowPoint(segment.start), rowPoint(segment.end), labels[index], scale);
          });
          expect(rowTree.filter(({ type, props }) => type === Line && props.stroke === '#cbd5e1'))
            .toHaveLength(rows.segments[side].length + 1);
        }
      }
    }
    // At 11.9px/in, a 2in label fits exactly with 4px (0.336in) of line at each end.
    for (const withFaceRow of [false, true]) {
      const input = { ...setup({ x2: withFaceRow ? 6 : 2, openings: withFaceRow ? [opening({
        id: 'small-window', label: 'W1', kind: 'window', width: 2, height: 36, sillZ: 40,
        measureMode: 'jamb', offset: 2, offsetFrom: 'left', casing: null,
      })] : [] }), scale: 11.9 };
      const tree = nodes(PlanWallShape(input));
      const row = withFaceRow ? nodes(tree.find(({ type, key }) => type === Group && key === 'front')) : tree;
      const label = row.find(({ type }) => type === Text);
      const lines = row.filter(({ type, props }) => type === Line && props.stroke === '#94a3b8').slice(0, 2);
      expectGap(lines, { x: 0, y: label.props.y }, { x: 2, y: label.props.y }, label, input.scale);
    }
  });

  it('keeps wall pop-out distances, midpoint leaders and hidden face labels unchanged', () => {
    for (const scale of [0.2, 0.3]) {
      const input = { ...setup({ window: true }), scale };
      const tree = nodes(PlanWallShape(input));
      const rows = canvasDimensionRows(input.room, input.wall, settings, scale);
      const overallLabel = tree.find(({ type }) => type === Text);
      expect(outwardDistance(overallLabel.props, input.frame))
        .toBeCloseTo(rows.dimensionOffset + 24 / scale);
      const overallLine = tree.find(({ key }) => key === 'overall:0');
      const [x1, y1, x2, y2] = overallLine.props.points;
      const center = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
      expect(tree.some(({ type, props }) => type === Line && props.points?.every((value, i) => (
        Math.abs(value - [center.x, center.y, overallLabel.props.x, overallLabel.props.y][i]) < 1e-8
      )))).toBe(true);
      const frontTree = nodes(tree.find(({ type, key }) => type === Group && key === 'front'));
      expect(rows.layouts.front.labels.map(({ mode }) => mode)).toEqual(['popout', 'popout', 'hidden']);
      const labels = frontTree.filter(({ type }) => type === Text);
      expect(labels).toHaveLength(2);
      labels.forEach((label, index) => {
        const { level } = rows.layouts.front.labels[index];
        const segment = rows.segments.front[index];
        const midpoint = elevationToPlan(input.frame, (segment.start + segment.end) / 2, -rows.innerRowOffset);
        expect(outwardDistance(label.props, input.frame)).toBeCloseTo(rows.innerRowOffset + (10 + 14 * level) / scale);
        const leader = frontTree.find(({ type, props }) => type === Line && props.stroke === '#64748b'
          && Math.abs(props.points[0] - midpoint.x) < 1e-8 && Math.abs(props.points[1] - midpoint.y) < 1e-8);
        expect(leader.props.points).toEqual([midpoint.x, midpoint.y, label.props.x, label.props.y]);
      });
      const lines = frontTree.filter(({ type, props }) => type === Line && props.stroke === '#94a3b8');
      expect(lines).toHaveLength(3);
      lines.forEach(({ props }, index) => {
        const segment = rows.segments.front[index];
        expect(props.points).toEqual([segment.start, -rows.innerRowOffset, segment.end, -rows.innerRowOffset]);
      });
    }
  });

  it('centres and gaps run and projection depths, retaining pop-outs on both faces and offset run planes', () => {
    for (const overrides of orientations) {
      for (const side of ['front', 'back']) {
        for (const [runDepth, projectionDepth, scale, factor] of [[24, 24, 1, 1], [24, 24, 4, 1], [1.125, 2, 11.9, 1], [24, 24, 4, 2], [1.125, 2, 11.9, 2]]) {
          const input = { ...setup(overrides), text: { label: factor, dimension: factor } };
          const frame = wallSideFrame(input.room, input.wall, side);
          const run = { ...input.wall.runs.find((run) => run.wallSide === side), depth: runDepth };
          for (const planeBack of [0, -2]) {
            const depth = runDepth + 0.875;
            const tree = nodes(PlanRunFootprint({ ...input, frame, run: { ...run, _plane: { offset: planeBack } }, scale }));
            const label = tree.find(({ type, props }) => type === Text && props.fill === '#e2e8f0');
            const dim = depthDimension(run, depth, scale, PLAN_DIM_FONT_SIZE * factor);
            checkDepth(tree, label, elevationToPlan(frame, dim.x, planeBack), elevationToPlan(frame, dim.x, planeBack + depth), dim, frame, scale, planeBack, factor);
          }
          const recess = { id: 'projection', label: 'P1', kind: 'projection', wallSide: side,
            offset: 30, offsetFrom: 'left', width: 36, height: 36, bottom: 40, depth: projectionDepth };
          const tree = nodes(PlanRecess({ ...input, frame, recess, scale }));
          const label = tree.filter(({ type }) => type === Text)[1];
          const dim = depthDimension({ x: 57, width: 0 }, projectionDepth, scale, PLAN_DIM_FONT_SIZE * factor);
          checkDepth(tree, label, elevationToPlan(frame, 57, 0), elevationToPlan(frame, 57, projectionDepth), dim, frame, scale, 0, factor);
        }
      }
    }
  });
});

function checkDepth(tree, label, back, front, dim, frame, scale, planeBack, factor = 1) {
  expect(label.props.fontSize).toBe(PLAN_DIM_FONT_SIZE * factor / scale);
  expect(label.props.offsetY).toBe(label.props.fontSize / 2);
  expectPoint(label.props, elevationToPlan(frame, dim.label.x, planeBack + dim.label.offset));
  const lines = tree.filter(({ key }) => key?.startsWith('depth-line:'));
  const ticks = tree.filter((node) => node.type === Line && node.props.stroke === '#e2e8f0' && !lines.includes(node));
  expect(ticks).toHaveLength(2);
  for (const [index, endpoint] of [back, front].entries()) {
    const [x1, y1, x2, y2] = ticks[index].props.points;
    expectPoint({ x: (x1 + x2) / 2, y: (y1 + y2) / 2 }, endpoint);
    expect(Math.hypot(x2 - x1, y2 - y1) * scale).toBeCloseTo(8);
  }
  if (dim.fits) {
    expectGap(lines, back, front, label, scale);
    expect(tree.filter(({ type, props }) => type === Line && props.stroke === '#64748b')).toHaveLength(0);
  } else {
    expect(lines).toHaveLength(1);
    expect(lines[0].props.points).toEqual([back.x, back.y, front.x, front.y]);
    const leader = tree.find(({ type, props }) => type === Line && props.stroke === '#64748b');
    const start = elevationToPlan(frame, dim.leader.x1, planeBack + dim.leader.offset);
    const end = elevationToPlan(frame, dim.leader.x2, planeBack + dim.leader.offset);
    expect(leader.props.points).toEqual([start.x, start.y, end.x, end.y]);
  }
}
