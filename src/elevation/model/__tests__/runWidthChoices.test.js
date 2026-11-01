import { describe, expect, it } from 'vitest';
import { attach, auto, fixed, line, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { runItems } from '../grid.js';
import { layoutRun } from '../faceLayouts.js';
import { syncRoom } from '../room.js';
import { applyRunWidthChoice, runWidthChoices } from '../runWidthChoices.js';
import elevationReducer, {
  applyRunWidthChoice as applyAction,
  createInitialElevationState,
  openRunWidthPrompt,
} from '../../store/elevationSlice.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const panel = { type: 'end_panel', width: 0.75 };

function p(overrides = {}, items = [fixed('A', 30), fixed('B', 24), fixed('C', 36)], wallOverrides = {}) {
  return syncRoom(room({ walls: [wall({ x2: 120, ...wallOverrides, runs: [run({
    x: 0, width: 80, autoCount: false, anchors: { left: true, right: false },
    ends: { left: { type: 'none', width: null }, right: panel },
    items, widthFrom: 'cells', ...overrides,
  })] })] }), settings);
}

const choices = (stored, width, removed = []) => runWidthChoices(stored, 'wall-1', 'run-1', width, 'right', settings, removed);
const brief = (result) => result.options.map(({ type, itemId, side, result: value, final }) => (
  type === 'remove' ? [type, itemId, final] : [type, itemId ?? side, value]));

describe('LL6 c typed-width choices', () => {
  it('anchor 1: growing offers each cabinet as auto', () => {
    const stored = p();
    expect(stored.walls[0].runs[0].width).toBe(90.75);
    const result = choices(stored, 96);
    expect(result).toMatchObject({
      needsChoice: true, current: 90.75, width: 96, without: null,
      header: 'Run is 90 3/4. Changing it to 96 changes a typed width.',
    });
    expect(brief(result)).toEqual([['auto', 'A', 35.25], ['auto', 'B', 29.25], ['auto', 'C', 41.25]]);
    expect(result.options[1].label).toBe('Make cabinet 2 (24) auto → 29 1/4');
  });

  it('anchor 2: shrinking past every auto offers only removes', () => {
    expect(brief(choices(p(), 60))).toEqual([['remove', 'A', false], ['remove', 'B', false], ['remove', 'C', false]]);
    expect(choices(p(), 60).options[2].label).toBe('Remove cabinet 3 (36)…');
  });

  it('anchor 3: after a removal the list is for what is left', () => {
    const result = choices(p(), 60, ['C']);
    expect(brief(result)).toEqual([['auto', 'A', 35.25], ['auto', 'B', 29.25]]);
    expect(result.current).toBe(54.75);
    expect(result.without).toBe('Without cabinet 3 (36):');
  });

  it('anchor 4: applying remove + auto types the width', () => {
    const result = applyRunWidthChoice(p(), 'wall-1', 'run-1',
      { width: 60, grow: 'right', removed: ['C'], auto: 'B' }, settings);
    expect(result.ok).toBe(true);
    const [w] = result.room.walls;
    const [r] = w.runs;
    expect(r.width).toBe(60);
    expect(r.widthFrom).toBeUndefined();
    expect(runItems(r).map(({ id, width }) => [id, width])).toEqual([['A', 30], ['B', null]]);
    expect(layoutRun(result.room, w, r, settings).pieces).toMatchObject([
      { id: 'A', x: 0, width: 30 }, { id: 'B', x: 30, width: 29.25 }, { role: 'end-right', x: 59.25, width: 0.75 },
    ]);
  });

  it('anchor 5: a remove that fits exactly is final', () => {
    expect(brief(choices(p(), 60.75))).toEqual([['remove', 'A', true], ['remove', 'B', false], ['remove', 'C', false]]);
  });

  it('anchor 6: a typed end filler is offered when the run is rigid', () => {
    const stored = p({ ends: { left: { type: 'filler', width: 3 }, right: panel } }, [fixed('A', 30), fixed('B', 24)]);
    expect(stored.walls[0].runs[0].width).toBe(57.75);
    expect(brief(choices(stored, 60))).toEqual([['auto', 'A', 32.25], ['auto', 'B', 26.25], ['end', 'left', 5.25]]);
    expect(choices(stored, 60).options[2].label).toBe('Change the left filler to 5 1/4');
    expect(brief(choices(stored, 57))).toEqual([['auto', 'A', 29.25], ['auto', 'B', 23.25], ['end', 'left', 2.25]]);
    expect(brief(choices(stored, 55))).toEqual([['auto', 'A', 27.25], ['auto', 'B', 21.25]]);
  });

  it('anchor 7: applying the end option changes only that filler', () => {
    const stored = p({ ends: { left: { type: 'filler', width: 3 }, right: panel } }, [fixed('A', 30), fixed('B', 24)]);
    const result = applyRunWidthChoice(stored, 'wall-1', 'run-1',
      { width: 60, grow: 'right', end: { side: 'left', width: 5.25 } }, settings);
    const [r] = result.room.walls[0].runs;
    expect(r.ends.left.width).toBe(5.25);
    expect(r.width).toBe(60);
    expect(runItems(r).map(({ width }) => width)).toEqual([30, 24]);
  });

  it('anchor 8: an absorber or auto count means no choice', () => {
    expect(choices(p({}, [fixed('A', 30), auto('B'), fixed('C', 36)]), 96)).toEqual({ needsChoice: false });
    expect(choices(p({ ends: { left: { type: 'filler', width: null }, right: panel } }), 96)).toEqual({ needsChoice: false });
    expect(choices(p({ autoCount: true }), 60)).toEqual({ needsChoice: false });
  });

  it('anchor 9: a column on a line means no choice', () => {
    const stored = p({}, [{ ...fixed('A', 30), attach: attach('L1') }, fixed('B', 24), fixed('C', 36)],
      { lines: [line('L1', 15)] });
    expect(choices(stored, 96)).toEqual({ needsChoice: false });
  });

  it('anchor 10: the store applies the pick in one dispatch and closes the prompt', () => {
    const base = createInitialElevationState(null);
    let state = { ...base, settings: { ...base.settings, runFlex: 0 }, activeRoomId: 'room-1', rooms: [p()] };
    const at = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1' };
    state = elevationReducer(state, openRunWidthPrompt({ ...at, width: 60, grow: 'right' }));
    expect(state.widthPrompt).toEqual({ ...at, width: 60, grow: 'right' });
    state = elevationReducer(state, applyAction({ ...at, width: 60, grow: 'right', removed: ['C'], auto: 'B' }));
    expect(state.widthPrompt).toBeNull();
    expect(state.rooms[0].walls[0].runs[0].width).toBe(60);
  });
});
