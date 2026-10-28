import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { Group, Line } from 'react-konva';
import { auto, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS, KIND_COLORS } from '../../model/constants.js';
import { syncRoom } from '../../model/room.js';
import { wallSideFrame } from '../../model/wallSides.js';
import PlanClearances from '../PlanClearances.jsx';
import PlanRunFootprint from '../PlanRunFootprint.jsx';
import PlanScene from '../PlanScene.jsx';
import PlanTops from '../PlanTops.jsx';

vi.mock('react', async (original) => ({
  ...await original(),
  useMemo: (callback) => callback(),
  useRef: (current) => ({ current }),
  useId: () => 'plan-tops-canvas',
  useEffect: vi.fn(),
  useState: (value) => [value, vi.fn()],
}));
vi.mock('react-konva', () => ({
  Group: 'group', Label: 'label', Line: 'line', Tag: 'tag', Text: 'text',
}));

const settings = { ...DEFAULT_SETTINGS };
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];

function sceneProps(room, settings, scale = 4) {
  return {
    walls: room.walls, room, settings, scale, selection: {}, tool: 'select',
    orderedOpenings: [], clearances: [], collisionMessages: new Map(),
    orderedFootprints: room.walls.flatMap((wall) => wall.runs.map((run) => ({
      wall, run, frame: wallSideFrame(room, wall, run.wallSide),
    }))),
  };
}

it('anchor 1: Room 9b scene draws one closed top outline in canvas y-down coordinates', () => {
  const stored = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/room9b.json', import.meta.url), 'utf8'));
  const settings9b = { ...settings, ...stored.settingsOverrides };
  const room9b = syncRoom(stored, settings9b);
  for (const scale of [2, 4]) {
    const scene = nodes(PlanScene(sceneProps(room9b, settings9b, scale)));
    const tops = scene.find(({ type }) => type === PlanTops);
    const lines = nodes(PlanTops(tops.props)).filter(({ type }) => type === Line);
    expect(lines).toHaveLength(1);
    expect(lines[0].props).toMatchObject({
      points: [8.5625, -20.6875, 8.5625, 40.25, -18.625, 40.25, -18.625, -20.6875],
      closed: true, stroke: '#cbd5e1', strokeWidth: 1 / scale, listening: false,
    });
    expect(lines[0].props.fill).toBeUndefined();
  }
});

it('anchor 2: rooms without tops render no top lines', () => {
  for (const input of [room(), room({ walls: [wall({ runs: [run({ top: 'none', items: [auto('C')] })] })] })]) {
    const scene = nodes(PlanScene(sceneProps(input, settings)));
    const tops = scene.find(({ type }) => type === PlanTops);
    expect(nodes(PlanTops(tops.props))).toEqual([]);
  }
});

it('anchor 3: outlines sit above footprints and end panels without intercepting run selection', () => {
  const input = syncRoom(room({ walls: [wall({
    endPanels: { start: { width: 0.75 } },
    runs: [run({ top: 'wood', anchors: { left: true, right: true }, items: [auto('C')] })],
  })] }), settings);
  let selectedRunId = null;
  const props = sceneProps(input, settings);
  props.handleRunSelect = () => { selectedRunId = input.walls[0].runs[0].id; };
  const scene = nodes(PlanScene(props));
  const tops = scene.find(({ type }) => type === PlanTops);
  const footprint = scene.find(({ type }) => type === PlanRunFootprint);
  const panel = scene.find(({ type, props }) => type === Line && props.fill === KIND_COLORS.end_panel);
  expect(panel).toBeDefined();
  expect(scene.indexOf(tops)).toBeGreaterThan(scene.indexOf(footprint));
  expect(scene.indexOf(tops)).toBeGreaterThan(scene.indexOf(panel));
  expect(scene.indexOf(tops)).toBeLessThan(scene.findIndex(({ type }) => type === PlanClearances));

  const outlines = nodes(PlanTops(tops.props));
  expect(outlines.length).toBeGreaterThan(0);
  outlines.forEach(({ props }) => expect(props.listening).toBe(false));
  const target = nodes(PlanRunFootprint(footprint.props)).find(({ type }) => type === Group);
  expect(target.props.listening).toBe(true);
  const event = {};
  target.props.onClick(event);
  expect(selectedRunId).toBe(input.walls[0].runs[0].id);
  expect(event.cancelBubble).toBe(true);
});
