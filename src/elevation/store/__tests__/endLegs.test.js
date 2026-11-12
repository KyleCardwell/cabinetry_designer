import { describe, expect, it } from 'vitest';
import { E, S, Sf } from '../../model/__tests__/fixtures/legs.js';
import { DEFAULT_DOOR_STYLE } from '../../model/constants.js';
import { endFit, legPresetEnds } from '../../model/endLegs.js';
import { room, run, wall } from '../../../test/builders.js';
import elevationReducer, { applyRunLegPreset, createInitialElevationState, setRunEnd,
  setRunEndLegs, updateRun, updateRunLeg } from '../elevationSlice.js';
import { isElevationDocument, normalizeElevationDocument, toElevationDocument } from '../persistence.js';

const target = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1' };
const R = run({ x: 10, width: 36,
  ends: { left: { type: 'end_panel' }, right: { type: 'end_panel' } } });
const initial = createInitialElevationState({ rooms: [room({ walls: [wall({ runs: [R] })] })],
  activeRoomId: target.roomId, activeWallId: target.wallId });
const currentRun = (state) => state.rooms[0].walls[0].runs[0];
const hand = { ...S, id: 'h1', from: 'left', yFrom: 'front' };

describe('end-leg actions (SH7.5)', () => {
  it('an active between fit replaces the end piece and clearing it restores End panel', () => {
    const endLegs = { ...E, fit: 'between', panel: { returns: 'both' } };
    const state = elevationReducer(initial, setRunEndLegs({ ...target, side: 'left', endLegs }));
    expect(currentRun(state).endLegs).toEqual({ left: endLegs });
    expect(currentRun(state).ends.left).toEqual({ type: 'none', width: null });
    expect(endFit(currentRun(state), 'left')).toBe('between');
    const cleared = elevationReducer(state, setRunEndLegs({ ...target, side: 'left', endLegs: E }));
    expect(currentRun(cleared).endLegs.left).toEqual(E);
    expect(currentRun(cleared).endLegs.left).not.toHaveProperty('fit');
    expect(currentRun(cleared).ends.left).toEqual({ type: 'end_panel', width: null });
    expect(currentRun(initial)).not.toHaveProperty('endLegs');
    const wide = createInitialElevationState({ rooms: [room({
      doorStyles: [{ ...DEFAULT_DOOR_STYLE, id: 'wide', thickness: 2 }],
      walls: [wall({ runs: [{ ...R, ends: { ...R.ends, left: { ...R.ends.left, styleId: 'wide' } } }] })],
    })], activeRoomId: target.roomId, activeWallId: target.wallId });
    expect(currentRun(wide)._endThickness.left).toBe(2);
    const fitted = elevationReducer(wide, setRunEndLegs({ ...target, side: 'left', endLegs }));
    expect(currentRun(fitted)).not.toHaveProperty('_endThickness');
  });

  it('normalizes incompatible fits and panel fields, preserving an untouched end object', () => {
    const previous = currentRun(initial).ends.left;
    const state = elevationReducer(initial, setRunEndLegs({ ...target, side: 'left',
      endLegs: { legs: 'front', front: Sf, fit: 'between', panel: { returns: 'both' } } }));
    expect(currentRun(state).endLegs.left).toEqual({ legs: 'front', front: Sf });
    expect(currentRun(state).ends.left).toBe(previous);
    const back = elevationReducer(initial, setRunEndLegs({ ...target, side: 'left',
      endLegs: { legs: 'back', back: S, fit: 'behind', panel: { invalid: true } } }));
    expect(currentRun(back).endLegs.left).toEqual({ legs: 'back', back: S });
    expect(currentRun(back).ends.left).toBe(previous);
    const behind = elevationReducer(initial, setRunEndLegs({ ...target, side: 'left',
      endLegs: { ...E, fit: 'behind', panel: { invalid: true } } }));
    expect(currentRun(behind).endLegs.left).toEqual({ ...E, fit: 'behind' });
    expect(currentRun(behind).ends.left).toEqual({ type: 'none', width: null });
    const incompatible = elevationReducer(behind, setRunEndLegs({ ...target, side: 'left',
      endLegs: { legs: 'back', back: S, fit: 'between', panel: { returns: 'both' } } }));
    expect(currentRun(incompatible).endLegs.left).toEqual({ legs: 'back', back: S });
    expect(currentRun(incompatible).ends.left).toEqual({ type: 'filler', width: null });
  });

  it('manually picked end pieces clear fit/panel, and Blind removes only its end legs', () => {
    const fitted = elevationReducer(initial, applyRunLegPreset({ ...target,
      ...legPresetEnds('four', { shapeId: 'leg', proud: 0.5, fit: 'panel' }) }));
    const withPanel = elevationReducer(fitted, setRunEndLegs({ ...target, side: 'left',
      endLegs: { ...E, fit: 'between', panel: { returns: 'both' } } }));
    for (const type of ['filler', 'end_panel', 'none']) {
      const state = elevationReducer(withPanel, setRunEnd({ ...target, side: 'left', end: { type, width: null } }));
      expect(currentRun(state).endLegs.left).toEqual(E);
      expect(currentRun(state).ends.left).toEqual({ type, width: null });
      expect(currentRun(state).endLegs.right).toEqual({ ...E, fit: 'between' });
    }
    const plain = elevationReducer(initial, setRunEndLegs({ ...target, side: 'left', endLegs: E }));
    const blind = elevationReducer(plain, setRunEnd({ ...target, side: 'left', end: { type: 'blind', width: null } }));
    expect(currentRun(blind)).not.toHaveProperty('endLegs');
    const both = elevationReducer(withPanel, setRunEnd({ ...target, side: 'left', end: { type: 'blind', width: null } }));
    expect(currentRun(both).endLegs).toEqual({ right: { ...E, fit: 'between' } });
  });

  it('removing a behind fit restores Filler and drops empty end-leg containers', () => {
    const fitted = elevationReducer(initial, setRunEndLegs({ ...target, side: 'left',
      endLegs: { legs: 'front', front: Sf, fit: 'behind' } }));
    expect(currentRun(fitted).ends.left).toEqual({ type: 'none', width: null });
    for (const endLegs of [undefined, {}, { panel: { returns: 'both' } }]) {
      const removed = elevationReducer(fitted, setRunEndLegs({ ...target, side: 'left', endLegs }));
      expect(currentRun(removed)).not.toHaveProperty('endLegs');
      expect(currentRun(removed).ends.left).toEqual({ type: 'filler', width: null });
    }
    const two = elevationReducer(fitted, setRunEndLegs({ ...target, side: 'right', endLegs: E }));
    const one = elevationReducer(two, setRunEndLegs({ ...target, side: 'right' }));
    expect(currentRun(one).endLegs).toEqual(currentRun(fitted).endLegs);
    expect(currentRun(one).ends.right).toBe(currentRun(two).ends.right);
  });

  it('invalid end specs and targets leave the entire state unchanged', () => {
    for (const endLegs of [{ ...E, front: { ...Sf, height: 0 } }, { ...E, back: undefined },
      { ...E, fit: 'unknown' }, { ...E, extra: true }, { legs: 'front', front: Sf, back: S },
      { ...E, fit: 'between', panel: { returns: 'side' } }]) {
      expect(elevationReducer(initial, setRunEndLegs({ ...target, side: 'left', endLegs }))).toBe(initial);
    }
    for (const patch of [{ side: 'middle' }, { roomId: 'gone' }, { wallId: 'gone' }, { runId: 'gone' }]) {
      expect(elevationReducer(initial, setRunEndLegs({ ...target, side: 'left', endLegs: E, ...patch }))).toBe(initial);
      expect(elevationReducer(initial, applyRunLegPreset({ ...target, endLegs: { left: E }, ...patch,
        ...(patch.side ? { endLegs: { middle: E } } : {}) }))).toBe(initial);
    }
  });

  it('applies Four with active panel fits to both ends in one action and round-trips it', () => {
    const preset = legPresetEnds('four', { shapeId: 'leg', proud: 0.5, fit: 'panel' });
    const before = structuredClone(preset);
    const state = elevationReducer(initial, applyRunLegPreset({ ...target, ...preset }));
    expect(currentRun(state).endLegs).toEqual({ left: { ...E, fit: 'between' }, right: { ...E, fit: 'between' } });
    expect(currentRun(state).ends).toEqual({ left: { type: 'none', width: null }, right: { type: 'none', width: null } });
    expect(currentRun(state)).not.toHaveProperty('legs');
    const saved = toElevationDocument(state);
    expect(isElevationDocument(saved)).toBe(true);
    expect(toElevationDocument(normalizeElevationDocument(saved))).toEqual(saved);
    expect(preset).toEqual(before);
  });

  it('replacing preset ends clears old fits and preserves hand legs and unnamed ends', () => {
    const source = { ...initial, rooms: [room({ walls: [wall({ runs: [{ ...R, legs: [hand] }] })] })] };
    const fitted = elevationReducer(source, setRunEndLegs({ ...target, side: 'left', endLegs: { ...E, fit: 'between' } }));
    const replaced = elevationReducer(fitted, applyRunLegPreset({ ...target,
      ...legPresetEnds('four', { shapeId: 'leg', proud: 0.5 }) }));
    expect(currentRun(replaced).endLegs).toEqual({ left: E, right: E });
    expect(currentRun(replaced).ends.left).toEqual({ type: 'end_panel', width: null });
    expect(currentRun(replaced).legs).toEqual([hand]);
    const onlyRight = elevationReducer(fitted, applyRunLegPreset({ ...target,
      ...legPresetEnds('right', { square: {}, fit: 'filler' }) }));
    expect(currentRun(onlyRight).endLegs.left).toEqual({ ...E, fit: 'between' });
    expect(currentRun(onlyRight).endLegs.right).toMatchObject({ legs: 'both', fit: 'behind' });
    expect(currentRun(onlyRight).legs).toEqual([hand]);
    expect(currentRun(onlyRight).ends).toEqual({ left: { type: 'none', width: null }, right: { type: 'none', width: null } });
  });

  it('refuses an entire preset if any end or appended hand leg is invalid or collides', () => {
    const source = { ...initial, rooms: [room({ walls: [wall({ runs: [R,
      run({ id: 'other-run', x: 60, width: 36, legs: [hand] })] })] })] };
    const validEnd = { ...E, fit: 'between' };
    for (const changes of [{ endLegs: { left: validEnd, right: { ...E, front: { ...Sf, x: NaN } } } },
      { endLegs: { left: validEnd, middle: E } }, { endLegs: [] }, { endLegs: null },
      { legs: [hand] }, { legs: [{ ...hand, id: 'new', height: 0 }] },
      { legs: [{ ...hand, id: 'new' }, { ...hand, id: 'new' }] },
      { legs: [{ ...hand, id: 'new', fill: { type: 'panel' } }] }, { legs: null }]) {
      expect(elevationReducer(source, applyRunLegPreset({ ...target, endLegs: { left: validEnd }, legs: [], ...changes })))
        .toBe(source);
    }
  });

  it('appends One without replacing end legs and rejects undefined fill edits on hand legs', () => {
    const fitted = elevationReducer(initial, setRunEndLegs({ ...target, side: 'left', endLegs: { ...E, fit: 'between' } }));
    const added = elevationReducer(fitted, applyRunLegPreset({ ...target,
      ...legPresetEnds('one', { shapeId: 'leg', proud: 1 }, () => 'h1') }));
    expect(currentRun(added).endLegs).toBe(currentRun(fitted).endLegs);
    expect(currentRun(added).ends).toBe(currentRun(fitted).ends);
    expect(currentRun(added).legs).toEqual([{ ...hand, y: 1, mirror: true }]);
    const twice = elevationReducer(added, applyRunLegPreset({ ...target,
      ...legPresetEnds('one', { square: {} }, () => 'h2') }));
    expect(currentRun(twice).legs.map(({ id }) => id)).toEqual(['h1', 'h2']);
    expect(elevationReducer(added, applyRunLegPreset({ ...target,
      ...legPresetEnds('one', { shapeId: 'leg' }, () => 'h1') }))).toBe(added);
    expect(elevationReducer(added, updateRunLeg({ ...target, legId: 'h1', changes: { fill: undefined, x: 1 } }))).toBe(added);
  });

  it('preserves inactive fits’ end pieces and inherits read-only room and issued-version guards', () => {
    const fitted = elevationReducer(initial, setRunEndLegs({ ...target, side: 'left', endLegs: { ...E, fit: 'between' } }));
    const rewritten = elevationReducer(fitted, updateRun({ ...target, changes: {
      ends: { ...currentRun(fitted).ends, left: { type: 'filler', width: 5 } },
    } }));
    expect(currentRun(rewritten).endLegs.left.fit).toBe('between');
    expect(endFit(currentRun(rewritten), 'left')).toBeUndefined();
    const removed = elevationReducer(rewritten, setRunEndLegs({ ...target, side: 'left' }));
    expect(currentRun(removed).ends.left).toBe(currentRun(rewritten).ends.left);
    expect(currentRun(removed).ends.left).toEqual({ type: 'filler', width: 5 });
    for (const locked of [{ ...initial, cloud: { room: { readOnly: true } } }, { ...initial, source: 'version' }]) {
      for (const action of [setRunEndLegs({ ...target, side: 'left', endLegs: E }),
        applyRunLegPreset({ ...target, ...legPresetEnds('four', { shapeId: 'leg' }) })]) {
        expect(elevationReducer(locked, action)).toBe(locked);
      }
    }
  });
});
