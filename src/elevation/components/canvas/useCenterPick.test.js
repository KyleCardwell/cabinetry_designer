import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { wallToScreen } from '../../canvas/transform.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { resolveWall, syncRoom } from '../../model/room.js';
import elevationReducer, {
  endCenterPick, replaceWallLayout, setMessage, startCenterPick,
} from '../../store/elevationSlice.js';
import { auto, room as roomOf, run, wall as wallOf } from '../../../test/builders.js';
import useCenterPick, {
  CENTER_ANCHORED, CENTER_NOTHING, CENTER_PICK_PROMPT, centerPickRefusal, centerResultMessage,
} from './useCenterPick.js';

vi.mock('react', async (original) => ({
  ...await original(),
  useCallback: (callback) => callback,
  useMemo: (factory) => factory(),
  useEffect: vi.fn(),
  useState: vi.fn(),
}));
vi.mock('react-redux', () => ({ useSelector: vi.fn() }));

const stored = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/room8.json', import.meta.url), 'utf8'));
const settings = { ...DEFAULT_SETTINGS, ...stored.settingsOverrides };
const room = syncRoom(stored, settings);
const WALL = '14154ec7-5eeb-4511-8d78-5d3da7b09418';
const HOOD = 'c1cb2dd4-6ec7-4d67-a1ef-1b5072bcc757';
const TALL = '6093224d-9be8-431f-b82f-b1346fd48122';
const wall = resolveWall(room, room.walls.find(({ id }) => id === WALL), 'front');
const transform = { scale: 4, offsetX: 20, offsetY: 30, wallHeight: 120 };

let centerPick;
let hovered;
let point;
let actions;
const dispatch = (action) => {
  actions.push(action);
  if (action.type === endCenterPick.type) centerPick = null;
};
const showMessage = vi.fn();
const useHook = (extra = {}) => useCenterPick({
  room, wall, settings, transform, tool: 'select', dispatch, showMessage,
  stageRef: { current: { getPointerPosition: () => (point ? wallToScreen(point, transform) : null) } },
  ...extra,
});

beforeEach(() => {
  centerPick = { wallId: WALL, runId: HOOD };
  hovered = null;
  point = null;
  actions = [];
  showMessage.mockClear();
  useSelector.mockImplementation((select) => select({ elevation: { centerPick } }));
  useState.mockImplementation(() => [hovered, (next) => {
    hovered = typeof next === 'function' ? next(hovered) : next;
  }]);
  useEffect.mockImplementation(() => {});
});

describe('CV1 step b: center pick state', () => {
  it('start and end set and clear centerPick', () => {
    let state = elevationReducer(undefined, { type: '@@init' });
    expect(state.centerPick).toBeNull();
    state = elevationReducer(state, startCenterPick({ wallId: 'w', runId: 'r' }));
    expect(state.centerPick).toEqual({ wallId: 'w', runId: 'r' });
    expect(elevationReducer(state, startCenterPick({ wallId: 'w' })).centerPick).toEqual({ wallId: 'w', runId: 'r' });
    expect(elevationReducer(state, endCenterPick()).centerPick).toBeNull();
  });
});

describe('CV1 step b: canvas pick mode', () => {
  it('anchor 1: is active for the hood on its own face and prompts', () => {
    useEffect.mockImplementation((effect) => { effect(); });
    vi.stubGlobal('addEventListener', () => {});
    const pick = useHook();
    vi.unstubAllGlobals();
    expect(pick.active).toBe(true);
    expect(pick.run.id).toBe(HOOD);
    expect(actions).toContainEqual(setMessage(CENTER_PICK_PROMPT));
  });

  it('anchor 2: hovering the open cell outlines it', () => {
    point = { x: 135.5, z: 20 };
    useHook().move();
    expect(hovered.target).toMatchObject({ kind: 'void', rect: { x: 112.5, width: 48 } });
  });

  it('anchor 3: a click centers the hood and ends the mode', () => {
    point = { x: 135.5, z: 20 };
    useHook().click({ evt: { button: 0 } });
    const layout = actions.find(({ type }) => type === replaceWallLayout.type);
    expect(layout.payload.runs.find(({ id }) => id === HOOD)).toMatchObject({ x: 96.5, width: 80 });
    expect(layout.payload.joints.map(({ x }) => x)).toEqual([38, 96.5, 176.5]);
    expect(centerPick).toBeNull();
    expect(showMessage).not.toHaveBeenCalled();
  });

  it('anchor 4: Esc ends the mode with nothing changed', () => {
    const effects = [];
    useEffect.mockImplementation((effect) => { effects.push(effect); });
    const listeners = {};
    vi.stubGlobal('addEventListener', (type, listener) => { listeners[type] = listener; });
    vi.stubGlobal('removeEventListener', () => {});
    useHook();
    effects.forEach((effect) => effect());
    listeners.keydown({ key: 'Escape', preventDefault() {}, stopImmediatePropagation() {} });
    vi.unstubAllGlobals();
    expect(centerPick).toBeNull();
    expect(actions.some(({ type }) => type === replaceWallLayout.type)).toBe(false);
  });

  it('anchor 5: a click on blank wall ends the mode with nothing changed', () => {
    point = { x: 135.5, z: 50 };
    useHook().click({ evt: { button: 0 } });
    expect(centerPick).toBeNull();
    expect(actions.map(({ type }) => type)).toEqual([endCenterPick.type, setMessage.type]);
  });

  it('stops at a limit and says how far off it is', () => {
    point = { x: 50, z: 20 };
    useHook().click({ evt: { button: 0 } });
    expect(showMessage).toHaveBeenCalledWith(expect.stringMatching(/^Centered as far as it goes — .+ off$/));
  });

  it('is off on another tool, another wall face, or for a missing run', () => {
    expect(useHook({ tool: 'draw' }).active).toBe(false);
    expect(useHook({ wall: resolveWall(room, room.walls.find(({ id }) => id === WALL), 'back') }).active).toBe(false);
    centerPick = { wallId: WALL, runId: 'gone' };
    expect(useHook().active).toBe(false);
  });
});

describe('CV1 step b: refusals and messages', () => {
  it('anchor 6: refuses a run anchored to the wall end', () => {
    expect(centerPickRefusal(room, WALL, wall.runs.find(({ id }) => id === TALL), settings)).toBe(CENTER_ANCHORED);
    expect(centerPickRefusal(room, WALL, wall.runs.find(({ id }) => id === HOOD), settings)).toBeNull();
  });

  it('anchor 7: refuses the only run on a wall', () => {
    const lone = run({ id: 'up', cabinetTypeId: CABINET_TYPE_IDS.UPPER, items: [auto('u')] });
    expect(centerPickRefusal(roomOf({ walls: [wallOf({ runs: [lone] })] }), 'wall-1', lone, DEFAULT_SETTINGS))
      .toBe(CENTER_NOTHING);
  });

  it('words results', () => {
    expect(centerResultMessage({ ok: true, off: 0 })).toBeNull();
    expect(centerResultMessage({ ok: true, off: 1 / 128 })).toBeNull();
    expect(centerResultMessage({ ok: false, reason: 'anchored' })).toBe(CENTER_ANCHORED);
    expect(centerResultMessage({ ok: false, reason: 'over-constrained' })).toBe('over-constrained');
  });
});
