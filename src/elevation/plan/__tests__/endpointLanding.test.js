import { describe, expect, it, vi } from 'vitest';
import { room, wall } from '../../../test/builders.js';
import { K, K2 } from '../../../test/fixtures/landingRoomK.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { syncRoom } from '../../model/room.js';
import elevationReducer, {
  connectWalls,
  createInitialElevationState,
  disconnectWallEndpoint,
  landWallEndpoint,
  moveWallEndpoint,
} from '../../store/elevationSlice.js';
import { ENDPOINT_SNAP_RADIUS } from '../constants.js';
import planWallDraw from '../usePlanWallDraw.js';
import planWallEdits from '../usePlanWallEdits.js';

vi.mock('react', () => ({
  useCallback: (callback) => callback,
  useEffect: () => {},
}));

function harness(fixture = K2) {
  let state = {
    ...createInitialElevationState(null),
    rooms: [syncRoom(fixture, DEFAULT_SETTINGS)],
    activeRoomId: fixture.id,
    tool: 'select',
  };
  const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
  const setEndpointFaceLabel = vi.fn();
  const setAlignmentGuides = vi.fn();
  const hooks = () => {
    const currentRoom = state.rooms[0];
    const props = {
      room: currentRoom,
      walls: currentRoom.walls,
      adaptedWalls: currentRoom.walls.map((entry) => ({ ...entry, wall_id: entry.id })),
      settings: DEFAULT_SETTINGS,
      scale: 1,
      dispatch,
      setAlignmentGuides,
    };
    const draw = planWallDraw({ ...props, tool: 'wall' });
    const applyAlignment = vi.fn(draw.applyAlignment);
    return {
      ...draw,
      applyAlignment,
      ...planWallEdits({
        ...props, ...draw, applyAlignment, ENDPOINT_SNAP_RADIUS, setEndpointFaceLabel,
      }),
    };
  };
  return {
    hooks, dispatch, setEndpointFaceLabel, setAlignmentGuides,
    currentRoom: () => state.rooms[0],
    drag(type, point, wallId = 'wall-2', endpoint = 'end') {
      const target = { x: () => point.x, y: () => point.y, position: vi.fn() };
      const edits = hooks();
      edits.handleWallEndpointDrag(wallId, endpoint, { type, target });
      return { target, applyAlignment: edits.applyAlignment };
    },
  };
}

const move = { wallId: 'wall-2', endpoint: 'end', x: -38.5, y: 13.5 };
const landing = {
  wallId: 'wall-2', endpoint: 'end', hostId: 'wall-3', side: 'back', x: 85,
};

describe('drag an existing wall end onto a face (WL2)', () => {
  it('snaps K2 to the back face and labels the landing from its free end', () => {
    const subject = harness();
    const { target, applyAlignment } = subject.drag('dragmove', { x: -38.5, y: 16 });
    expect(subject.dispatch.mock.calls.map(([action]) => action)).toEqual([moveWallEndpoint(move)]);
    expect(target.position).toHaveBeenCalledWith({ x: -38.5, y: 13.5 });
    expect(subject.setEndpointFaceLabel).toHaveBeenLastCalledWith({
      x: -38.5, y: 13.5, text: '39" from Free end',
    });
    expect(subject.setAlignmentGuides).toHaveBeenLastCalledWith([]);
    expect(applyAlignment).not.toHaveBeenCalled();
  });

  it('releases onto the back face once, clears the label, and restores K walls', () => {
    const subject = harness();
    subject.drag('dragmove', { x: -38.5, y: 16 });
    subject.drag('dragend', { x: -38.5, y: 13.5 });
    expect(subject.dispatch.mock.calls.map(([action]) => action)).toEqual([
      moveWallEndpoint(move), moveWallEndpoint(move), landWallEndpoint(landing),
    ]);
    expect(subject.setEndpointFaceLabel).toHaveBeenLastCalledWith(null);
    expect(subject.currentRoom().walls).toEqual(syncRoom(K, DEFAULT_SETTINGS).walls);
  });

  it('a pointer inside the host still snaps to the near back face', () => {
    const subject = harness();
    subject.drag('dragmove', { x: -38.5, y: 11 });
    expect(subject.dispatch).toHaveBeenCalledWith(moveWallEndpoint(move));
    expect(subject.setEndpointFaceLabel).toHaveBeenLastCalledWith({
      x: -38.5, y: 13.5, text: '39" from Free end',
    });
  });

  it('leaving the face radius clears the label and releases without landing', () => {
    const subject = harness();
    subject.drag('dragmove', { x: -38.5, y: 16 });
    const { target, applyAlignment } = subject.drag('dragmove', { x: -38.5, y: 25 });
    expect(applyAlignment).toHaveBeenCalledWith(
      { x: -38.5, y: 25 }, { fixed: { x: -38.5, y: 83.5 }, excludeWallId: 'wall-2' },
    );
    expect(target.position).toHaveBeenCalledWith({ x: -38.5, y: 25 });
    expect(subject.setEndpointFaceLabel).toHaveBeenLastCalledWith(null);
    subject.drag('dragend', { x: -38.5, y: 25 });
    expect(subject.dispatch.mock.calls.slice(1).map(([action]) => action)).toEqual([
      moveWallEndpoint({ ...move, y: 25 }), moveWallEndpoint({ ...move, y: 25 }),
    ]);
    expect(subject.currentRoom().walls[1].landings.end).toBeNull();
  });

  it('drawing retains projection snapping and names both reference ends', () => {
    const subject = harness();
    // Exercise the face-snapped branch: the unmodified K2 endpoint at x = 85
    // otherwise takes priority over this face (covered separately below).
    const currentRoom = subject.currentRoom();
    const { snapDrawPoint } = planWallDraw({
      room: currentRoom, walls: currentRoom.walls, adaptedWalls: [],
      settings: DEFAULT_SETTINGS, scale: 1, setAlignmentGuides: subject.setAlignmentGuides,
    });
    for (const [x, text] of [[85, '39" from Free end'], [30, '30" from Wall 4 corner']]) {
      const result = snapDrawPoint({ x: -123.5 + x, y: 13.5 }, { x: -80, y: 50 });
      expect(result).toEqual({
        point: { x: -123.5 + x, y: 13.5 }, connect: null,
        land: { wallId: 'wall-3', side: 'back', x }, faceLabel: text,
      });
    }
  });

  it('prefers an endpoint connection over a nearby face and clears the face label', () => {
    const subject = harness(room({ walls: [
      wall({ id: 'host', x2: 100 }),
      wall({ id: 'dragged', x1: 2, y1: 50, x2: 2, y2: 20 }),
    ] }));
    const { applyAlignment } = subject.drag('dragend', { x: 2, y: 2 }, 'dragged');
    expect(subject.dispatch.mock.calls.map(([action]) => action)).toEqual([
      moveWallEndpoint({ wallId: 'dragged', endpoint: 'end', x: 0, y: 0 }),
      connectWalls({ wallId1: 'dragged', endpoint1: 'end', wallId2: 'host', endpoint2: 'start' }),
    ]);
    expect(subject.setEndpointFaceLabel).toHaveBeenLastCalledWith(null);
    expect(applyAlignment).not.toHaveBeenCalled();
  });

  it('drawing in unmodified K2 gives wall-2 endpoint priority at the x = 85 face target', () => {
    const { snapDrawPoint } = harness().hooks();
    expect(snapDrawPoint({ x: -38.5, y: 13.5 }, { x: -80, y: 50 })).toEqual({
      point: { x: -38.5, y: 15.5 },
      connect: { wallId: 'wall-2', endpoint: 'end' }, land: null, faceLabel: null,
    });
  });

  it('disconnects an alt-dragged corner before dispatching its landing', () => {
    const subject = harness(room({ walls: [
      wall({ id: 'host', x2: 100 }),
      wall({ id: 'dragged', x1: 50, y1: 50, x2: 50, y2: 20,
        connections: { start: null, end: { wallId: 'neighbour', endpoint: 'start' } } }),
      wall({ id: 'neighbour', x1: 50, y1: 20, x2: 100, y2: 20,
        connections: { start: { wallId: 'dragged', endpoint: 'end' }, end: null } }),
    ] }));
    subject.drag('dragend', { x: 50, y: 2 }, 'dragged');
    expect(subject.dispatch.mock.calls.map(([action]) => action)).toEqual([
      moveWallEndpoint({ wallId: 'dragged', endpoint: 'end', x: 50, y: 0 }),
      disconnectWallEndpoint({ wallId: 'dragged', endpoint: 'end' }),
      landWallEndpoint({ wallId: 'dragged', endpoint: 'end', hostId: 'host', side: 'front', x: 50 }),
    ]);
    expect(subject.currentRoom().walls[1].landings.end).toMatchObject({ wallId: 'host' });
    expect(subject.currentRoom().walls[2].connections.start).toBeNull();
  });

  it('suppresses a refused landing label while retaining the store refusal on release', () => {
    const subject = harness(room({ walls: [
      wall({ id: 'host', x2: 100 }),
      wall({ id: 'dragged', x1: 92, y1: 50, x2: 92, y2: 20, flipped: true, thickness: 12 }),
    ] }));
    subject.drag('dragmove', { x: 92, y: 2 }, 'dragged');
    expect(subject.setEndpointFaceLabel).toHaveBeenLastCalledWith(null);
    subject.drag('dragend', { x: 92, y: 0 }, 'dragged');
    expect(subject.dispatch).toHaveBeenLastCalledWith(landWallEndpoint({
      wallId: 'dragged', endpoint: 'end', hostId: 'host', side: 'front', x: 92,
    }));
    expect(subject.currentRoom().walls[1].landings.end).toBeNull();
  });
});
