import { describe, expect, it } from 'vitest';
import elevationReducer, { setCabinetSlide, setFaceDrawerBox } from '../elevationSlice.js';
import { ELEVATION_SCHEMA_VERSION, isElevationDocument, normalizeElevationDocument, toElevationDocument } from '../persistence.js';
import { gridFromItems, gridLeaves } from '../../model/grid.js';
import { auto, currentRun, run, stateWithRun } from './helpers/sliceFixtures.js';

const at = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1' };
const face = () => ({ direction: 'vertical', size: null, children: [
  { type: 'drawer_front', size: null }, { type: 'door', size: null },
] });
const base = () => {
  const state = stateWithRun(run({ autoCount: false, items: [
    { ...auto('c1'), face: face() }, auto('c2'),
    { id: 'p1', kind: 'panel', width: 1 }, { id: 'f1', kind: 'filler', width: 3 },
  ] }));
  state.schemaVersion = ELEVATION_SCHEMA_VERSION;
  currentRun(state).grid.cells[1].node = gridFromItems('nested', [
    { ...auto('c2'), face: face() }, auto('c3'),
  ]);
  return state;
};
const leaves = (state) => gridLeaves(currentRun(state).grid);

describe('IN5 step a drawer box pick storage', () => {
  it('accepts cabinet slide ids and round-trips picks, rejecting invalid ids and other cells (anchor 4)', () => {
    const state = elevationReducer(base(), setCabinetSlide({ ...at, itemIds: ['c1', 'c2'], slideId: 'accuride-3832' }));
    const picked = elevationReducer(state, setFaceDrawerBox({ ...at, itemId: 'c2', path: 'r.0', patch: { height: 3.625, depth: 18, slideId: 'gone' } }));
    const document = normalizeElevationDocument(toElevationDocument(picked));
    expect(isElevationDocument(document)).toBe(true);
    const loaded = JSON.parse(JSON.stringify(document));
    expect(leaves(loaded)[1]).toMatchObject({ drawerSlideId: 'accuride-3832', face: {
      children: [{ type: 'drawer_front', size: null, drawerBox: { height: 3.625, depth: 18, slideId: 'gone' } }, { type: 'door', size: null }],
    } });
    for (const drawerSlideId of ['', null, 3]) {
      const invalid = structuredClone(document);
      leaves(invalid)[0].drawerSlideId = drawerSlideId;
      expect(isElevationDocument(invalid)).toBe(false);
    }
    for (const id of ['p1', 'f1']) {
      const invalid = structuredClone(document);
      leaves(invalid).find((leaf) => leaf.id === id).drawerSlideId = 'accuride-3832';
      expect(isElevationDocument(invalid)).toBe(false);
    }
    const invalid = structuredClone(document);
    leaves(invalid)[1].face.children[0].drawerBox.width = 16;
    expect(isElevationDocument(invalid)).toBe(false);
  });

  it('sets and clears slide picks on root and nested cabinets and respects room locks (anchor 4)', () => {
    const state = base();
    const payload = { ...at, itemIds: ['c1', 'c2', 'p1', 'f1'], slideId: 'accuride-3832' };
    const picked = elevationReducer(state, setCabinetSlide(payload));
    expect(leaves(picked).map(({ id, drawerSlideId }) => [id, drawerSlideId]))
      .toEqual([['c1', 'accuride-3832'], ['c2', 'accuride-3832'], ['c3', undefined], ['p1', undefined], ['f1', undefined]]);
    const cleared = elevationReducer(picked, setCabinetSlide({ ...payload, itemIds: ['c2'], slideId: null }));
    expect(leaves(cleared)[1]).not.toHaveProperty('drawerSlideId');
    expect(leaves(cleared)[0].drawerSlideId).toBe('accuride-3832');
    expect(leaves(state)[0]).not.toHaveProperty('drawerSlideId');
    for (const slideId of [undefined, '', 4]) expect(elevationReducer(state, setCabinetSlide({ ...payload, slideId }))).toBe(state);
    for (const patch of [{ runId: 'gone' }, { wallId: 'gone' }, { roomId: 'gone' }, { itemIds: ['p1', 'f1'] }, { itemIds: [] }]) {
      expect(elevationReducer(state, setCabinetSlide({ ...payload, ...patch }))).toBe(state);
    }
    for (const locked of [{ ...state, cloud: { room: { readOnly: true } } }, { ...state, source: 'version' }]) {
      expect(elevationReducer(locked, setCabinetSlide(payload))).toBe(locked);
    }
  });

  it('patches only the selected cabinet face at any grid depth and respects room locks', () => {
    const state = base();
    const payload = { ...at, itemId: 'c2', path: 'r.0', patch: { height: 3.625 } };
    const sized = elevationReducer(state, setFaceDrawerBox(payload));
    const picked = elevationReducer(sized, setFaceDrawerBox({ ...payload, patch: { slideId: 'accuride-3832', depth: 18 } }));
    expect(leaves(picked)[1].face.children[0].drawerBox).toEqual({ height: 3.625, depth: 18, slideId: 'accuride-3832' });
    expect(leaves(picked)[0].face).toEqual(face());
    expect(leaves(state)[1].face).toEqual(face());
    const cleared = elevationReducer(picked, setFaceDrawerBox({ ...payload, patch: { height: null, depth: null, slideId: null } }));
    expect(leaves(cleared)[1].face.children[0]).not.toHaveProperty('drawerBox');
    const root = elevationReducer(state, setFaceDrawerBox({ ...payload, itemId: 'c1' }));
    expect(leaves(root)[0].face.children[0].drawerBox).toEqual({ height: 3.625 });
    for (const patch of [{ itemId: 'p1' }, { itemId: 'c3' }, { itemId: 'gone' }, { runId: 'gone' },
      { wallId: 'gone' }, { roomId: 'gone' }, { path: 'r.1' }, { path: 'r' }, { path: 'r.8' }, { patch: { height: 0 } }]) {
      expect(elevationReducer(state, setFaceDrawerBox({ ...payload, ...patch }))).toBe(state);
    }
    expect(elevationReducer(sized, setFaceDrawerBox(payload))).toBe(sized);
    for (const locked of [{ ...state, cloud: { room: { readOnly: true } } }, { ...state, source: 'version' }]) {
      expect(elevationReducer(locked, setFaceDrawerBox(payload))).toBe(locked);
    }
  });
});
