import { describe, expect, it, vi } from 'vitest';
import { Circle, Group, Line, Text } from 'react-konva';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { wallFrame } from '../../model/geometry.js';
import { planThroughDimensions } from '../../model/planDimensions.js';
import { syncRoom } from '../../model/room.js';
import { wallSideFrame } from '../../model/wallSides.js';
import PlanOpening from '../PlanOpening.jsx';
import PlanRecess from '../PlanRecess.jsx';
import PlanWallShape from '../PlanWallShape.jsx';
import { elevationMarkers, MARKER_FLAG_LENGTH, MARKER_RADIUS } from '../elevationMarkers.js';

vi.mock('react', async (original) => ({
  ...await original(),
  useMemo: (callback) => callback(),
  useRef: (current) => ({ current }),
  useId: () => 'dm1-canvas',
  useEffect: vi.fn(),
}));
vi.mock('react-konva', () => ({ Circle: 'circle', Group: 'group', Line: 'line', Text: 'text' }));

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];

function setup({ window = false, panels = [], ...overrides } = {}) {
  const base = (side) => ({
    id: side, cabinetTypeId: CABINET_TYPE_IDS.BASE, wallSide: side,
    x: 0, width: 96, z: 4, height: 30.5, depth: 24,
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    anchors: { left: true, right: true }, overrides: {},
    autoCount: false, heightMode: 'manual',
    items: [{ id: `${side}-cabinet`, kind: 'cabinet', width: null }],
  });
  const room = syncRoom({
    id: 'dm1', profile: {}, wallOrder: ['wall'],
    walls: [{
      id: 'wall', x1: 0, y1: 0, x2: 96, y2: 0, height: 96, thickness: 4.5,
      connections: { start: null, end: null }, landings: { start: null, end: null },
      endPanels: Object.fromEntries(panels.map((end) => [end, { width: 0.75 }])),
      runs: [base('front'), base('back')], joints: [],
      openings: window ? [{
        id: 'window', label: 'W1', kind: 'window', width: 36, height: 36, sillZ: 40,
        measureMode: 'jamb', offset: 30, offsetFrom: 'left', casing: null,
      }] : [], ...overrides,
    }],
  }, settings);
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
