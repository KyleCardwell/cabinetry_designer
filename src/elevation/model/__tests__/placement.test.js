import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { placeAttachedRuns } from '../linePlacement.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { wallLength } from '../geometry.js';
import { splitOptionsForRun as fromIndex } from '../index.js';
import {
  PLACEMENT_STAGES, pinGrowth, placeRoom, returnPinTargets, runEdges, soffitSpans,
  splitOptionsForRun,
} from '../placement.js';
import { splitOptionsForRun as fromRoom } from '../room.js';
import { syncRoom } from '../roomSync.js';
import { endCornerAnglesForRun, endMinWidthsForRun } from '../runAnchors.js';
import { pinTargetsForRun } from '../runPins.js';
import { wallViewForRun } from '../wallSides.js';

const ids = vi.hoisted(() => ({ count: 0 }));
vi.mock('uuid', () => ({ v4: () => `layout-golden-${(ids.count += 1)}` }));
beforeEach(() => { ids.count = 0; });

const room10 = JSON.parse(readFileSync(new URL('./fixtures/room10.json', import.meta.url), 'utf8'));
const room10b = JSON.parse(readFileSync(new URL('./fixtures/room10b.json', import.meta.url), 'utf8'));
const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const WALL2 = '2641fa48-3200-43ec-8a5f-ab8e6a514e00';
const BASE10 = 'c25ad9b4-36e3-481c-a2b4-5b5d4857ec8e';
const LEFT_TALL10 = '5d290bf9-897b-4304-9dbe-ccef6ab1c311';
const RIGHT_TALL10 = '92ae9b3d-25e1-47e0-8cb0-23c603ad4c4e';
const PINNED10 = '91b8a850-4450-4bc3-afbe-f9c1888a5d62';
const PINNED10B = '5ea196ac-4752-42e5-bf15-608401c0c086';
const JOINT10 = 'ca73860b-9fe0-425d-90db-e27ca534cb1b';

const wallOf = (state) => state.walls.find(({ id }) => id === WALL2);
const runOf = (state, id) => wallOf(state).runs.find((run) => run.id === id);

function applyStage(stage, state) {
  const before = structuredClone(state);
  const result = stage(state, settings);
  expect(state).toEqual(before);
  return result;
}

describe('LL1 placement stages', () => {
  it('exports the frozen stage order and each stage function', () => {
    expect(PLACEMENT_STAGES.map(({ name }) => name))
      .toEqual(['return-pins', 'soffits', 'run-edges', 'line-runs', 'pin-growth']);
    expect(Object.isFrozen(PLACEMENT_STAGES)).toBe(true);
    expect(PLACEMENT_STAGES.map(({ run }) => run))
      .toEqual([returnPinTargets, soffitSpans, runEdges, placeAttachedRuns, pinGrowth]);
  });

  it('resolves run edges without growing a free end for an edited pin', () => {
    const state = syncRoom(structuredClone(room10b), settings);
    const run = runOf(state, LEFT_TALL10);
    expect(run).toMatchObject({ x: 0, width: 72 + 13 / 16 });
    // LL4: the column is on line L1 (72 from the left) instead of a pin.
    const line = state.walls.find(({ id }) => id === WALL2).lines[0];
    expect(line.value).toBe(72);
    line.value = 90;
    expect(runOf(applyStage(runEdges, state), LEFT_TALL10))
      .toMatchObject({ x: 0, width: 72 + 13 / 16 });
  });

  it('grows the free end to the edited pin after resolving edges', () => {
    const state = syncRoom(structuredClone(room10b), settings);
    state.walls.find(({ id }) => id === WALL2).lines[0].value = 90;
    const result = applyStage(pinGrowth, applyStage(runEdges, state));
    expect(runOf(result, LEFT_TALL10)).toMatchObject({
      x: 0, width: 90 + 13 / 16,
    });
    // LL4.1 b: the column ends the run on its line, so it isn't a segment target and keeps no remembered width.
    expect(runOf(result, LEFT_TALL10)._pinWidths).toBeUndefined();
    expect(applyStage(placeRoom, state)).toEqual(result);
  });

  it('resolves a moved joint before its neighbouring run edges', () => {
    const state = syncRoom(structuredClone(room10), settings);
    expect(runOf(state, LEFT_TALL10)).toMatchObject({ x: 0, width: 41 });
    expect(runOf(state, BASE10)).toMatchObject({ x: 41, width: 88 });
    const rightTall = structuredClone(runOf(state, RIGHT_TALL10));
    const joint = wallOf(state).joints.find(({ id }) => id === JOINT10);
    expect(joint.x).toBe(41);
    joint.x = 44;
    const result = applyStage(runEdges, state);
    expect(runOf(result, LEFT_TALL10)).toMatchObject({ x: 0, width: 44 });
    expect(runOf(result, BASE10)).toMatchObject({ x: 44, width: 85 });
    expect(runOf(result, RIGHT_TALL10)).toEqual(rightTall);
  });

  it('keeps the joint-bounded base span while recording the pinned column width', () => {
    const state = syncRoom(structuredClone(room10), settings);
    wallOf(state).joints.find(({ id }) => id === JOINT10).x = 44;
    const result = applyStage(pinGrowth, applyStage(runEdges, state));
    expect(runOf(result, BASE10)).toMatchObject({ x: 44, width: 85 });
    expect(runOf(result, BASE10)._pinWidths).toEqual({ [PINNED10]: 29 + 5 / 16 });
  });

  it('clears stale return targets without mutating the input room', () => {
    const state = syncRoom(structuredClone(room10b), settings);
    runOf(state, LEFT_TALL10)._returnPins = { [PINNED10B]: { target: 999 } };
    expect(runOf(applyStage(returnPinTargets, state), LEFT_TALL10))
      .not.toHaveProperty('_returnPins');
  });

  it('resolves edited soffit anchors without mutating the input room', () => {
    const state = syncRoom(structuredClone(room10), settings);
    wallOf(state).soffits = [{
      id: 'soffit', wallSide: 'front', x: 0, width: 20,
      anchors: { left: { to: 'end', offset: 12 }, right: false },
    }];
    expect(wallOf(applyStage(soffitSpans, state)).soffits[0])
      .toMatchObject({ x: 12, width: 20 });
  });
});

describe('LL1 splitOptionsForRun', () => {
  it('matches the room-aware options and line labels for the synced Room 10 Wall 2 base', () => {
    expect(fromRoom).toBe(splitOptionsForRun);
    expect(fromIndex).toBe(splitOptionsForRun);
    const state = syncRoom(structuredClone(room10), settings);
    const wall = wallOf(state);
    const run = runOf(state, BASE10);
    const before = structuredClone(state);
    expect(splitOptionsForRun(state, wall, run, settings)).toEqual({
      endMinWidths: endMinWidthsForRun(state, wall, run, settings),
      endCornerAngles: endCornerAnglesForRun(state, wall, run),
      pinTargets: pinTargetsForRun(run, wall, wallLength(wall), settings),
      lineLabels: { [PINNED10]: 'L1' },
    });
    expect(state).toEqual(before);
  });

  it('targets the W1 centre at 92 through line L1 with a zero offset', () => {
    const state = syncRoom(structuredClone(room10), settings);
    const run = runOf(state, BASE10);
    const column = run.grid.cols.find(({ id }) => id === `${PINNED10}:col`);
    expect(column.attach.offset).toBe(0);
    expect(splitOptionsForRun(state, wallOf(state), run, settings).pinTargets[PINNED10])
      .toBe(92); // W1 centre: 74 + 36 / 2.
  });

  it('returns the same options when passed the run wall view', () => {
    const state = syncRoom(structuredClone(room10), settings);
    const wall = wallOf(state);
    const run = runOf(state, BASE10);
    expect(splitOptionsForRun(state, wallViewForRun(wall, run), run, settings))
      .toEqual(splitOptionsForRun(state, wall, run, settings));
  });
});
