import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { useDispatch, useSelector } from 'react-redux';
import { auto, fixed, room as makeRoom, run as makeRun, wall as makeWall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { resolveWall, syncRoom } from '../../model/room.js';
import { runWidthChoices } from '../../model/runWidthChoices.js';
import elevationReducer, {
  applyRunWidthChoice,
  closeRunWidthPrompt,
  createInitialElevationState,
  openRunWidthPrompt,
} from '../../store/elevationSlice.js';
import RunWidthPrompt, { pickResult, RunWidthPromptView } from '../RunWidthPrompt.jsx';
import RunGeometrySection from '../properties/RunGeometrySection.jsx';
import useRunStretch from '../canvas/useRunStretch.js';

vi.mock('react', async (original) => ({
  ...await original(),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
  useEffect: (effect) => { effect(); },
  useCallback: (fn) => fn,
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

// LL6 e: the typed-width prompt and the two places that open it.

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const at = { wallId: 'wall-1', runId: 'run-1' };
let state;
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object'
    ? [tree, ...nodes(tree.props?.label), ...nodes(tree.props?.children)] : [];
const button = (tree, text) => nodes(tree).find(({ type, props }) => type === 'button' && props.children === text);
const radios = (tree) => nodes(tree).filter(({ type, props }) => type === 'input' && props.type === 'radio');

function setup(items = [fixed('A', 30), fixed('B', 24), fixed('C', 36)]) {
  const base = createInitialElevationState(null);
  const stored = syncRoom(makeRoom({ walls: [makeWall({ x2: 120, runs: [makeRun({
    x: 0, width: 80, autoCount: false, anchors: { left: true, right: false },
    ends: { left: { type: 'none', width: null }, right: { type: 'end_panel', width: 0.75 } },
    items, widthFrom: 'cells',
  })] })] }), settings);
  state = { ...base, settings: { ...base.settings, runFlex: 0 }, activeRoomId: stored.id, rooms: [stored] };
}
const room = () => state.rooms[0];
const wall = () => resolveWall(room(), room().walls[0], 'front');

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
  setup();
});

function geometry() {
  return RunGeometrySection({
    room: room(), wall: wall(), run: wall().runs[0], settings,
    actionBase: at, validateAndDispatch: vi.fn(() => true),
  });
}
const widthInput = () => nodes(geometry()).find(({ props }) => props?.ariaLabel === 'Run width');

function useStretch() {
  return useRunStretch({
    applyRunAlignment: (point) => ({ point }), dispatch, room: room(), settings, wall: wall(),
    setStretchPreview: vi.fn(), setAlignmentGuides: vi.fn(), showMessage: vi.fn(),
    messageTimeoutRef: { current: null },
  });
}

describe('LL6 e typed-width prompt', () => {
  it('anchor 1: typing 96 in Width opens the prompt and nothing else', () => {
    expect(room().walls[0].runs[0].width).toBe(90.75);
    expect(widthInput().props.onCommit(96)).toBe(true);
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([openRunWidthPrompt({ ...at, width: 96, grow: 'right' })]);
    expect(room().walls[0].runs[0].width).toBe(90.75);
  });

  it('anchor 2: the dialog lists the options, first picked; Apply makes cabinet 1 auto', () => {
    dispatch(openRunWidthPrompt({ ...at, width: 96, grow: 'right' }));
    const element = RunWidthPrompt();
    const tree = RunWidthPromptView(element.props);
    const html = renderToStaticMarkup(element);
    expect(html).toContain('Run is 90 3/4. Changing it to 96 changes a typed width.');
    expect(radios(tree).map(({ props }) => props.checked)).toEqual([true, false, false]);
    expect(nodes(tree).find(({ props }) => props?.role === 'dialog').props['aria-modal']).toBe('true');
    dispatch.mockClear();
    element.props.onApply();
    expect(dispatch).toHaveBeenCalledWith(applyRunWidthChoice({
      roomId: room().id, ...at, width: 96, grow: 'right', removed: [], auto: 'A', end: null,
    }));
    expect(state.widthPrompt).toBeNull();
  });

  it('anchor 3: removing first shows the next list, then applies both', () => {
    const prompt = { roomId: room().id, ...at, width: 60, grow: 'right' };
    const first = runWidthChoices(room(), 'wall-1', 'run-1', 60, 'right', settings);
    expect(first.options[2].label).toBe('Remove cabinet 3 (36)…');
    expect(pickResult(prompt, first, first.options[2])).toEqual({ removed: ['C'] });
    const second = runWidthChoices(room(), 'wall-1', 'run-1', 60, 'right', settings, ['C']);
    const html = renderToStaticMarkup(RunWidthPromptView({ choices: second, picked: 1, onPick: vi.fn(), onApply: vi.fn(), onCancel: vi.fn() }));
    expect(html).toContain('Without cabinet 3 (36):');
    expect(second.options[1].label).toBe('Make cabinet 2 (24) auto → 29 1/4');
    expect(pickResult(prompt, second, second.options[1])).toEqual({ apply: {
      ...prompt, removed: ['C'], auto: 'B', end: null,
    } });
  });

  it('anchor 4: Cancel and Escape close the prompt only', () => {
    let keydown = null;
    vi.stubGlobal('window', { addEventListener: (_, handler) => { keydown = handler; }, removeEventListener: vi.fn() });
    dispatch(openRunWidthPrompt({ ...at, width: 96, grow: 'right' }));
    const tree = RunWidthPromptView(RunWidthPrompt().props);
    dispatch.mockClear();
    button(tree, 'Cancel').props.onClick();
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([closeRunWidthPrompt()]);
    dispatch(openRunWidthPrompt({ ...at, width: 96, grow: 'right' }));
    RunWidthPrompt();
    dispatch.mockClear();
    const preventDefault = vi.fn();
    keydown({ key: 'Escape', preventDefault });
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([closeRunWidthPrompt()]);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('anchor 5: dragging the free edge to 96 opens the prompt instead of replacing the run', () => {
    useStretch().commitStretch('run-1', 'right', 96, { exact: true });
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([openRunWidthPrompt({ ...at, width: 96, grow: 'right' })]);
  });

  it('anchor 6: with an auto cabinet neither path asks', () => {
    setup([fixed('A', 30), auto('B'), fixed('C', 36)]);
    widthInput().props.onCommit(96);
    expect(dispatch.mock.calls.some(([action]) => action.type === openRunWidthPrompt.type)).toBe(false);
    dispatch.mockClear();
    useStretch().commitStretch('run-1', 'right', 96, { exact: true });
    const types = dispatch.mock.calls.map(([action]) => action.type);
    expect(types).not.toContain(openRunWidthPrompt.type);
    expect(types).toContain('elevation/replaceRun');
  });
});
