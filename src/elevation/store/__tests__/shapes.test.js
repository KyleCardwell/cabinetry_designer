import { expect, it } from 'vitest';
import { newShape } from '../../model/libraryShapes.js';
import elevationReducer, {
  addShape, updateShape, setShapeArchived, deleteShape, createInitialElevationState,
} from '../elevationSlice.js';

it('SH2 anchor 1: bumps geometry versions for box, views and stretch, and keeps metadata versions', () => {
  const shape = newShape([], 'shape-1');
  const initial = elevationReducer(createInitialElevationState(), addShape({ shape }));
  expect(initial.settings.shapes[0]).toEqual(shape);
  expect(initial.settings.shapes[0].views).not.toBe(shape.views);
  for (const [patch, version] of [
    [{ name: 'Rod' }, 1],
    [{ box: { ...shape.box, w: 30 } }, 2],
    [{ views: { front: { ...shape.views.front, points: { ...shape.views.front.points, p1: [1, 0] } } } }, 2],
    [{ notes: 'Painted' }, 1],
    [{ kind: 'accessory' }, 1],
    [{ archived: true }, 1],
    [{ stretch: { x: [[3, 9]] } }, 2],
  ]) {
    const updated = elevationReducer(initial, updateShape({ shape: { ...shape, ...patch, version: 99 } }));
    expect(updated.settings.shapes[0]).toEqual({ ...shape, ...patch, version });
  }
  const changed = elevationReducer(initial, updateShape({ shape: { ...shape, box: { ...shape.box, w: 30 } } }));
  const renamed = elevationReducer(changed, updateShape({ shape: { ...changed.settings.shapes[0], name: 'Renamed' } }));
  expect(renamed.settings.shapes[0].version).toBe(2);
});

it('SH2 validates shape lists, guards duplicate live names on restore, removes locally and locks issued versions', () => {
  const shape = { ...newShape([], 'shape-1'), name: 'Rod' };
  let state = elevationReducer(createInitialElevationState(), addShape({ shape }));
  for (const invalid of [null, { ...shape, id: 'shape-2', name: 'ROD' }, { ...shape, box: {} }, shape]) {
    expect(elevationReducer(state, addShape({ shape: invalid }))).toBe(state);
  }
  expect(elevationReducer(state, updateShape({ shape: { ...shape, box: {} } }))).toBe(state);
  expect(elevationReducer(state, updateShape({ shape: { ...shape, id: 'unknown' } }))).toBe(state);
  state = elevationReducer(state, addShape({ shape: { ...shape, id: 'shape-2', name: 'ROD', archived: true } }));
  expect(elevationReducer(state, setShapeArchived({ shapeId: 'shape-2', archived: false }))).toBe(state);
  expect(elevationReducer(state, setShapeArchived({ shapeId: shape.id, archived: 'yes' }))).toBe(state);
  state = elevationReducer(state, setShapeArchived({ shapeId: shape.id, archived: true }));
  expect(state.settings.shapes[0]).toMatchObject({ archived: true, version: 1 });
  state = elevationReducer(state, setShapeArchived({ shapeId: 'shape-2', archived: false }));
  expect(state.settings.shapes[1].archived).toBe(false);
  const frozen = { ...state, source: 'version' };
  for (const action of [addShape({ shape: newShape([], 'shape-3') }), updateShape({ shape: { ...shape, name: 'Changed' } }),
    setShapeArchived({ shapeId: 'shape-2', archived: true }), deleteShape({ shapeId: shape.id })]) {
    expect(elevationReducer(frozen, action)).toBe(frozen);
  }
  expect(elevationReducer(state, deleteShape({ shapeId: shape.id })).settings.shapes.map(({ id }) => id)).toEqual(['shape-2']);
});
