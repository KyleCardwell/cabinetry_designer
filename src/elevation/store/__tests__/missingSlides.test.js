import { expect, it } from 'vitest';
import { missingSlides, missingSlideName, roomSlideUses } from '../../model/slides.js';
import { gridFromItems, gridLeaves } from '../../model/grid.js';
import elevationReducer, { moveMissingSlide } from '../elevationSlice.js';
import { auto, run, stateWithRun } from './helpers/sliceFixtures.js';

const U = '0192a1b2-c3d4-7e5f-8a9b-00000000a001';
function base() {
  const state = stateWithRun(run({ autoCount: false, items: [
    { ...auto('c1'), drawerSlideId: U, face: { type: 'drawer_front', size: null, drawerBox: { slideId: U } } },
  ] }));
  state.layers = { project: { id: 1, values: { drawerSlideId: 'x' } }, phase: null };
  return state;
}
const missing = (state) => missingSlides(state.rooms[0], state.settings, state.layers);

it('IN6 a anchor 4: counts pull-out slide picks and moves or clears them, preserving other picks', () => {
  const state = base();
  const cabinet = gridLeaves(state.rooms[0].walls[0].runs[0].grid)[0];
  delete cabinet.drawerSlideId;
  cabinet.face = { direction: 'vertical', size: null, children: [
    { type: 'door', size: null, action: 'pullout', drawerBox: { slideId: U } },
    { direction: 'horizontal', size: null, children: [
      { type: 'door', size: null, action: 'pullout', drawerBox: { slideId: U, height: 12.125, depth: 21 } },
      { type: 'drawer_front', size: null, drawerBox: { slideId: U, accessories: [{ accessoryId: 'a' }] } },
    ] },
  ] };
  expect(missingSlides(state.rooms[0], state.settings)).toEqual([{ slideId: U, roomUses: 3, setIn: [] }]);
  const action = { roomId: 'room-1', slideId: U, reassignTo: 'accuride-3832' };
  const moved = elevationReducer(state, moveMissingSlide(action));
  expect([...roomSlideUses(moved.rooms[0])].map(({ node, key }) => node[key]))
    .toEqual(['accuride-3832', 'accuride-3832', 'accuride-3832']);
  const removed = elevationReducer(state, moveMissingSlide({ ...action, reassignTo: null }));
  const face = gridLeaves(removed.rooms[0].walls[0].runs[0].grid)[0].face;
  expect(face.children[0]).not.toHaveProperty('drawerBox');
  expect(face.children[1].children[0].drawerBox).toEqual({ height: 12.125, depth: 21 });
  expect(face.children[1].children[1].drawerBox).toEqual({ accessories: [{ accessoryId: 'a' }] });
  expect(missingSlides(removed.rooms[0], removed.settings)).toEqual([]);
  expect(cabinet.face.children[0].drawerBox).toEqual({ slideId: U });
});

it('IN5 e anchor 1: counts cabinet and box picks plus layer settings, sorted by id', () => {
  // Kyle confirmed id sorting: UUIDs precede x (the spec table lists these in reverse).
  expect(missing(base())).toEqual([
    { slideId: U, roomUses: 2, setIn: [] },
    { slideId: 'x', roomUses: 0, setIn: ['project'] },
  ]);
  expect(missingSlideName('x')).toBe('Slide `x`');
  expect(missingSlideName(U.toUpperCase())).toBe('An archived slide');
  expect(missingSlides({}, base().settings)).toEqual([]);
});

it('IN5 e anchor 2: moves both picks or clears them, removing an empty drawerBox', () => {
  const state = base();
  const action = { roomId: 'room-1', slideId: U, reassignTo: 'accuride-3832' };
  const moved = elevationReducer(state, moveMissingSlide(action));
  const cabinet = gridLeaves(moved.rooms[0].walls[0].runs[0].grid)[0];
  expect([cabinet.drawerSlideId, cabinet.face.drawerBox.slideId]).toEqual(['accuride-3832', 'accuride-3832']);
  const cleared = elevationReducer(state, moveMissingSlide({ ...action, reassignTo: null }));
  const empty = gridLeaves(cleared.rooms[0].walls[0].runs[0].grid)[0];
  expect(empty).not.toHaveProperty('drawerSlideId');
  expect(empty.face).not.toHaveProperty('drawerBox');
  expect(missing(cleared)).toEqual([{ slideId: 'x', roomUses: 0, setIn: ['project'] }]);
  for (const payload of [{ roomId: 'absent' }, { slideId: 'blum-562h' }, { slideId: 'unused' }, { reassignTo: 'absent' }]) {
    expect(elevationReducer(state, moveMissingSlide({ ...action, ...payload }))).toBe(state);
  }
});

it('finds nested and back-side picks, clears only room uses, preserves dimensions and locks read-only edits', () => {
  const state = base();
  const room = state.rooms[0];
  room.settingsOverrides = { drawerSlideId: U, roundTo: 0.25 };
  const front = room.walls[0].runs[0];
  const cabinet = gridLeaves(front.grid)[0];
  cabinet.face = { direction: 'vertical', size: null, children: [cabinet.face,
    { direction: 'horizontal', size: null, children: [
      { type: 'drawer_front', size: null, drawerBox: { slideId: U, height: 3, depth: 18 } },
      { type: 'drawer_front', size: null, drawerBox: { slideId: 'accuride-3832' } },
    ] },
  ] };
  front.grid = gridFromItems('outer', [{ ...auto('nested'), grid: front.grid }]);
  room.walls[0].runs.push(run({ id: 'back', wallSide: 'back', autoCount: false, items: [
    { ...auto('back-c'), drawerSlideId: U },
  ] }));
  state.settings.drawerSlideId = U;
  state.layers.project.values.drawerSlideId = U;
  state.layers.phase = { values: { drawerSlideId: U } };
  state.rooms.push({ ...structuredClone(room), id: 'other' });
  expect(missing(state)).toEqual([{ slideId: U, roomUses: 5, setIn: ['team', 'project', 'phase'] }]);
  const action = moveMissingSlide({ roomId: room.id, slideId: U, reassignTo: null });
  const cleared = elevationReducer(state, action);
  expect([...roomSlideUses(cleared.rooms[0])].map(({ node, key }) => node[key])).toEqual(['accuride-3832']);
  const nested = gridLeaves(cleared.rooms[0].walls[0].runs[0].grid)[0];
  expect(nested.face.children[1].children[0].drawerBox).toEqual({ height: 3, depth: 18 });
  expect(cleared.rooms[0].settingsOverrides).toEqual({ roundTo: 0.25 });
  expect(cleared.settings).toBe(state.settings);
  expect(cleared.layers).toBe(state.layers);
  expect(cleared.rooms[1]).toBe(state.rooms[1]);
  for (const locked of [{ ...state, cloud: { room: { readOnly: true } } }, { ...state, source: 'version' }]) {
    expect(elevationReducer(locked, action)).toBe(locked);
  }
});
