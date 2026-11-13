import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import elevationReducer, { toggleRunWaterfall, setRunWaterfallBaseToLeg } from '../elevationSlice.js';
import {
  ELEVATION_STORAGE_KEY, isElevationDocument, loadElevationDocument,
  normalizeElevationDocument, toElevationDocument,
} from '../persistence.js';

const golden = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/golden.json', import.meta.url), 'utf8'));
const savedDocument = () => normalizeElevationDocument(structuredClone(golden));
const currentRun = (state) => state.rooms[0].walls[0].runs[0];
afterEach(() => { delete globalThis.window; });

describe('SPEC-50.10 step 504 waterfall data', () => {
  it('validates and normalizes only side objects and true baseToLeg picks on load and save', () => {
    const saved = savedDocument();
    expect(currentRun(saved)).not.toHaveProperty('waterfall');
    for (const waterfall of [{ left: {} }, { right: { baseToLeg: true } },
      { left: {}, right: { baseToLeg: true } }]) {
      currentRun(saved).waterfall = waterfall;
      expect(isElevationDocument(saved)).toBe(true);
      expect(currentRun(normalizeElevationDocument(toElevationDocument(saved))).waterfall).toEqual(waterfall);
    }
    currentRun(saved).waterfall = { left: { baseToLeg: true, unknown: true }, right: { baseToLeg: false }, front: {} };
    expect(isElevationDocument(saved)).toBe(false);
    globalThis.window = { localStorage: {
      getItem: (key) => key === ELEVATION_STORAGE_KEY ? JSON.stringify(saved) : null,
    } };
    expect(currentRun(loadElevationDocument()).waterfall).toEqual({ left: { baseToLeg: true }, right: {} });
    for (const value of [false, null, undefined, 'true', 1, [], {}]) {
      currentRun(saved).waterfall = { left: { baseToLeg: value }, right: {} };
      expect(isElevationDocument(saved)).toBe(false);
      const normalized = normalizeElevationDocument(saved);
      expect(currentRun(normalized).waterfall).toEqual({ left: {}, right: {} });
      expect(isElevationDocument(normalized)).toBe(true);
      expect(currentRun(toElevationDocument(saved)).waterfall).toEqual({ left: {}, right: {} });
    }
    for (const waterfall of [{}, null, [], 'left', true, { left: null }, { left: true },
      { left: [] }, { left: 1 }, { left: 'on' }, { front: {} }]) {
      currentRun(saved).waterfall = waterfall;
      expect(isElevationDocument(saved)).toBe(false);
      expect(currentRun(normalizeElevationDocument(saved))).not.toHaveProperty('waterfall');
      expect(currentRun(toElevationDocument(saved))).not.toHaveProperty('waterfall');
    }
    currentRun(saved).waterfall = { left: null, right: { baseToLeg: true } };
    expect(currentRun(normalizeElevationDocument(saved)).waterfall).toEqual({ right: { baseToLeg: true } });
  });

  it('toggles sides independently, sets and clears baseToLeg, and removes the final empty waterfall', () => {
    let state = savedDocument();
    const target = { roomId: state.rooms[0].id, wallId: state.rooms[0].walls[0].id, runId: currentRun(state).id };
    expect(elevationReducer(state, setRunWaterfallBaseToLeg({ ...target, side: 'left', value: true }))).toEqual(state);
    state = elevationReducer(state, toggleRunWaterfall({ ...target, side: 'left' }));
    state = elevationReducer(state, toggleRunWaterfall({ ...target, side: 'right' }));
    expect(currentRun(state).waterfall).toEqual({ left: {}, right: {} });
    state = elevationReducer(state, setRunWaterfallBaseToLeg({ ...target, side: 'left', value: true }));
    expect(currentRun(state).waterfall).toEqual({ left: { baseToLeg: true }, right: {} });
    for (const value of [null, undefined, 'true', 1]) {
      expect(elevationReducer(state, setRunWaterfallBaseToLeg({ ...target, side: 'left', value }))).toEqual(state);
    }
    for (const patch of [{ side: 'front' }, { runId: 'missing', side: 'left' }]) {
      expect(elevationReducer(state, toggleRunWaterfall({ ...target, ...patch }))).toEqual(state);
      expect(elevationReducer(state, setRunWaterfallBaseToLeg({ ...target, ...patch, value: true }))).toEqual(state);
    }
    state = elevationReducer(state, setRunWaterfallBaseToLeg({ ...target, side: 'left', value: false }));
    expect(currentRun(state).waterfall).toEqual({ left: {}, right: {} });
    state = elevationReducer(state, toggleRunWaterfall({ ...target, side: 'left' }));
    expect(currentRun(state).waterfall).toEqual({ right: {} });
    state = elevationReducer(state, toggleRunWaterfall({ ...target, side: 'right' }));
    expect(currentRun(state)).not.toHaveProperty('waterfall');
    expect(isElevationDocument(toElevationDocument(state))).toBe(true);
  });
});
