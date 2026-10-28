import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { wallToScreen } from '../../canvas/transform.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { resolveWall, syncRoom } from '../../model/room.js';
import elevationReducer, {
  endCenterPick, replaceRun, replaceWallLayout, setMessage, startCenterPick,
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
let ui;
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
  ui = { hovered: null, chooser: null };
  point = null;
  actions = [];
  showMessage.mockClear();
  useSelector.mockImplementation((select) => select({ elevation: { centerPick } }));
  useState.mockImplementation(() => [ui, (next) => {
    ui = typeof next === 'function' ? next(ui) : next;
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
    expect(ui.hovered.target).toMatchObject({ kind: 'void', rect: { x: 112.5, width: 48 } });
  });

  it('anchor 3: a click centers the hood; with the whole run also under it, the chooser opens', () => {
    point = { x: 135.5, z: 20 };
    useHook().click({ evt: { button: 0 } });
    const layout = actions.find(({ type }) => type === replaceWallLayout.type);
    expect(layout.payload.runs.find(({ id }) => id === HOOD)).toMatchObject({ x: 96.5, width: 80 });
    expect(layout.payload.joints.map(({ x }) => x)).toEqual([38, 96.5, 176.5]);
    expect(ui.chooser.candidates.map(({ label }) => label)).toEqual(['Open 48"', 'Whole base run · 197"']);
    useHook().closeChooser();
    expect(centerPick).toBeNull();
    expect(showMessage).not.toHaveBeenCalled();
  });

  it('a click on a filler (only the whole run under it) centers and ends the mode at once', () => {
    point = { x: 234.5, z: 20 };
    useHook().click({ evt: { button: 0 } });
    expect(actions.some(({ type }) => type === replaceWallLayout.type)).toBe(true);
    expect(ui.chooser).toBeNull();
    expect(centerPick).toBeNull();
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
    useHook().closeChooser();
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

describe('CV1 step c: preview, right-click and chooser', () => {
  const none = { left: { type: 'none', width: null }, right: { type: 'none', width: null } };
  const small = syncRoom(roomOf({ walls: [wallOf({ runs: [
    run({ id: 'base', x: 0, width: 96, ends: none, autoCount: false,
      items: [{ id: 'b1', kind: 'cabinet', width: 36 }, { id: 'v', kind: 'void', width: 24 },
        { id: 'b3', kind: 'cabinet', width: 36 }] }),
    run({ id: 'up', cabinetTypeId: CABINET_TYPE_IDS.UPPER, x: 0, width: 30, z: 54, height: 30, depth: 12,
      ends: none, autoCount: false, items: [auto('u1')] }),
  ] })] }), DEFAULT_SETTINGS);
  const smallWall = resolveWall(small, small.walls[0], 'front');
  const useSmallHook = (extra = {}) => useHook({ room: small, wall: smallWall, settings: DEFAULT_SETTINGS, ...extra });

  it('anchor 1: hovering the open cell previews the hood with both side uppers', () => {
    const setStretchPreview = vi.fn();
    point = { x: 135.5, z: 20 };
    useHook({ setStretchPreview }).move();
    const preview = setStretchPreview.mock.calls.at(-1)[0];
    expect(new Set(preview.runIds)).toEqual(new Set([HOOD,
      'c3b5d002-c0bc-421b-8d22-6bbd5ee060b6', 'd63bd233-b318-473d-a13b-23c3a2b83b49']));
    expect(preview.wall.runs.find(({ id }) => id === HOOD).x).toBe(96.5);
  });

  it('anchor 2: hovering a far cabinet previews the hood stopped at its limit, not refused', () => {
    const setStretchPreview = vi.fn();
    point = { x: 50, z: 20 };
    useHook({ setStretchPreview }).move();
    expect(setStretchPreview.mock.calls.at(-1)[0].wall.runs.find(({ id }) => id === HOOD).x).toBeGreaterThan(38);
    expect(ui.hovered.refused).toBeNull();
  });

  it('anchor 3: moving off every target clears the preview', () => {
    const setStretchPreview = vi.fn();
    point = { x: 135.5, z: 20 };
    useHook({ setStretchPreview }).move();
    point = { x: 135.5, z: 50 };
    useHook({ setStretchPreview }).move();
    expect(setStretchPreview).toHaveBeenLastCalledWith(null);
    expect(ui.hovered).toBeNull();
  });

  it('anchor 4: the right-click entry starts the mode, or refuses an anchored run', async () => {
    const { requestCenterPick } = await import('./useCenterPick.js');
    const sent = [];
    const message = vi.fn();
    const hood = wall.runs.find(({ id }) => id === HOOD);
    expect(requestCenterPick({ room, wallId: WALL, run: hood, settings, dispatch: (a) => sent.push(a), showMessage: message }))
      .toBe(true);
    expect(sent).toEqual([startCenterPick({ wallId: WALL, runId: HOOD })]);
    const tall = wall.runs.find(({ id }) => id === TALL);
    expect(requestCenterPick({ room, wallId: WALL, run: tall, settings, dispatch: (a) => sent.push(a), showMessage: message }))
      .toBe(false);
    expect(message).toHaveBeenCalledWith(CENTER_ANCHORED);
  });

  it('anchors 5–6: choosing the whole run in the chooser re-centers from the pre-click room', () => {
    centerPick = { wallId: 'wall-1', runId: 'up' };
    point = { x: 48, z: 20 };
    useSmallHook().click({ evt: { button: 0 } });
    const first = actions.filter(({ type }) => type === replaceRun.type).at(-1).payload.run;
    const voidTarget = ui.chooser.candidates[0];
    expect(voidTarget.kind).toBe('void');
    expect(first.x).toBeCloseTo(voidTarget.center - 15, 9);
    useSmallHook().choose('base:run');
    const second = actions.filter(({ type }) => type === replaceRun.type).at(-1).payload.run;
    expect(second.x).toBeCloseTo(48 - 15, 9);
    expect(centerPick).toBeNull();
  });

  it('hovering a chooser entry previews it', () => {
    centerPick = { wallId: 'wall-1', runId: 'up' };
    const setStretchPreview = vi.fn();
    point = { x: 48, z: 20 };
    useSmallHook({ setStretchPreview }).click({ evt: { button: 0 } });
    useSmallHook({ setStretchPreview }).hoverChoice('base:run');
    expect(setStretchPreview.mock.calls.at(-1)[0].wall.runs.find(({ id }) => id === 'up').x).toBeCloseTo(33, 9);
    expect(ui.chooser.hoverKey).toBe('base:run');
  });
});

