import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import elevationReducer, {
  addTopSegment, updateTopSegment, removeTopSegment,
} from '../elevationSlice.js';
import {
  ELEVATION_STORAGE_KEY, isElevationDocument, isTopSegmentList, loadElevationDocument,
  normalizeElevationDocument, toElevationDocument,
} from '../persistence.js';

const golden = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/golden.json', import.meta.url), 'utf8'));
const savedDocument = () => normalizeElevationDocument(structuredClone(golden));
const currentRun = (state) => state.rooms[0].walls[0].runs[0];
const segment = { id: 's', from: 'B', to: 'B', kind: 'wood', drop: 2, mode: 'box' };
const targetFor = (state) => ({
  roomId: state.rooms[0].id, wallId: state.rooms[0].walls[0].id, runId: currentRun(state).id,
});
const load = (saved) => {
  globalThis.window = { localStorage: {
    getItem: (key) => key === ELEVATION_STORAGE_KEY ? JSON.stringify(saved) : null,
  } };
  return loadElevationDocument();
};

afterEach(() => { delete globalThis.window; });

describe('ST4 step a top segment data', () => {
  it('accepts the wood box segment (anchor 1) and round-trips both kinds and modes', () => {
    const saved = savedDocument();
    expect(isElevationDocument(saved)).toBe(true);
    expect(currentRun(saved)).not.toHaveProperty('topSegments');
    expect(isTopSegmentList([])).toBe(true);
    expect(isTopSegmentList([segment])).toBe(true);
    currentRun(saved).topSegments = [segment,
      { ...segment, id: 'stone', from: 'C', to: 'A', kind: 'stone', drop: 1, mode: 'overlap' }];
    expect(isElevationDocument(saved)).toBe(true);
    expect(load(toElevationDocument(saved))).toEqual(saved);
    const otherRun = { ...structuredClone(currentRun(saved)), id: 'other-run' };
    saved.rooms[0].walls[0].runs.push(otherRun);
    expect(isElevationDocument(saved)).toBe(true); // Segment ids are unique per run.
  });

  it('rejects zero drop, tile, unknown mode and duplicate ids (anchor 2), plus malformed segments', () => {
    const invalid = [
      [{ ...segment, drop: 0 }], [{ ...segment, kind: 'tile' }],
      [{ ...segment, mode: 'x' }], [segment, segment],
      ...[-1, Infinity, -Infinity, NaN, '2', null, undefined].map((drop) => [{ ...segment, drop }]),
      ...['id', 'from', 'to', 'kind', 'mode'].flatMap((key) => (
        ['', null, 1, undefined].map((value) => [{ ...segment, [key]: value }])
      )),
      [null], [[]], ['segment'], new Array(1), null, {}, 'segments',
    ];
    for (const topSegments of invalid) {
      const saved = savedDocument();
      currentRun(saved).topSegments = topSegments;
      expect(isTopSegmentList(topSegments)).toBe(false);
      expect(isElevationDocument(saved)).toBe(false);
      expect(load(saved)).toBeNull();
    }
  });

  it('keeps missing column references on load and save (anchor 3)', () => {
    const saved = savedDocument();
    currentRun(saved).topSegments = [{ ...segment, from: 'gone' }];
    expect(isElevationDocument(saved)).toBe(true);
    const loaded = load(saved);
    expect(currentRun(loaded).topSegments).toEqual([{ ...segment, from: 'gone' }]);
    expect(currentRun(load(toElevationDocument(loaded))).topSegments).toEqual(currentRun(saved).topSegments);
  });

  it('adds, updates drop to 3, then removes the segment (anchor 4) without changing model data', () => {
    const initial = savedDocument();
    const target = targetFor(initial);
    let state = elevationReducer(initial, addTopSegment({ ...target, segment }));
    expect(currentRun(initial)).not.toHaveProperty('topSegments');
    expect(currentRun(state).topSegments).toEqual([segment]);
    state = elevationReducer(state, updateTopSegment({ ...target, segmentId: 's', changes: { drop: 3 } }));
    expect(currentRun(state).topSegments).toEqual([{ ...segment, drop: 3 }]);
    expect(currentRun(load(toElevationDocument(state))).topSegments).toEqual([{ ...segment, drop: 3 }]);
    state = elevationReducer(state, removeTopSegment({ ...target, segmentId: 's' }));
    expect(currentRun(state).topSegments).toEqual([]);
    const { topSegments, ...unchangedRun } = currentRun(state);
    expect(topSegments).toEqual([]);
    expect(unchangedRun).toEqual(currentRun(initial));
  });

  it('rejects invalid additions and edits, and leaves missing targets unchanged', () => {
    const initial = savedDocument();
    const target = targetFor(initial);
    let state = elevationReducer(initial, addTopSegment({ ...target, segment }));
    state = elevationReducer(state, addTopSegment({ ...target, segment: { ...segment, id: 's2' } }));
    for (const changes of [{ drop: 0 }, { drop: Infinity }, { kind: 'tile' }, { mode: 'x' }, { id: 's2' }, { to: undefined }]) {
      expect(elevationReducer(state, updateTopSegment({ ...target, segmentId: 's', changes }))).toEqual(state);
    }
    for (const action of [
      addTopSegment({ ...target, segment }),
      addTopSegment({ ...target, segment: { ...segment, id: 'bad', drop: 0 } }),
      addTopSegment({ ...target, runId: 'missing', segment }),
      updateTopSegment({ ...target, runId: 'missing', segmentId: 's', changes: { drop: 3 } }),
      removeTopSegment({ ...target, runId: 'missing', segmentId: 's' }),
      updateTopSegment({ ...target, segmentId: 'missing', changes: { drop: 3 } }),
      removeTopSegment({ ...target, segmentId: 'missing' }),
    ]) expect(elevationReducer(state, action)).toEqual(state);
    for (const action of [
      updateTopSegment({ ...target, segmentId: 's', changes: { drop: 3 } }),
      removeTopSegment({ ...target, segmentId: 's' }),
    ]) expect(elevationReducer(initial, action)).toEqual(initial);
  });
});
