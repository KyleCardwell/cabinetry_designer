import { expect, it } from 'vitest';
import { missingAccessories, missingAccessoryName, newAccessory, roomAccessoryUses } from '../../model/accessories.js';
import { gridFromItems, gridLeaves } from '../../model/grid.js';
import elevationReducer, { moveMissingAccessory } from '../elevationSlice.js';
import { auto, run, stateWithRun } from './helpers/sliceFixtures.js';

const S = '0192a1b2-c3d4-7e5f-8a9b-00000000a001';
const base = () => {
  const state = stateWithRun(run({ autoCount: false, items: [{ ...auto('c1'), interior: {
    direction: 'vertical', children: [
      { accessories: [{ accessoryId: 'gone' }, { accessoryId: S, qty: 2 }] },
      { accessories: [{ accessoryId: 'gone' }] },
    ], dividers: [{ kind: 'fixed', at: 12, seam: 'r:0' }],
  } }] }));
  state.settings.accessories = [{ ...newAccessory([], S), name: 'Susan' },
    { ...newAccessory([], 'drawer'), name: 'Drawer insert', attachesTo: 'drawer_box' }];
  return state;
};
const sections = (state) => gridLeaves(state.rooms[0].walls[0].runs[0].grid)[0].interior.children;
const at = { roomId: 'room-1', accessoryId: 'gone', reassignTo: S };

it('IN12b f anchor 1: counts stored places, sorts missing ids, and names archived accessories', () => {
  const state = base();
  expect(missingAccessories(state.rooms[0], state.settings)).toEqual([{ accessoryId: 'gone', place: 'section', roomUses: 2 }]);
  expect([...roomAccessoryUses(state.rooms[0])]).toEqual(sections(state).flatMap((node) =>
    node.accessories.map((item) => ({ node: item, key: 'accessoryId', place: 'section' }))));
  expect(missingAccessoryName('gone')).toBe('Accessory `gone`');
  expect(missingAccessoryName(S.toUpperCase())).toBe('An archived accessory');
  expect(missingAccessories({}, {})).toEqual([]);
  expect(missingAccessories(state.rooms[0], {})).toEqual([
    { accessoryId: S, place: 'section', roomUses: 1 }, { accessoryId: 'gone', place: 'section', roomUses: 2 },
  ]);
  state.settings.accessoryId = 'not-a-setting';
  expect(missingAccessories(state.rooms[0], state.settings)).toEqual([{ accessoryId: 'gone', place: 'section', roomUses: 2 }]);
});

it('IN12b f anchor 2: moves every use, merges quantities in place, and caps them at 20 in nested grids', () => {
  const state = base();
  const moved = elevationReducer(state, moveMissingAccessory(at));
  expect(sections(moved).map(({ accessories }) => accessories)).toEqual([
    [{ accessoryId: S, qty: 3 }], [{ accessoryId: S }],
  ]);
  expect(sections(state)[0].accessories[0]).toEqual({ accessoryId: 'gone' });
  const nested = base();
  sections(nested)[0].accessories[0].qty = 20;
  sections(nested)[0].accessories.reverse();
  const outer = gridFromItems('outer', [auto('placeholder')]);
  outer.cells[0].node = nested.rooms[0].walls[0].runs[0].grid;
  nested.rooms[0].walls[0].runs[0].grid = outer;
  nested.rooms[0].walls[0].runs.push(run({ id: 'back', wallSide: 'back', autoCount: false, items: [
    { ...auto('back-c'), interior: { accessories: [{ accessoryId: 'gone', qty: 2 }] } },
  ] }));
  nested.rooms.push({ ...structuredClone(nested.rooms[0]), id: 'other' });
  expect(missingAccessories(nested.rooms[0], nested.settings)).toEqual([{ accessoryId: 'gone', place: 'section', roomUses: 3 }]);
  const all = elevationReducer(nested, moveMissingAccessory(at));
  expect(sections(all)[0].accessories).toEqual([{ accessoryId: S, qty: 20 }]);
  expect([...roomAccessoryUses(all.rooms[0])].map(({ node }) => node)).toEqual([
    { accessoryId: S, qty: 20 }, { accessoryId: S }, { accessoryId: S, qty: 2 },
  ]);
  expect(all.rooms[1]).toBe(nested.rooms[1]);
  expect(all.settings).toBe(nested.settings);
  for (const patch of [{ roomId: 'absent' }, { accessoryId: S }, { accessoryId: 'unused' },
    { reassignTo: 'unknown' }, { reassignTo: 'drawer' }]) {
    expect(elevationReducer(state, moveMissingAccessory({ ...at, ...patch }))).toBe(state);
  }
  for (const locked of [{ ...state, cloud: { room: { readOnly: true } } }, { ...state, source: 'version' }]) {
    expect(elevationReducer(locked, moveMissingAccessory(at))).toBe(locked);
  }
});

it('IN12b f anchor 3: removes all missing items, prunes an empty accessories key and keeps other section fields', () => {
  const state = base();
  sections(state)[1].shelves = { count: 2 };
  const removed = elevationReducer(state, moveMissingAccessory({ ...at, reassignTo: null }));
  expect(sections(removed)[0].accessories).toEqual([{ accessoryId: S, qty: 2 }]);
  expect(sections(removed)[1]).toEqual({ shelves: { count: 2 } });
  expect(missingAccessories(removed.rooms[0], removed.settings)).toEqual([]);
});


const boxState = () => {
  const state = base();
  const cabinet = gridLeaves(state.rooms[0].walls[0].runs[0].grid)[0];
  cabinet.interior = { accessories: [{ accessoryId: 'gone' }] };
  cabinet.face = { direction: 'vertical', size: null, children: [
    { type: 'drawer_front', size: null, drawerBox: { accessories: [{ accessoryId: 'gone' }, { accessoryId: 'drawer', qty: 2 }] } },
    { direction: 'horizontal', size: null, children: [
      { type: 'drawer_front', size: null, drawerBox: { accessories: [{ accessoryId: 'gone' }] } },
    ] },
  ] };
  const grid = state.rooms[0].walls[0].runs[0].grid;
  state.rooms[0].walls[0].runs[0].grid = gridFromItems('outer', [{ ...auto('nested'), grid }]);
  return state;
};
const boxFaces = (state) => {
  const face = gridLeaves(state.rooms[0].walls[0].runs[0].grid)[0].face;
  return [face.children[0], face.children[1].children[0]];
};
const boxAt = { ...at, place: 'drawer_box', reassignTo: 'drawer' };

it('IN12c c anchor 4: counts missing ids separately by place through nested grids and faces', () => {
  const state = boxState();
  expect(missingAccessories(state.rooms[0], state.settings)).toEqual([
    { accessoryId: 'gone', place: 'section', roomUses: 1 },
    { accessoryId: 'gone', place: 'drawer_box', roomUses: 2 },
  ]);
  expect([...roomAccessoryUses(state.rooms[0])].map(({ key, place }) => ({ key, place }))).toEqual([
    { key: 'accessoryId', place: 'section' },
    ...Array.from({ length: 3 }, () => ({ key: 'accessoryId', place: 'drawer_box' })),
  ]);
});

it('IN12c c anchor 5: moves only box uses, merges quantities, and ignores replacements of another place', () => {
  const state = boxState();
  const moved = elevationReducer(state, moveMissingAccessory(boxAt));
  expect(boxFaces(moved).map(({ drawerBox }) => drawerBox.accessories)).toEqual([
    [{ accessoryId: 'drawer', qty: 3 }], [{ accessoryId: 'drawer' }],
  ]);
  expect(gridLeaves(moved.rooms[0].walls[0].runs[0].grid)[0].interior.accessories).toEqual([{ accessoryId: 'gone' }]);
  for (const patch of [{ reassignTo: S }, { reassignTo: 'unknown' }, { place: 'bad' }]) {
    expect(elevationReducer(state, moveMissingAccessory({ ...boxAt, ...patch }))).toBe(state);
  }
  expect(elevationReducer(moved, moveMissingAccessory({ ...boxAt, reassignTo: S }))).toBe(moved);
  for (const locked of [{ ...state, source: 'version' }, { ...state, cloud: { room: { readOnly: true } } }]) {
    expect(elevationReducer(locked, moveMissingAccessory(boxAt))).toBe(locked);
  }
  const capped = boxState();
  boxFaces(capped)[0].drawerBox.accessories.reverse();
  boxFaces(capped)[0].drawerBox.accessories[0].qty = 20;
  expect(boxFaces(elevationReducer(capped, moveMissingAccessory(boxAt)))[0].drawerBox.accessories)
    .toEqual([{ accessoryId: 'drawer', qty: 20 }]);
});

it('IN12c c anchor 6: removes box items and empty boxes while preserving other picks and sections', () => {
  const state = boxState();
  boxFaces(state)[0].drawerBox.depth = 20;
  const removed = elevationReducer(state, moveMissingAccessory({ ...boxAt, reassignTo: null }));
  expect(boxFaces(removed)[0].drawerBox).toEqual({ depth: 20, accessories: [{ accessoryId: 'drawer', qty: 2 }] });
  expect(boxFaces(removed)[1]).not.toHaveProperty('drawerBox');
  expect(missingAccessories(removed.rooms[0], removed.settings)).toEqual([
    { accessoryId: 'gone', place: 'section', roomUses: 1 },
  ]);
  expect(boxFaces(state)[1].drawerBox).toEqual({ accessories: [{ accessoryId: 'gone' }] });
});
