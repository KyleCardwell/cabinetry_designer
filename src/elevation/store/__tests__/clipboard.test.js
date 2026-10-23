import { describe, expect, it } from 'vitest';
import { newRoomDocument } from '../../model/designProjects.js';
import elevationReducer, {
  addRoom, clearSelection, cloudRoomLoaded, cloudWorkspaceLoaded, createInitialElevationState,
  localWorkspaceLoaded, roomVersionLoaded, setActiveRoom, setClipboard, setView,
} from '../elevationSlice.js';
import { toElevationDocument } from '../persistence.js';
import { selectClipboard } from '../selectors.js';

const LAYOUT = { split: 'rows', children: [{ split: 'cols', children: [{}, { size: 8 }, {}] }, {}] };
const COPY = { kind: 'midLayout', data: LAYOUT };
const select = (elevation) => selectClipboard({ elevation });

describe('MR5 clipboard', () => {
  it('starts empty, stores a copy of { kind, data } and clears with null', () => {
    let state = createInitialElevationState(null);
    expect(select(state)).toBeNull();
    state = elevationReducer(state, setClipboard(COPY));
    expect(select(state)).toEqual(COPY);
    expect(select(state).data).not.toBe(LAYOUT);
    expect(elevationReducer(state, setClipboard(null)).clipboard).toBeNull();
  });

  it('anchor 3: ignores anything but null or { kind: string, data }', () => {
    const state = elevationReducer(createInitialElevationState(null), setClipboard(COPY));
    for (const bad of [{ kind: 1 }, { kind: 1, data: LAYOUT }, { kind: '', data: LAYOUT }, { kind: 'x' },
      [], 'midLayout', undefined]) {
      expect(elevationReducer(state, setClipboard(bad)).clipboard).toEqual(COPY);
    }
  });

  it('survives selection, view and room switches and every room / workspace load', () => {
    let state = elevationReducer(createInitialElevationState(null), setClipboard(COPY));
    const firstRoom = state.activeRoomId;
    state = elevationReducer(state, addRoom({ name: 'Room 2' }));
    state = elevationReducer(state, setActiveRoom(firstRoom));
    state = elevationReducer(state, clearSelection());
    state = elevationReducer(state, setView('elevation'));
    expect(select(state)).toEqual(COPY);

    state = elevationReducer(state, localWorkspaceLoaded(null));
    expect(select(state)).toEqual(COPY);
    state = elevationReducer(state, cloudWorkspaceLoaded({
      teamId: 't', permissions: {}, settings: state.settings, teamVersion: 1, rows: {},
    }));
    expect(select(state)).toEqual(COPY);
    const { document: room } = newRoomDocument('Kitchen');
    state = elevationReducer(state, cloudRoomLoaded({ room, meta: {} }));
    expect(state.rooms[0].name).toBe('Kitchen');
    expect(select(state)).toEqual(COPY);
    state = elevationReducer(state, roomVersionLoaded({
      room, settings: state.settings, teamId: 't', permissions: {}, meta: {},
    }));
    expect(state.source).toBe('version');
    expect(select(state)).toEqual(COPY);
  });

  it('is not saved with the document, so a reload starts empty', () => {
    const state = elevationReducer(createInitialElevationState(null), setClipboard(COPY));
    const saved = toElevationDocument(state);
    expect(saved).not.toHaveProperty('clipboard');
    expect(createInitialElevationState(JSON.parse(JSON.stringify(saved))).clipboard).toBeNull();
  });
});
