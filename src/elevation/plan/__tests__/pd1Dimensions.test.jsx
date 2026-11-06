import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { Group, Line, Text } from 'react-konva';
import { room as makeRoom, wall as makeWall } from '../../../test/builders.js';
import { KIND_COLORS } from '../../model/constants.js';
import { syncRoom } from '../../model/room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';
import PlanClearances from '../PlanClearances.jsx';
import PlanRecess, { PlanRecessDepth } from '../PlanRecess.jsx';
import PlanRunFootprint, { PlanRunDepth } from '../PlanRunFootprint.jsx';
import PlanScene from '../PlanScene.jsx';
import PlanTops from '../PlanTops.jsx';
import PlanTopOverhangs from '../PlanTopOverhangs.jsx';
import PlanWallShape, { PlanWallDimensions } from '../PlanWallShape.jsx';
import usePlanSceneData from '../usePlanSceneData.js';

vi.mock('react', async (original) => ({
  ...await original(),
  useMemo: (callback) => callback(),
  useState: (value) => [value, vi.fn()],
}));
vi.mock('../../canvas/cursor.js', () => ({ useCursorKeys: () => ({ request: vi.fn(), release: vi.fn() }) }));
vi.mock('react-konva', () => ({ Circle: 'circle', Group: 'group', Label: 'label', Line: 'line', Tag: 'tag', Text: 'text' }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const document = normalizeElevationDocument(JSON.parse(readFileSync(
  new URL('../../model/__tests__/fixtures/golden.json', import.meta.url), 'utf8',
)));
const { settings } = document;
// Fixed props captured from the original part components before the PD1 extraction.
const before = JSON.parse(readFileSync(new URL('./pd1DrawingBefore.json', import.meta.url), 'utf8'));
const golden = (prefix) => syncRoom(document.rooms.find(({ name }) => name.startsWith(prefix)), settings);
const sceneProps = (room, scale = 2) => ({
  ...usePlanSceneData({ room, walls: room.walls, sceneRoom: room, settings }),
  walls: room.walls, room, settings, scale, text: { label: 2, dimension: 1.5 },
  selection: {}, tool: 'select',
});
const drawing = (tree) => nodes(tree)
  .filter(({ type, props }) => type === Line
    ? ['#94a3b8', '#64748b', '#cbd5e1'].includes(props.stroke)
    : type === Text && props.fill === '#e2e8f0')
  .map(({ type, props }) => ({ type, props }));

it('anchor 1: G2 base depth draws after the overlapping upper footprint', () => {
  const scene = nodes(PlanScene(sceneProps(golden('G2'))));
  const baseDepth = scene.findIndex(({ type, props }) => type === PlanRunDepth
    && props.run.id === '860a1197-d14f-4fc2-9499-2d44cd1d8fa3');
  const upper = scene.findIndex(({ type, props }) => type === PlanRunFootprint
    && props.run.id === 'ab0981ca-8621-45ba-a924-dbe318646f67');
  expect(upper).toBeGreaterThanOrEqual(0);
  expect(baseDepth).toBeGreaterThan(upper);
});

it('anchor 2: every dimension follows all G2 parts, end panels and soffits in one final group', () => {
  const input = golden('G2');
  // G2 has an end panel; add a projection and soffit to exercise those drawing paths too.
  const room = syncRoom(makeRoom({ ...input, walls: input.walls.map((wall, index) => index ? wall : makeWall({
    ...wall,
    soffits: [{ id: 'pd1-soffit', x: 0, width: 30, depth: 12 }],
    recesses: [{ id: 'pd1-projection', kind: 'projection', label: 'P1', wallSide: 'front',
      offset: 90, offsetFrom: 'left', width: 12, height: 36, bottom: 0, depth: 8 }],
  })) }), settings);
  const scene = nodes(PlanScene(sceneProps(room)));
  const footprints = scene.filter(({ type }) => type === PlanRunFootprint);
  const panels = scene.filter(({ type, props }) => type === Line && props.fill === KIND_COLORS.end_panel);
  const soffits = scene.filter(({ type, props }) => type === Line && props.stroke === '#94a3b8');
  expect(footprints.length).toBeGreaterThan(0);
  expect(panels.length).toBeGreaterThan(0);
  expect(soffits).toHaveLength(1);
  const types = [PlanWallDimensions, PlanRecessDepth, PlanRunDepth, PlanTopOverhangs, PlanClearances];
  const dimensions = scene.filter(({ type }) => types.includes(type));
  expect([...new Set(dimensions.map(({ type }) => type))]).toEqual(types);
  const parts = scene.filter(({ type }) => [PlanWallShape, PlanRecess, PlanRunFootprint, PlanTops, Line].includes(type));
  const lastPart = Math.max(...parts.map((part) => scene.indexOf(part)));
  dimensions.forEach((dimension) => expect(scene.indexOf(dimension)).toBeGreaterThan(lastPart));
  const group = scene.find(({ type }) => type === Group);
  expect(group.props.listening).toBe(false);
  expect(nodes(group).slice(1)).toEqual(dimensions);
  expect(scene.at(-1)).toBe(dimensions.at(-1));
  dimensions.filter(({ type }) => [PlanWallDimensions, PlanRecessDepth, PlanRunDepth].includes(type))
    .forEach(({ key }) => expect(key.endsWith(':dim')).toBe(true));
});

it('anchor 3: G6 footprints have no depth labels and their siblings preserve captured drawing props', () => {
  for (const scale of [2, 4]) {
    const props = sceneProps(golden('G6'), scale);
    for (const entry of props.orderedFootprints) {
      const captured = before[`G6:${scale}`].find(({ runId }) => runId === entry.run.id).props;
      const footprint = nodes(PlanRunFootprint({ ...props, ...entry }));
      expect(footprint.some(({ type, props }) => type === Text && props.text === captured.text)).toBe(false);
      const depth = nodes(PlanRunDepth({ ...props, ...entry }));
      expect(depth.find(({ type }) => type === Text).props).toEqual(captured);
    }
  }
});

it('anchor 4: G1 island wall dimensions preserve every captured Line/Text prop outside the wall shape', () => {
  for (const scale of [2, 0.5]) {
    const props = sceneProps(golden('G1'), scale);
    const wall = props.walls.find(({ id }) => id === '84063fed-ab0d-4a1d-ae05-ffe67decad5e');
    expect(drawing(PlanWallShape({ ...props, wall }))).toEqual([]);
    expect(drawing(PlanWallDimensions({ ...props, wall }))).toEqual(before[`G1:${scale}`]);
    expect(nodes(PlanWallDimensions({ ...props, wall })).some(({ key }) => key === 'through:0')).toBe(true);
  }
});

it('keeps the extracted dimensions non-listening, including projection depths', () => {
  const props = sceneProps(golden('G1'));
  const entry = props.orderedFootprints[0];
  const recess = { id: 'projection', kind: 'projection', label: 'P1', wallSide: 'front',
    offset: 12, offsetFrom: 'left', width: 24, height: 36, bottom: 0, depth: 8 };
  const recessProps = { ...props, ...entry, recess };
  expect(nodes(PlanRecess(recessProps)).filter(({ type }) => type === Text)).toHaveLength(1);
  const projection = PlanRecessDepth(recessProps);
  expect(nodes(projection).find(({ type }) => type === Text).props.text).toBe('8');
  const trees = [projection, PlanRunDepth({ ...props, ...entry }), PlanWallDimensions({ ...props, wall: entry.wall })];
  for (const tree of trees) {
    expect(tree.props.listening).toBe(false);
    nodes(tree).forEach(({ props }) => {
      expect(props.listening).not.toBe(true);
      expect(Object.keys(props).some((key) => /^on[A-Z]/.test(key))).toBe(false);
    });
  }
  expect(PlanRecessDepth({ ...recessProps, recess: { ...recess, kind: 'recess' } })).toBeNull();
});
