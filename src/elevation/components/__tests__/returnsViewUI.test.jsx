import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { elevationKey, returnsView } from '../../model/topology.js';
import elevationReducer, { addWall, createInitialElevationState, setElevationOption } from '../../store/elevationSlice.js';
import {
  ELEVATION_STORAGE_KEY, isRoom, loadElevationDocument, persistElevationDocument,
  roomFromDocument, toElevationDocument,
} from '../../store/persistence.js';
import CombinedElevationControl from '../CombinedElevationControl.jsx';
import ElevationToolbar from '../ElevationToolbar.jsx';
import ReturnsViewControl from '../ReturnsViewControl.jsx';

vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
let state;
const room = () => state.rooms[0];
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
const control = (extra = {}) => ReturnsViewControl({ room: room(), wallId: 'wall-2', side: 'front', ...extra });
const set = (key, returns) => setElevationOption({ roomId: room().id, key, returns });

beforeEach(() => {
  vi.clearAllMocks();
  state = createInitialElevationState(null);
  for (const id of ['wall-1', 'wall-2']) state = elevationReducer(state, addWall({ id }));
  state = { ...state, view: 'elevation' };
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
});
afterEach(() => vi.unstubAllGlobals());

describe('DM6 step c returns view switch', () => {
  it('anchor 1: defaults a new room to Section without storing elevationOptions', () => {
    const fresh = createInitialElevationState(null);
    expect(returnsView(fresh.rooms[0], 'wall-2')).toBe('section');
    expect(fresh.rooms[0]).not.toHaveProperty('elevationOptions');
    expect(toElevationDocument(fresh).rooms[0]).not.toHaveProperty('elevationOptions');
    expect(control().props).toMatchObject({ children: 'Returns: Section', 'aria-pressed': false });
    expect(room()).not.toHaveProperty('elevationOptions');
  });

  it('anchor 2: clicking beside Combine stores Wall 2 End view and toggles back independently of other faces', () => {
    const toolbar = nodes(ElevationToolbar({}));
    const combineIndex = toolbar.findIndex(({ type }) => type === CombinedElevationControl);
    const placed = toolbar[combineIndex + 1];
    expect(placed.type).toBe(ReturnsViewControl);
    expect(placed.props).toMatchObject({ room: room(), wallId: 'wall-2', side: 'front' });
    ReturnsViewControl(placed.props).props.onClick();
    expect(room().elevationOptions['wall-2'].returns).toBe('end');
    expect(control().props).toMatchObject({ children: 'Returns: End view', 'aria-pressed': true });
    expect(returnsView(room(), 'wall-1')).toBe('section');
    expect(returnsView(room(), 'wall-2:back')).toBe('section');
    control({ side: 'back' }).props.onClick();
    expect(room().elevationOptions[elevationKey('wall-2', 'back')].returns).toBe('end');
    control().props.onClick();
    expect(room().elevationOptions['wall-2'].returns).toBe('section');
    expect(returnsView(room(), 'wall-2:back')).toBe('end');
    const before = state;
    dispatch(set('wall-2', 'invalid'));
    dispatch(set('gone', 'end'));
    expect(state).toBe(before);
  });

  it('anchor 3: persists and reloads the option and rejects malformed saved values', () => {
    const values = new Map();
    vi.stubGlobal('window', { localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    } });
    control().props.onClick();
    persistElevationDocument(state);
    const saved = JSON.parse(values.get(ELEVATION_STORAGE_KEY));
    const reloaded = createInitialElevationState(loadElevationDocument());
    expect(reloaded.rooms[0].elevationOptions).toEqual({ 'wall-2': { returns: 'end' } });
    expect(returnsView(reloaded.rooms[0], 'wall-2')).toBe('end');
    expect(roomFromDocument(saved.rooms[0], saved.schemaVersion, saved.settings)).toMatchObject({
      ok: true, room: { elevationOptions: { 'wall-2': { returns: 'end' } } },
    });
    for (const elevationOptions of [
      null, [], 'end', { 'wall-2': null }, { 'wall-2': [] }, { 'wall-2': {} },
      ...['invalid', null, true, 1].map((returns) => ({ 'wall-2': { returns } })),
    ]) {
      const invalid = structuredClone(saved);
      invalid.rooms[0].elevationOptions = elevationOptions;
      expect(isRoom(invalid.rooms[0])).toBe(false);
      values.set(ELEVATION_STORAGE_KEY, JSON.stringify(invalid));
      expect(loadElevationDocument()).toBeNull();
      expect(roomFromDocument(invalid.rooms[0], invalid.schemaVersion, invalid.settings))
        .toMatchObject({ ok: false, reason: 'bad_document' });
    }
  });

  it('uses the lead face key for reading and changing any face of an enabled combined view', () => {
    state = structuredClone(state);
    room().combinedElevations = [{ id: 'group', on: true, faces: ['wall-2', 'wall-1'] }];
    room().elevationOptions = { 'wall-2': { returns: 'end' } };
    expect(returnsView(room(), 'wall-2')).toBe('section');
    control().props.onClick();
    expect(dispatch).toHaveBeenLastCalledWith(set('wall-1', 'end'));
    expect(room().elevationOptions['wall-1']).toEqual({ returns: 'end' });
    expect(returnsView(room(), 'wall-1')).toBe('end');
    expect(returnsView(room(), 'wall-2')).toBe('end');
    dispatch(set('wall-2', 'section'));
    expect(returnsView(room(), 'wall-1')).toBe('section');
    expect(returnsView(room(), 'wall-2')).toBe('section');
    state = structuredClone(state);
    room().combinedElevations[0].on = false;
    expect(returnsView(room(), 'wall-2')).toBe('end');
  });

  it('disables the control and ignores option actions for read-only rooms and issued versions', () => {
    expect(control({ readOnly: true }).props.disabled).toBe(true);
    for (const locked of [
      { ...state, cloud: { room: { readOnly: true } } },
      { ...state, source: 'version' },
    ]) {
      expect(elevationReducer(locked, set('wall-2', 'end'))).toBe(locked);
    }
    expect(control({ room: null })).toBeNull();
    expect(control({ wallId: null })).toBeNull();
  });
});
