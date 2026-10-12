import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import elevationReducer, { setRunTopOverhang } from '../elevationSlice.js';
import {
  ELEVATION_STORAGE_KEY, isElevationDocument, loadElevationDocument,
  normalizeElevationDocument, toElevationDocument,
} from '../persistence.js';

const golden = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/golden.json', import.meta.url), 'utf8'));
const savedDocument = () => normalizeElevationDocument(structuredClone(golden));
const currentRun = (state) => state.rooms[0].walls[0].runs[0];
afterEach(() => { delete globalThis.window; });

describe('SPEC-50.9 step 501 top overhang data', () => {
  it('drops invalid sides and empty objects on load and save, preserving valid zeroes (anchor 4)', () => {
    const saved = savedDocument();
    currentRun(saved).topOverhang = { front: -1, back: 'x', right: 2 };
    expect(isElevationDocument(saved)).toBe(false);
    globalThis.window = { localStorage: {
      getItem: (key) => key === ELEVATION_STORAGE_KEY ? JSON.stringify(saved) : null,
    } };
    expect(currentRun(loadElevationDocument()).topOverhang).toEqual({ right: 2 });
    for (const value of [-1, Infinity, -Infinity, NaN, '2', null, undefined]) {
      currentRun(saved).topOverhang = { front: value, back: 0, right: 2, unknown: 3 };
      expect(isElevationDocument(saved)).toBe(false);
      const normalized = normalizeElevationDocument(saved);
      expect(currentRun(normalized).topOverhang).toEqual({ back: 0, right: 2 });
      expect(isElevationDocument(normalized)).toBe(true);
      const serialized = JSON.parse(JSON.stringify(toElevationDocument(saved)));
      expect(currentRun(serialized).topOverhang).toEqual({ back: 0, right: 2 });
      expect(toElevationDocument(normalizeElevationDocument(serialized))).toEqual(serialized);
    }
    for (const topOverhang of [{}, { front: -1 }, null, [], '2', 2]) {
      currentRun(saved).topOverhang = topOverhang;
      expect(isElevationDocument(saved)).toBe(false);
      expect(currentRun(normalizeElevationDocument(saved))).not.toHaveProperty('topOverhang');
      expect(currentRun(toElevationDocument(saved))).not.toHaveProperty('topOverhang');
    }
    currentRun(saved).topOverhang = { front: 0, back: 2, left: 12, right: 0.5 };
    expect(isElevationDocument(saved)).toBe(true);
    expect(currentRun(normalizeElevationDocument(toElevationDocument(saved))).topOverhang)
      .toEqual(currentRun(saved).topOverhang);
  });

  it('sets and clears one side, rejects invalid edits, and removes the final empty object', () => {
    let state = savedDocument();
    const target = { roomId: state.rooms[0].id, wallId: state.rooms[0].walls[0].id, runId: currentRun(state).id };
    expect(currentRun(state)).not.toHaveProperty('topOverhang');
    for (const [side, value] of Object.entries({ front: 0, back: 2, left: 12, right: 0.5 })) {
      state = elevationReducer(state, setRunTopOverhang({ ...target, side, value }));
    }
    expect(currentRun(state).topOverhang).toEqual({ front: 0, back: 2, left: 12, right: 0.5 });
    for (const value of [-1, Infinity, -Infinity, NaN, '2', undefined]) {
      expect(elevationReducer(state, setRunTopOverhang({ ...target, side: 'front', value }))).toEqual(state);
    }
    for (const patch of [{ side: 'unknown', value: 2 }, { side: 'unknown', value: null },
      { runId: 'missing', side: 'front', value: 2 }]) {
      expect(elevationReducer(state, setRunTopOverhang({ ...target, ...patch }))).toEqual(state);
    }
    state = elevationReducer(state, setRunTopOverhang({ ...target, side: 'front', value: null }));
    expect(currentRun(state).topOverhang).toEqual({ back: 2, left: 12, right: 0.5 });
    for (const side of ['back', 'left', 'right']) {
      state = elevationReducer(state, setRunTopOverhang({ ...target, side, value: null }));
    }
    expect(currentRun(state)).not.toHaveProperty('topOverhang');
    expect(elevationReducer(state, setRunTopOverhang({ ...target, side: 'front', value: null }))).toEqual(state);
    expect(isElevationDocument(toElevationDocument(state))).toBe(true);
  });
});
