import { describe, expect, it } from 'vitest';
import { auto, room, run, wall } from '../../../test/builders.js';
import { isLegList, legPreset } from '../../model/index.js';
import { syncRoom } from '../../model/room.js';
import elevationReducer, { addRunLegs, updateRunLeg, removeRunLeg, createInitialElevationState } from '../elevationSlice.js';
import { isElevationDocument, toElevationDocument, normalizeElevationDocument } from '../persistence.js';

const leg = { id: 'lg-1', shapeId: 'missing-shape', from: 'left', x: 0, yFrom: 'front', y: 0, height: 'full' };
const target = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1' };
const initial = createInitialElevationState();
initial.rooms = [syncRoom(room({ walls: [wall({ runs: [run({ width: 36, items: [auto('a')] })] })] }), initial.settings)];
initial.activeRoomId = target.roomId;
initial.activeWallId = target.wallId;
const currentRun = (state) => state.rooms[0].walls[0].runs[0];

describe('SH7 step a stored legs', () => {
  it('SH7.1: persists support and room picks and drops their keys when cleared', () => {
    let state = elevationReducer(initial, addRunLegs({ ...target, legs: [leg] }));
    for (const sitsOn of ['base', 'countertop']) {
      state = elevationReducer(state, updateRunLeg({ ...target, legId: leg.id,
        changes: { takesRoom: false, sitsOn } }));
      expect(currentRun(state).legs[0]).toEqual({ ...leg, takesRoom: false, sitsOn });
      const saved = toElevationDocument(state);
      expect(isElevationDocument(saved)).toBe(true);
      expect(toElevationDocument(normalizeElevationDocument(saved))).toEqual(saved);
      for (const changes of [{ takesRoom: true }, { sitsOn: 'floor' }]) {
        expect(elevationReducer(state, updateRunLeg({ ...target, legId: leg.id, changes }))).toEqual(state);
      }
      state = elevationReducer(state, updateRunLeg({ ...target, legId: leg.id,
        changes: { takesRoom: undefined, sitsOn: undefined } }));
      expect(currentRun(state).legs[0]).toEqual(leg);
      expect(currentRun(state).legs[0]).not.toHaveProperty('takesRoom');
      expect(currentRun(state).legs[0]).not.toHaveProperty('sitsOn');
    }
  });

  it('validates non-empty leg lists and round-trips picks, allowing missing/archived/other shapes and signed offsets', () => {
    const saved = structuredClone(toElevationDocument(initial));
    expect(isElevationDocument(saved)).toBe(true);
    currentRun(saved).legs = [leg, { ...leg, id: 'lg-2', from: 'right', x: -2, yFrom: 'back', y: -1,
      height: 4, mirror: true, mirrorDepth: true }, { ...leg, id: 'lg-3', height: 'feet' }];
    expect(isLegList(currentRun(saved).legs)).toBe(true);
    expect(isElevationDocument(saved)).toBe(true);
    expect(toElevationDocument(normalizeElevationDocument(saved))).toEqual(saved);
    const invalid = [[], [leg, leg], [null], [[]], new Array(1), null, {}, 'legs',
      ...['id', 'shapeId'].flatMap((key) => ['', null, 1, undefined].map((value) => [{ ...leg, [key]: value }])),
      ...['x', 'y'].flatMap((key) => [Infinity, -Infinity, NaN, '1', null, undefined].map((value) => [{ ...leg, [key]: value }])),
      ...[0, -1, Infinity, NaN, '', null, 'Full', undefined].map((height) => [{ ...leg, height }]),
      ...['mirror', 'mirrorDepth'].flatMap((key) => [false, null, 1].map((value) => [{ ...leg, [key]: value }])),
      [{ ...leg, from: 'front' }], [{ ...leg, yFrom: 'left' }],
    ];
    for (const legs of invalid) {
      expect(isLegList(legs)).toBe(false);
      currentRun(saved).legs = legs;
      expect(isElevationDocument(saved)).toBe(false);
    }
    currentRun(saved).legs = [leg];
    saved.rooms[0].walls.push(wall({ id: 'wall-2', runs: [run({ id: 'run-2', legs: [leg] })] }));
    saved.rooms[0].wallOrder.push('wall-2');
    expect(isElevationDocument(saved)).toBe(false);
    saved.rooms[0].walls[1].runs[0].legs[0] = { ...leg, id: 'other' };
    expect(isElevationDocument(saved)).toBe(true);
    // Separate rooms may preserve every document id, as Copy room does.
    saved.rooms.push({ ...structuredClone(saved.rooms[0]), id: 'room-2' });
    expect(isElevationDocument(saved)).toBe(true);
  });

  it('appends presets, updates a leg, clears mirror, and drops legs when the last placement is removed', () => {
    let state = elevationReducer(initial, addRunLegs({ ...target, legs: [leg] }));
    expect(currentRun(initial)).not.toHaveProperty('legs');
    let id = 1;
    const picks = legPreset('front', { shapeId: 'another-shape', height: 'feet' }, () => `lg-${++id}`);
    state = elevationReducer(state, addRunLegs({ ...target, legs: picks }));
    expect(currentRun(state).legs).toEqual([leg, ...picks]);
    state = elevationReducer(state, updateRunLeg({ ...target, legId: leg.id,
      changes: { x: -2, y: -0.75, from: 'right', yFrom: 'back', height: 30, mirror: true, mirrorDepth: true } }));
    expect(currentRun(state).legs[0]).toEqual({ ...leg, x: -2, y: -0.75, from: 'right', yFrom: 'back', height: 30, mirror: true, mirrorDepth: true });
    state = elevationReducer(state, updateRunLeg({ ...target, legId: leg.id, changes: { mirror: undefined, mirrorDepth: undefined } }));
    expect(currentRun(state).legs[0]).not.toHaveProperty('mirror');
    expect(currentRun(state).legs[0]).not.toHaveProperty('mirrorDepth');
    const saved = toElevationDocument(state);
    expect(isElevationDocument(saved)).toBe(true);
    expect(toElevationDocument(normalizeElevationDocument(saved))).toEqual(saved);
    for (const { id: legId } of [leg, ...picks]) state = elevationReducer(state, removeRunLeg({ ...target, legId }));
    expect(currentRun(state)).not.toHaveProperty('legs');
    expect(currentRun(state)).toEqual(currentRun(initial));
  });

  it('rejects invalid additions and edits atomically, including room-wide collisions, and ignores missing targets', () => {
    let state = elevationReducer(initial, addRunLegs({ ...target, legs: [leg, { ...leg, id: 'lg-2' }] }));
    state = { ...state, rooms: [{ ...state.rooms[0], walls: [...state.rooms[0].walls,
      wall({ id: 'wall-2', runs: [run({ id: 'run-2', legs: [{ ...leg, id: 'other-run-leg' }] })] })] }] };
    const actions = [
      addRunLegs({ ...target, legs: [] }), addRunLegs({ ...target, legs: [leg] }),
      addRunLegs({ ...target, legs: [{ ...leg, id: 'new' }, { ...leg, id: 'bad', x: NaN }] }),
      addRunLegs({ ...target, legs: [{ ...leg, id: 'other-run-leg' }] }),
      ...[{ x: Infinity }, { y: NaN }, { height: 0 }, { shapeId: '' }, { mirror: false }, { mirrorDepth: false },
        { id: 'lg-2' }, { id: 'other-run-leg' }].map((changes) => updateRunLeg({ ...target, legId: leg.id, changes })),
      updateRunLeg({ ...target, legId: 'missing', changes: { x: 2 } }),
      removeRunLeg({ ...target, legId: 'missing' }),
      addRunLegs({ ...target, runId: 'missing', legs: [leg] }),
      updateRunLeg({ ...target, runId: 'missing', legId: leg.id, changes: { x: 2 } }),
      removeRunLeg({ ...target, runId: 'missing', legId: leg.id }),
    ];
    for (const action of actions) expect(elevationReducer(state, action)).toEqual(state);
    for (const action of [updateRunLeg({ ...target, legId: leg.id, changes: { x: 2 } }), removeRunLeg({ ...target, legId: leg.id })]) {
      expect(elevationReducer(initial, action)).toEqual(initial);
    }
  });
});

it('SH7.5 rejects hand-leg fills in additions, edits and saved documents', () => {
  const state = elevationReducer(initial, addRunLegs({ ...target, legs: [leg] }));
  for (const fill of [{ type: 'panel' }, { type: 'filler' }, { type: 'panel', returns: 'both', returnDepth: 4 }]) {
    expect(elevationReducer(initial, addRunLegs({ ...target, legs: [{ ...leg, fill }] }))).toEqual(initial);
    expect(elevationReducer(state, updateRunLeg({ ...target, legId: leg.id, changes: { fill } }))).toEqual(state);
    const saved = structuredClone(toElevationDocument(state));
    currentRun(saved).legs[0].fill = fill;
    expect(isElevationDocument(saved)).toBe(false);
  }
});

it('SH7.2 defaults missing leg panel settings and preserves explicit values through persistence', () => {
  const saved = structuredClone(toElevationDocument(initial));
  const defaults = { legPanelReveal: 0.25, legPanelTopClearance: 0, legPanelBottomClearance: 0, legPanelReturnDepth: 4.5 };
  for (const key of Object.keys(defaults)) delete saved.settings[key];
  const normalized = normalizeElevationDocument(saved);
  expect(normalized.settings).toMatchObject(defaults);
  expect(isElevationDocument(normalized)).toBe(true);
  for (const key of Object.keys(defaults)) expect(saved.settings).not.toHaveProperty(key);
  const explicit = { legPanelReveal: 0, legPanelTopClearance: 0.5, legPanelBottomClearance: 1, legPanelReturnDepth: 6 };
  Object.assign(normalized.settings, explicit);
  expect(toElevationDocument(normalizeElevationDocument(normalized)).settings).toMatchObject(explicit);
});

it('SH7.5 round-trips end panel returns and room settings', () => {
  const saved = structuredClone(toElevationDocument(initial));
  const spec = { shapeId: 'missing-shape', height: 'full', x: 0, y: 0 };
  const endLegs = { left: { legs: 'both', front: spec, back: spec, fit: 'between',
    panel: { returns: 'both', returnDepth: 4 } } };
  currentRun(saved).endLegs = endLegs;
  currentRun(saved).ends.left = { type: 'none', width: null };
  saved.rooms[0].settingsOverrides = { legPanelReturnDepth: 5 };
  const normalized = normalizeElevationDocument(saved);
  expect(isElevationDocument(normalized)).toBe(true);
  const loaded = toElevationDocument(createInitialElevationState(normalized));
  expect(currentRun(loaded).endLegs).toEqual(endLegs);
  expect(loaded.rooms[0].settingsOverrides).toEqual({ legPanelReturnDepth: 5 });
});
