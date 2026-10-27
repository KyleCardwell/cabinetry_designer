import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { connectWallStops } from '../../model/__tests__/helpers/wallStops.js';
import { room as buildRoom, run as buildRun, wall as buildWall } from '../../../test/builders.js';
import { Rect, Shape, Line } from 'react-konva';
import { CABINET_TYPE_IDS } from '../../model/constants.js';
import { gridFromItems } from '../../model/grid.js';
import { setGridCellBaseUnder, setGridCellKind, setGridPanelType } from '../../model/cellTree.js';
import { bandParts } from '../../model/bandParts.js';
import { furnitureBaseGroups } from '../../model/furnitureBaseGroups.js';
import { partNumbers, wallMoldingBadges } from '../../model/partNumbers.js';
import { runBands } from '../../model/runBands.js';
import { runBase } from '../../model/furnitureBase.js';
import { runScene } from '../../model/runScene.js';
import { resolveWall, syncRoom } from '../../model/room.js';
import { wallSideView } from '../../model/wallSides.js';
import { normalizeElevationDocument } from '../../store/persistence.js';
import RunGroup from '../RunGroup.jsx';

vi.mock('react', async (original) => ({ ...await original(),
  useMemo: (callback) => callback(), useState: (initial) => [initial, vi.fn()],
  useRef: (current) => ({ current }), useId: () => 'floor-bases', useEffect: vi.fn(),
}));
vi.mock('react-konva', () => ({
  Group: 'group', Label: 'label', Line: 'line', Rect: 'rect', Shape: 'shape', Tag: 'tag', Text: 'text',
}));
const load = (name) => JSON.parse(readFileSync(new URL(`../../model/__tests__/fixtures/${name}.json`, import.meta.url), 'utf8'));
const document = normalizeElevationDocument(load('golden'));
const settings = { ...document.settings, sectionProfiles: load('sectionProfiles').profiles };
const template = document.rooms[0].walls[0].runs.find(({ cabinetTypeId }) => cabinetTypeId === CABINET_TYPE_IDS.BASE);

const cell = (row, node) => ({ col: 0, row, colSpan: 1, rowSpan: 1, node });
const auto = (id) => ({ id, size: null, sizeMode: 'auto' });
// These band anchors describe bare cabinet sides, without automatic inside end panels (IE1).
const bareCabinet = (id, width) => ({ id, kind: 'cabinet', width,
  insideEnds: { left: 'none', right: 'none' } });

function desk({ panels = true, topVoid = false } = {}) {
  const opening = { id: 'opening', kind: 'void' };
  const drawer = { id: 'drawer', kind: 'cabinet' };
  const middle = {
    id: 'middle', cols: [auto('middle:col')],
    rows: [{ id: 'top', size: 4, sizeMode: 'manual' }, auto('bottom')],
    cells: [cell(0, topVoid ? opening : drawer), cell(1, topVoid ? drawer : opening)],
  };
  return buildRun({
    ...structuredClone(template), id: 'R', heightMode: 'manual', autoCount: false, anchors: {}, cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width: 60,
    z: 4, height: 24, depth: 24,
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    items: [
      { id: 'left', kind: 'cabinet', width: 18 },
      ...(panels ? [{ id: 'left-panel', kind: 'panel', width: 0.75 }] : []),
      { id: 'middle', kind: 'cabinet', width: panels ? 22.5 : 24, grid: middle },
      ...(panels ? [{ id: 'right-panel', kind: 'panel', width: 0.75 }] : []),
      { id: 'right', kind: 'cabinet', width: null },
    ],
  });
}


function setup({ run = desk(), furniture = false, profile = null, neighbours = [], length = 120, wallStops = false } = {}) {
  const stored = buildRoom(structuredClone(document.rooms[0]));
  stored.profile = { ...stored.profile, baseKind: furniture ? 'furniture_base' : 'toe_kick',
    furnitureBaseProfileId: profile, furnitureBaseProud: 0.8125 };
  stored.wallOrder = ['A'];
  stored.walls = [buildWall({ ...stored.walls[0], id: 'A', x1: 0, y1: 0, x2: length, y2: 0,
    connections: { start: null, end: null }, openings: [], joints: [], flipped: false,
    endPanels: { start: null, end: null }, runs: [run, ...neighbours] })];
  if (wallStops) connectWallStops(stored, stored.walls[0]);
  const room = syncRoom(stored, settings);
  const wall = resolveWall(room, room.walls[0], run.wallSide ?? 'front');
  const resolved = wall.runs.find(({ id }) => id === 'R');
  const scene = runScene(room, wall, resolved, settings);
  return { room, wall, run: resolved, settings, scene,
    bands: runBands(room, wall, resolved, settings, scene),
    parts: bandParts(room, room.walls[0], wall.side, settings),
    groups: furnitureBaseGroups(room, settings) };
}
const spans = (bands) => bands.map(({ x, width }) => [x, x + width]);
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const transform = { scale: 4, offsetX: 10, offsetY: 20, wallHeight: 108 };

describe('SPEC-50.11 step 511 floor base segments', () => {
  it('splits the desk toe kick back from the side-panel faces and numbers both parts (anchor 1)', () => {
    const { bands, parts } = setup();
    expect(spans(bands.toeKicks)).toEqual([[0.25, 17.75], [42.25, 59.75]]);
    expect(bands.furnitureBases).toEqual([]);
    expect(parts.filter(({ kind }) => kind === 'toe_kick').map(({ id }) => id))
      .toEqual(['R:toe_kick', 'R:toe_kick:2']);
  });

  it('retains one full band under an opening with baseUnder (anchor 2)', () => {
    const run = desk();
    run.grid = setGridCellBaseUnder(run.grid, 'opening', true);
    expect(spans(setup({ run }).bands.toeKicks)).toEqual([[0.25, 59.75]]);
    const furniture = setup({ run, furniture: true });
    expect(spans(furniture.bands.furnitureBases)).toEqual([[-0.8125, 60.8125]]);
    expect(furniture.groups).toHaveLength(1);
  });

  it('sets toe kicks back from the cabinets without panels (anchor 3)', () => {
    expect(spans(setup({ run: desk({ panels: false }) }).bands.toeKicks))
      .toEqual([[0.25, 17.75], [42.25, 59.75]]);
  });

  it('returns furniture bases past panel faces with separate groups and badges (anchor 4)', () => {
    const { bands, parts, groups, room, wall } = setup({ furniture: true });
    expect(spans(bands.furnitureBases)).toEqual([[-0.8125, 19.5625], [40.4375, 60.8125]]);
    expect(parts.filter(({ kind }) => kind === 'furniture_base').map(({ id }) => id))
      .toEqual(['R:furniture_base', 'R:furniture_base:2']);
    expect(groups.map(({ key, orderedWidth }) => ({ key, orderedWidth }))).toEqual([
      { key: 'furniture_base:R', orderedWidth: 20.375 },
      { key: 'furniture_base:R:2', orderedWidth: 20.375 },
    ]);
    const numbers = partNumbers(room, settings);
    const badges = wallMoldingBadges(room, wall, settings, numbers.byKey)
      .filter(({ molding }) => molding === 'furniture_base');
    expect(badges.map(({ key, x, width }) => ({ key, x, width }))).toEqual([
      { key: 'furniture_base:R', x: -0.8125, width: 20.375 },
      { key: 'furniture_base:R:2', x: 40.4375, width: 20.375 },
    ]);
    expect(badges.map(({ number }) => number)).toEqual(groups.map(({ key }) => numbers.byKey.get(key)));
    expect(new Set(badges.map(({ number }) => number)).size).toBe(2);
  });

  it('returns furniture bases past cabinet sides without panels (anchor 5)', () => {
    expect(spans(setup({ run: desk({ panels: false }), furniture: true }).bands.furnitureBases))
      .toEqual([[-0.8125, 18.8125], [41.1875, 60.8125]]);
  });

  it('splits back-panel knee spaces, ignores upper voids, and omits bases for a full floor opening', () => {
    const run = desk();
    run.grid = setGridPanelType(setGridCellKind(run.grid, 'opening', 'panel'), 'opening', 'back', 0.75);
    expect(spans(setup({ run }).bands.toeKicks)).toEqual([[0.25, 17.75], [42.25, 59.75]]);
    expect(spans(setup({ run: desk({ topVoid: true }) }).bands.toeKicks)).toEqual([[0.25, 59.75]]);
    run.grid = gridFromItems('R', [{ id: 'all', kind: 'void', width: null }]);
    expect(setup({ run }).bands.toeKicks).toEqual([]);
    const furniture = setup({ run, furniture: true });
    expect(furniture.bands.furnitureBases).toEqual([]);
    expect(furniture.groups).toEqual([]);
  });

  it('leaves a single segment at edge openings and scribes only the surviving outer end', () => {
    for (const leading of [true, false]) {
      const run = desk();
      run.anchors = { left: true, right: true };
      run.grid = gridFromItems('R', leading ? [
        { id: 'open', kind: 'void', width: 24 }, bareCabinet('box', null),
      ] : [
        bareCabinet('box', 36), { id: 'open', kind: 'void', width: null },
      ]);
      expect(spans(setup({ run, length: 60, wallStops: true }).bands.toeKicks)).toEqual(leading ? [[24.25, 60]] : [[0, 35.75]]);
      const furniture = setup({ run, furniture: true, length: 60, wallStops: true });
      expect(spans(furniture.bands.furnitureBases)).toEqual(leading ? [[23.1875, 60]] : [[0, 36.8125]]);
      expect(furniture.groups).toHaveLength(1);
      expect(furniture.groups[0]).toMatchObject({ key: 'furniture_base:R', width: 36.8125, orderedWidth: 37.3125 });
    }
  });

  it('numbers three segments in x order and merges consecutive openings without a phantom band', () => {
    const run = desk();
    run.grid = gridFromItems('R', [
      bareCabinet('a', 10), { id: 'b', kind: 'void', width: 10 },
      bareCabinet('c', 20), { id: 'd', kind: 'void', width: 10 },
      bareCabinet('e', null),
    ]);
    const result = setup({ run, furniture: true });
    expect(spans(result.bands.furnitureBases)).toEqual([
      [-0.8125, 10.8125], [19.1875, 40.8125], [49.1875, 60.8125],
    ]);
    expect(result.groups.map(({ key }) => key))
      .toEqual(['furniture_base:R', 'furniture_base:R:2', 'furniture_base:R:3']);
    expect(result.parts.filter(({ kind }) => kind === 'furniture_base').map(({ id }) => id))
      .toEqual(['R:furniture_base', 'R:furniture_base:2', 'R:furniture_base:3']);
    run.grid = gridFromItems('R', [
      bareCabinet('a', 18), { id: 'b', kind: 'void', width: 12 },
      { id: 'c', kind: 'void', width: 12 }, bareCabinet('d', null),
    ]);
    expect(spans(setup({ run }).bands.toeKicks)).toEqual([[0.25, 17.75], [42.25, 59.75]]);
  });

  it('links each segment only to the neighbouring run at its outer end', () => {
    const neighbour = (id, x) => ({ ...desk({ panels: false }), id, x, width: 12,
      grid: gridFromItems(id, [{ id: `${id}:box`, kind: 'cabinet', width: null }]) });
    const result = setup({ run: desk({ panels: false }), furniture: true,
      neighbours: [neighbour('L', -12), neighbour('N', 60)] });
    expect(result.groups.map(({ key, runIds }) => ({ key, runIds }))).toEqual([
      { key: 'furniture_base:L', runIds: ['L', 'R'] },
      { key: 'furniture_base:R:2', runIds: ['R', 'N'] },
    ]);
    expect(result.groups.map(({ steps }) => [steps[0].x1, steps[0].x2]))
      .toEqual([[-12.8125, 18.8125], [41.1875, 72.8125]]);
  });

  it('maps split back-face groups and places their badges on the matching segments', () => {
    const run = { ...desk(), wallSide: 'back', x: 20 };
    const { room, wall, bands, groups } = setup({ run, furniture: true });
    expect(groups.map(({ steps }) => [steps[0].x1, steps[0].x2]))
      .toEqual([[80.4375, 100.8125], [39.1875, 59.5625]]);
    const badges = wallMoldingBadges(room, wall, settings, partNumbers(room, settings).byKey);
    expect(spans(badges.filter(({ molding }) => molding === 'furniture_base')))
      .toEqual(spans(bands.furnitureBases));
    expect(wallMoldingBadges(room, wallSideView(room.walls[0], 'back'), settings,
      partNumbers(room, settings).byKey)).toEqual(badges);
  });

  it('places cutouts independently on both profiled segments and rejects a cross-opening cutout', () => {
    const run = desk();
    run.baseCutouts = [
      { id: 'kl', from: 'left', to: 'left' }, { id: 'kr', from: 'right', to: 'right' },
      { id: 'cross', from: 'left', to: 'right' },
    ];
    const result = setup({ run, furniture: true, profile: 'fb4' });
    const base = runBase(result.room, result.wall, result.run, settings, result.scene);
    expect(base.cutouts.map(({ id, x0, x1 }) => ({ id, x0, x1 }))).toEqual([
      { id: 'kl', x0: 3, x1: 15 }, { id: 'kr', x0: 45, x1: 57 },
    ]);
    expect(base.warnings).toEqual([{ code: 'base-cutout-orphaned', cutoutId: 'cross' }]);
    expect(result.bands.furnitureBases.map(({ outline }) => outline.slice(0, 6))).toEqual([
      [[-0.8125, 0, 0], [3, 0, 0], [3, 1.5, 0], [15, 1.5, 0], [15, 0, 0], [19.5625, 0, 0]],
      [[40.4375, 0, 0], [45, 0, 0], [45, 1.5, 0], [57, 1.5, 0], [57, 0, 0], [60.8125, 0, 0]],
    ]);
  });

  it('draws both toe kicks and both profiled furniture bands, including their returned lines', () => {
    const toe = setup();
    const toeNodes = nodes(RunGroup.type({ ...toe, transform }));
    expect(toeNodes.filter(({ type, props }) => type === Rect && props.fill === '#111827')
      .map(({ props: { x, width } }) => [x, width])).toEqual([[11, 70], [179, 70]]);
    const furniture = setup({ furniture: true, profile: 'fb4' });
    expect(furniture.bands.furnitureBases.map(({ outline }) => outline)).toEqual([
      [[-0.8125, 0, 0], [19.5625, 0, 0], [19.5625, 3.6875, 0],
        [19.25, 4, 0], [-0.5, 4, 0], [-0.8125, 3.6875, 0]],
      [[40.4375, 0, 0], [60.8125, 0, 0], [60.8125, 3.6875, 0],
        [60.5, 4, 0], [40.75, 4, 0], [40.4375, 3.6875, 0]],
    ]);
    const furnitureNodes = nodes(RunGroup.type({ ...furniture, transform }));
    expect(furnitureNodes.filter(({ type, props }) => type === Shape && props.stroke === '#cbd5e1')).toHaveLength(2);
    expect(furnitureNodes.filter(({ type, props }) => type === Line && props.stroke === '#cbd5e1')
      .map(({ props }) => props.points)).toEqual([
      [6.75, 437.25, 88.25, 437.25], [171.75, 437.25, 253.25, 437.25],
    ]);
  });
});
