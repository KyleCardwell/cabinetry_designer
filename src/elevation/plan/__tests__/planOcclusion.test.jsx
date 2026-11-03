import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { Group, Line } from 'react-konva';
import { auto, opening, room, run, wall } from '../../../test/builders.js';
import { CABINET_TYPE_COLORS, CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { elevationToPlan } from '../../model/geometry.js';
import { planPickStack } from '../../model/planPick.js';
import { syncRoom } from '../../model/roomSync.js';
import PlanClearances from '../PlanClearances.jsx';
import PlanRunFootprint from '../PlanRunFootprint.jsx';
import PlanScene from '../PlanScene.jsx';
import PlanTops from '../PlanTops.jsx';
import PlanTopOverhangs from '../PlanTopOverhangs.jsx';
import { PLAN_BACKGROUND_COLOR } from '../constants.js';
import usePlanSceneData from '../usePlanSceneData.js';

vi.mock('react', async (original) => ({
  ...await original(),
  useMemo: (callback) => callback(),
  useRef: (current) => ({ current }),
  useId: () => 'plan-occlusion',
  useEffect: vi.fn(),
  useState: (value) => [value, vi.fn()],
}));
vi.mock('react-konva', () => ({
  Group: 'group', Label: 'label', Line: 'line', Tag: 'tag', Text: 'text',
}));

const settings = { ...DEFAULT_SETTINGS };
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const data = (input, resolvedSettings = settings) => usePlanSceneData({
  room: input, sceneRoom: input, walls: input.walls, settings: resolvedSettings,
});
const footprintProps = (input, entry, resolvedSettings = settings) => ({
  ...entry, room: input, settings: resolvedSettings, selectable: true, scale: 4,
});

it('anchor 1: Room 10 sorts by top; §1 puts equal-height talls before the upper', () => {
  const stored = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/room10w8.json', import.meta.url), 'utf8'));
  const resolvedSettings = { ...settings, ...stored.settingsOverrides };
  const input = stored;
  const ordered = data(input, resolvedSettings).orderedFootprints;
  const tops = ordered.map(({ run }) => run.z + run.height);
  expect(tops).toEqual([16.5, 114, 114, 114, 114, 114, 114, 114, 114]);
  // Anchor 1 says room order between the upper and talls, contrary to §1's type tie-break.
  // Keep the hand-checked heights and record the §1 result explicitly.
  expect(ordered.filter(({ run }) => run.z + run.height === 114)
    .map(({ run }) => run.id.slice(0, 8))).toEqual([
    '9cf5ff3d', '19f01d1c', '15ece89c', '32064fcd',
    '71ee242a', 'a00760c5', '5003c53c', '4d5eff2e',
  ]);
  const w8 = ordered.filter(({ wall }) => wall.name === 'Wall 8');
  expect(w8.map(({ run }) => [run.id.slice(0, 8), run.z + run.height]))
    .toEqual([['a00760c5', 114], ['4d5eff2e', 114]]);
});

it.each([false, true])('anchor 2: base top 34.5 precedes upper top 84 (stored upper first: %s)', (upperFirst) => {
  const base = run({ id: 'base' });
  const upper = run({ id: 'upper', cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 30 });
  const input = room({ walls: [wall({ runs: upperFirst ? [upper, base] : [base, upper] })] });
  const original = input.walls[0].runs.slice();
  expect(data(input).orderedFootprints.map(({ run }) => [run.id, run.z + run.height]))
    .toEqual([['base', 34.5], ['upper', 84]]);
  expect(input.walls[0].runs).toEqual(original);
});

it('height wins over type, and same-type height ties retain room order across walls', () => {
  const input = room({ walls: [
    wall({ id: 'w1', runs: [
      run({ id: 'tall', cabinetTypeId: CABINET_TYPE_IDS.TALL, height: 110 }),
      run({ id: 'upper1', cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 30 }),
      run({ id: 'base1' }),
    ] }),
    wall({ id: 'w2', y1: 200, y2: 200, runs: [
      run({ id: 'upper2', cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 30 }),
      run({ id: 'base2' }),
    ] }),
  ] });
  expect(data(input).orderedFootprints.map(({ run }) => run.id))
    .toEqual(['base1', 'base2', 'upper1', 'upper2', 'tall']);
});

it('anchor 3: Wall 8 upper is solid with an opaque backdrop per box, face and return', () => {
  const stored = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/room10w8.json', import.meta.url), 'utf8'));
  const resolvedSettings = { ...settings, ...stored.settingsOverrides };
  const input = syncRoom(stored, resolvedSettings);
  const entry = data(input, resolvedSettings).orderedFootprints
    .find(({ run }) => run.id.startsWith('4d5eff2e'));
  expect(entry.run).toMatchObject({ z: 54, height: 60, depth: 33 });
  const lines = nodes(PlanRunFootprint(footprintProps(input, entry, resolvedSettings)))
    .filter(({ type }) => type === Line);
  expect(lines.every(({ props }) => !('dash' in props))).toBe(true);
  const backdrops = lines.filter(({ props }) => props.fill === PLAN_BACKGROUND_COLOR);
  const pieces = lines.filter(({ props }) => props.closed && props.fill !== PLAN_BACKGROUND_COLOR);
  expect(backdrops.length).toBeGreaterThan(1);
  expect(backdrops).toHaveLength(pieces.length);
  expect(lines.slice(0, backdrops.length).every(({ props }) => props.fill === PLAN_BACKGROUND_COLOR)).toBe(true);
  pieces.forEach((piece) => {
    const backdrop = backdrops.find(({ key }) => key === `backdrop:${piece.key}`);
    expect(backdrop.props).toMatchObject({
      points: piece.props.points, closed: true, listening: false,
    });
    expect(backdrop.props.stroke).toBeUndefined();
    expect(piece.props.fill).toMatch(/59$/);
  });
  expect(pieces.some(({ props }) => props.fill === `${CABINET_TYPE_COLORS[CABINET_TYPE_IDS.UPPER]}59`))
    .toBe(true);
});

it('shelf and wall-overhang outline segments keep their own scaled dashes', () => {
  const input = room({ walls: [wall({ x2: 60, runs: [run({
    cabinetTypeId: CABINET_TYPE_IDS.UPPER, x: -10, width: 90, z: 54, height: 30,
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    autoCount: false, items: [{ id: 'shelf', kind: 'shelves', width: 30 }, auto('cabinet')],
  })] })] });
  const entry = data(input).orderedFootprints[0];
  for (const scale of [1, 4]) {
    const lines = nodes(PlanRunFootprint({ ...footprintProps(input, entry), scale }))
      .filter(({ type }) => type === Line);
    const dashed = lines.filter(({ props }) => props.dash);
    expect(dashed.length).toBeGreaterThan(0);
    const shelves = dashed.filter(({ key }) => key.startsWith('shelf:outline:'));
    expect(shelves.length).toBeGreaterThan(0);
    shelves.forEach(({ props }) => expect(props.dash).toEqual([4 / scale, 3 / scale]));
    const overhangs = dashed.filter(({ key }) => key.startsWith('cabinet:outline:'));
    expect(overhangs.length).toBeGreaterThan(0);
    overhangs.forEach(({ props }) => expect(props.dash).toEqual([2 / scale, 2 / scale]));
    expect(dashed).toHaveLength(shelves.length + overhangs.length);
  }
});

it.each(['stone', 'wood'])('anchor 4: %s tops sit between base and upper, preserving selection and later overlays', (top) => {
  const input = syncRoom(room({ walls: [wall({
    id: 'W1', x2: 120, thickness: 0, thicknessOverride: 0,
    endPanels: { start: { width: 0.75 } },
    soffits: [{ id: 'soffit', x: 0, width: 30, depth: 12 }],
    openings: [opening({ offset: 24 })],
    runs: [
      run({ id: 'upper', cabinetTypeId: CABINET_TYPE_IDS.UPPER, x: 10, width: 60, depth: 12, z: 54, height: 30 }),
      run({ id: 'base', x: 10, width: 60, top, topOverhang: { front: 12 } }),
    ],
  })] }), settings);
  const sceneData = data(input);
  const handleRunSelect = vi.fn();
  const scene = nodes(PlanScene({
    ...sceneData, room: input, walls: input.walls, settings, scale: 4,
    selection: {}, tool: 'select', handleRunSelect,
  }));
  const drawing = scene.filter(({ type }) => [PlanRunFootprint, PlanTops, PlanTopOverhangs].includes(type));
  expect(drawing.map(({ type, props }) => type === PlanRunFootprint ? props.run.id : type))
    .toEqual(['base', PlanTops, PlanTopOverhangs, 'upper']);
  const upperIndex = scene.indexOf(drawing.at(-1));
  expect(scene.findIndex(({ type }) => type === PlanClearances)).toBeGreaterThan(upperIndex);
  expect(scene.filter(({ type }) => type === Line).every((line) => scene.indexOf(line) > upperIndex)).toBe(true);
  expect(nodes(PlanTops(drawing[1].props)).length).toBeGreaterThan(0);
  expect(nodes(PlanTopOverhangs(drawing[2].props)).length).toBeGreaterThan(0);
  for (const footprint of [drawing[0], drawing[3]]) {
    const group = nodes(PlanRunFootprint(footprint.props)).find(({ type }) => type === Group);
    expect(group.props.listening).toBe(true);
    const event = {};
    group.props.onClick(event);
    expect(handleRunSelect).toHaveBeenLastCalledWith(event);
    expect(event.cancelBubble).toBe(true);
  }
  const frame = sceneData.orderedFootprints[0].frame;
  expect(planPickStack(input, elevationToPlan(frame, 40, 0.5), settings).map(({ key }) => key))
    .toEqual(['run:upper', 'run:base', 'opening:door-1', 'wall:W1']);
  expect(planPickStack(input, elevationToPlan(frame, 40, 18), settings).map(({ key }) => key))
    .toEqual(['run:base', 'wall:W1']);
});
