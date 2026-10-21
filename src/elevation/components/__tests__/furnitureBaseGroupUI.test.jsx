import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatch } from 'react-redux';
import { Rect, Text } from 'react-konva';
import { CABINET_TYPE_IDS } from '../../model/constants.js';
import { gridFromItems } from '../../model/grid.js';
import { partNumbers, wallMoldingBadges } from '../../model/partNumbers.js';
import { resolveWall, syncRoom } from '../../model/room.js';
import { splitRun } from '../../model/splitRun.js';
import elevationReducer, { setPartNumberOverride } from '../../store/elevationSlice.js';
import { normalizeElevationDocument } from '../../store/persistence.js';
import { stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import MoldingBadges from '../MoldingBadges.jsx';
import PartNumberLayer from '../PartNumberLayer.jsx';
import PartNumberField from '../properties/PartNumberField.jsx';
import RunProperties, { RunFurnitureBaseSection } from '../properties/RunProperties.jsx';

vi.mock('react', async (original) => ({ ...await original(), useMemo: (callback) => callback() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn() }));
vi.mock('react-konva', () => ({
  Group: 'group', Rect: 'rect', Text: 'text', Label: 'label', Tag: 'tag',
}));

const load = (name) => JSON.parse(readFileSync(new URL(`../../model/__tests__/fixtures/${name}.json`, import.meta.url), 'utf8'));
const document = normalizeElevationDocument(load('golden'));
const defaults = { ...document.settings, sectionProfiles: load('sectionProfiles').profiles };
const template = document.rooms[0].walls[0].runs.find(({ cabinetTypeId }) => cabinetTypeId === CABINET_TYPE_IDS.BASE);
const makeRun = (id, props = {}) => ({ ...structuredClone(template), id, x: 30, width: 36,
  grid: gridFromItems(id, [{ id: `${id}:box`, kind: 'cabinet', width: null }]),
  depth: 24, anchors: {}, overrides: {},
  ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } }, ...props });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : text(tree?.props?.children ?? []);
const transform = { scale: 4, offsetX: 10, offsetY: 20, wallHeight: 108 };
let stored;
let settings;
const setup = (runs, wallProps = {}) => {
  stored = structuredClone(document.rooms[0]);
  stored.profile = { ...stored.profile, baseKind: 'furniture_base', furnitureBaseProfileId: 'fb4' };
  stored.partNumberOverrides = {};
  stored.walls = [{ ...stored.walls[0], id: 'A', x1: 0, y1: 0, x2: 120, y2: 0,
    flipped: false, connections: { start: null, end: null }, endPanels: { start: null, end: null },
    openings: [], joints: [], runs, ...wallProps }];
  stored.wallOrder = ['A'];
};
const stepped = () => setup([
  makeRun('B', { x: 30, depth: 21 }),
  makeRun('T', { x: 0, width: 30, cabinetTypeId: CABINET_TYPE_IDS.TALL, anchors: { left: true } }),
]);
const props = (id = 'T', side = 'front') => {
  const room = syncRoom(stored, settings);
  const wall = resolveWall(room, room.walls[0], side);
  return { room, wall, run: wall.runs.find((run) => run.id === id), settings };
};
const render = (id, side) => RunFurnitureBaseSection(props(id, side));
const numberField = (tree) => nodes(tree).find(({ type }) => type === PartNumberField);
const input = (tree) => nodes(PartNumberField(numberField(tree).props)).find(({ type }) => type === 'input');

beforeEach(() => {
  settings = structuredClone(defaults);
  useDispatch.mockReturnValue(vi.fn());
  stepped();
});

describe('Step 497 furniture base group properties', () => {
  it('shows the specified ordered dimensions and shared part on either touching run', () => {
    const number = partNumbers(props().room, settings).byKey.get('furniture_base:T');
    for (const id of ['T', 'B']) {
      const tree = render(id);
      expect(tree.props.title).toBe(`Furniture base FB #${number}`);
      expect(text(tree)).toContain('67 5/16 × 4 1/2 × 25 11/16 in');
      expect(text(tree)).toContain('(+1/2 scribe bottom)');
      expect(text(tree)).toContain('(+1/2 scribe left/right) at square stops');
      expect(text(tree)).toContain(id === 'T' ? 'Run 1 · with: Run 2' : 'Run 2 · with: Run 1');
      expect(numberField(tree).props.partKey).toBe('furniture_base:T');
    }
    const p = props();
    const panel = RunProperties({ ...p, layout: splitRun(p.run, settings), showMessage: vi.fn() });
    const parent = panel.props.children('heights');
    expect(nodes(parent).find(({ type }) => type === RunFurnitureBaseSection).props).toMatchObject(p);
  });

  it('lists all companions across island faces, using the same number from the back', () => {
    setup([makeRun('back', { x: 40, width: 40, wallSide: 'back', depth: 12 }),
      makeRun('right', { x: 40, width: 40 }), makeRun('left', { x: 0, width: 40 })], { thickness: 0 });
    expect(text(render('left'))).toContain('with: Run 2, Run 3 (island back)');
    expect(text(render('back', 'back'))).toContain('Run 3 (island back) · with: Run 1, Run 2');
    expect(numberField(render('back', 'back')).props.partKey).toBe('furniture_base:left');
    stored.walls[0].thickness = 4.5;
    expect(text(render('left'))).toContain('Run 3 (wall back)');
  });

  it('omits group info for toe kicks and raised runs and keeps separate bases separate', () => {
    stored.profile.baseKind = 'toe_kick';
    expect(render()).toBeNull();
    stored.profile.baseKind = 'furniture_base';
    stored.walls[0].runs.find(({ id }) => id === 'T').overrides.toeKickHeight = 6;
    expect(text(render())).toContain('Run 1');
    expect(text(render())).not.toContain('with:');
    expect(numberField(render('B')).props.partKey).toBe('furniture_base:B');
    setup([makeRun('raised', { cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54 })]);
    expect(render('raised')).toBeNull();
  });

  it('shows scribe only where included and follows custom and zero scribe settings', () => {
    setup([makeRun('free')]);
    expect(text(render('free'))).toContain('(+1/2 scribe bottom)');
    expect(text(render('free'))).not.toContain('scribe left/right');
    setup([makeRun('square', { x: 0, width: 120, anchors: { left: true, right: true } })]);
    expect(text(render('square'))).toContain('121 × 4 1/2 × 25 11/16 in');
    expect(text(render('square'))).toContain('(+1/2 scribe left/right)');
    stepped();
    settings.furnitureBaseScribe = 0.75;
    expect(text(render())).toContain('67 9/16 × 4 3/4 × 25 11/16 in');
    expect(text(render())).toContain('(+3/4 scribe bottom)');
    expect(text(render())).toContain('(+3/4 scribe left/right) at square stops');
    settings.furnitureBaseScribe = 0;
    expect(text(render())).toContain('66 13/16 × 4 × 25 11/16 in');
    expect(text(render())).not.toContain('scribe');
  });

  it('edits, clears, and flags duplicate shared part numbers through the existing field', () => {
    const dispatch = vi.fn((action) => {
      stored = elevationReducer({ ...stateWithRun(), settings, rooms: [stored], activeRoomId: stored.id }, action).rooms[0];
    });
    useDispatch.mockReturnValue(dispatch);
    const auto = input(render()).props.placeholder;
    input(render('B')).props.onChange({ target: { value: '99' } });
    expect(dispatch).toHaveBeenLastCalledWith(setPartNumberOverride({ roomId: stored.id, key: 'furniture_base:T', number: 99 }));
    expect(render().props.title).toBe('Furniture base FB #99');
    expect(input(render()).props.value).toBe(99);
    expect(input(render('B')).props.value).toBe(99);
    const other = partNumbers(props().room, settings).parts.find(({ key }) => key !== 'furniture_base:T');
    dispatch(setPartNumberOverride({ roomId: stored.id, key: other.key, number: 99 }));
    expect(numberField(render()).props.duplicate).toBe(true);
    dispatch(setPartNumberOverride({ roomId: stored.id, key: other.key, number: null }));
    input(render()).props.onChange({ target: { value: '' } });
    expect(input(render('B')).props).toMatchObject({ value: '', placeholder: auto });
  });
});

describe('Step 497 furniture base canvas badges', () => {
  it('renders FB on the first base band of each face through the molding badge layer', () => {
    setup([makeRun('right', { x: 40, width: 40 }), makeRun('left', { x: 0, width: 40 }),
      makeRun('back', { x: 40, width: 40, wallSide: 'back' })], { thickness: 0 });
    stored.partNumberOverrides['furniture_base:left'] = 99;
    for (const [id, side] of [['left', 'front'], ['back', 'back']]) {
      const p = props(id, side);
      const numbers = partNumbers(p.room, settings);
      const layer = PartNumberLayer({ ...p, partNumbers: numbers, transform });
      const molding = nodes(layer).find(({ type }) => type === MoldingBadges);
      const tree = nodes(MoldingBadges(molding.props));
      const badge = wallMoldingBadges(p.room, p.wall, settings, numbers.byKey).find(({ label }) => label === 'FB');
      const label = tree.find(({ type, props }) => type === Text && props.text === 'FB 99');
      expect(tree.filter(({ type, props }) => type === Text && props.text.startsWith('FB '))).toHaveLength(1);
      expect(label.props).toMatchObject({ listening: false, align: 'center', verticalAlign: 'middle' });
      expect(label.props.x + label.props.width / 2).toBeCloseTo(10 + (badge.x + badge.width / 2) * 4);
      expect(label.props.y + label.props.height / 2).toBeCloseTo(20 + (108 - badge.height / 2) * 4);
      expect(tree.find(({ type, props }) => type === Rect && props.x === label.props.x && props.y === label.props.y).props)
        .toMatchObject({ fill: '#1e293b', stroke: '#cbd5e1', listening: false });
    }
    expect(MoldingBadges({ ...props('left'), transform, partNumbers: null })).toBeNull();
  });
});
