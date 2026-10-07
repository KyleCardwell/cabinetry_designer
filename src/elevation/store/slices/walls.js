import { v4 as uuid } from 'uuid';
import { FRAME_JOINS } from '../../model/constants.js';
import { wallFrame } from '../../model/geometry.js';
import {
  LANDING_TO,
  landWallEnd,
  landingEndpoint,
  landingOffsetFor,
  landingRefCreatesCycle,
  releaseWall,
} from '../../model/landings.js';
import { flipRunsForWall } from '../../model/room.js';
import {
  addWallWithConnections,
  connectWallEndpoints,
  disconnectWallEndpoint as disconnectWallEndpointPure,
  moveConnectedEndpoint,
  moveWallPerpendicular as moveWallPerpendicularPure,
  setWallLength as setWallLengthPure,
} from '../../plan/wallOps.js';
import {
  createWall,
  roomIndexFor,
  roomFor,
  wallLocation,
  syncRoomAt,
  setCompensatedWalls,
  clearTransientSelection,
} from './helpers.js';

export const wallReducers = {
    addWall: {
      reducer(state, action) {
        const roomIndex = roomIndexFor(state, action.payload.roomId);
        if (roomIndex === -1) return;
        const room = state.rooms[roomIndex];
        const y = action.payload.y ?? (room.walls.length === 0
          ? 0
          : Math.max(...room.walls.flatMap((wall) => [wall.y1, wall.y2])) + 60);
        const wall = createWall(
          action.payload.name ?? '',
          y,
          action.payload.length ?? 144,
          {
            ...action.payload,
            height: action.payload.height ?? room.profile.wallHeight,
          },
        );
        room.walls.push(wall);
        if (wallFrame(room, wall).leftEndpoint !== 'start') wall.flipped = true;
        state.activeWallId = wall.id;
        clearTransientSelection(state);
        syncRoomAt(state, roomIndex);
      },
      prepare(payload = {}) {
        return { payload: { ...payload, id: payload.id ?? uuid() } };
      },
    },
    addWallSegment: {
      reducer(state, action) {
        const roomIndex = roomIndexFor(state, action.payload.roomId);
        if (roomIndex === -1) return;
        const room = state.rooms[roomIndex];
        const wall = createWall(
          action.payload.name ?? '',
          action.payload.y1,
          0,
          {
            id: action.payload.id,
            x1: action.payload.x1,
            y1: action.payload.y1,
            x2: action.payload.x2,
            y2: action.payload.y2,
            height: action.payload.height ?? room.profile.wallHeight,
            thickness: action.payload.thickness,
          },
        );
        room.walls = addWallWithConnections(
          room.walls,
          wall,
          action.payload.connectStart,
          action.payload.connectEnd,
        );
        for (const [endpoint, land, connect] of [
          ['start', action.payload.landStart, action.payload.connectStart],
          ['end', action.payload.landEnd, action.payload.connectEnd],
        ]) {
          if (land && !connect) {
            const landed = landWallEnd(
              { ...room, walls: room.walls },
              wall.id,
              endpoint,
              land,
            );
            if (landed) room.walls = landed.walls;
          }
        }
        state.activeWallId = wall.id;
        clearTransientSelection(state);
        syncRoomAt(state, roomIndex);
      },
      prepare(payload = {}) {
        return { payload: { ...payload, id: payload.id ?? uuid() } };
      },
    },
    moveWallEndpoint(state, action) {
      const roomIndex = roomIndexFor(state, action.payload.roomId);
      if (roomIndex === -1) return;
      const wallId = action.payload.wallId ?? action.payload.wall_id;
      const room = state.rooms[roomIndex];
      const walls = moveConnectedEndpoint(
        room.walls,
        wallId,
        action.payload.endpoint,
        { x: action.payload.x, y: action.payload.y },
      );
      setCompensatedWalls(state, roomIndex, walls);
    },
    connectWalls(state, action) {
      const roomIndex = roomIndexFor(state, action.payload.roomId);
      if (roomIndex === -1) return;
      const room = state.rooms[roomIndex];
      const walls = connectWallEndpoints(
        room.walls,
        action.payload.wallId1,
        action.payload.endpoint1,
        action.payload.wallId2,
        action.payload.endpoint2,
      );
      for (const [wallId, endpoint] of [
        [action.payload.wallId1, action.payload.endpoint1],
        [action.payload.wallId2, action.payload.endpoint2],
      ]) {
        const wall = walls.find((candidate) => candidate.id === wallId);
        if (wall?.landings) wall.landings[endpoint] = null;
      }
      setCompensatedWalls(state, roomIndex, walls);
    },
    disconnectWallEndpoint(state, action) {
      const roomIndex = roomIndexFor(state, action.payload.roomId);
      if (roomIndex === -1) return;
      state.rooms[roomIndex].walls = disconnectWallEndpointPure(
        state.rooms[roomIndex].walls,
        action.payload.wallId ?? action.payload.wall_id,
        action.payload.endpoint,
      );
      syncRoomAt(state, roomIndex);
    },
    setWallLength(state, action) {
      const location = wallLocation(state, action.payload);
      const length = action.payload.length ?? action.payload.value;
      if (!location || !Number.isFinite(length) || length <= 0) return;
      const result = setWallLengthPure(
        location.room,
        location.wall.id,
        length,
        action.payload.growEnd ?? 'right',
      );
      if (!result.ok) {
        state.message = result.reason;
        return;
      }
      state.message = null;
      setCompensatedWalls(state, location.roomIndex, result.walls);
    },
    moveWallPerpendicular(state, action) {
      const roomIndex = roomIndexFor(state, action.payload.roomId);
      if (roomIndex === -1) return;
      const room = state.rooms[roomIndex];
      const result = moveWallPerpendicularPure(
        room,
        action.payload.wallId,
        action.payload.delta,
      );
      if (!result.ok) {
        state.message = result.reason;
        return;
      }
      state.message = null;
      setCompensatedWalls(state, roomIndex, result.walls);
    },
    setWallEndPanel(state, action) {
      const location = wallLocation(state, action.payload);
      const { endpoint, panel } = action.payload;
      const validPanel = panel === null || (
        panel
        && typeof panel === 'object'
        && !Array.isArray(panel)
        && (panel.width === null || (Number.isFinite(panel.width) && panel.width >= 0))
        && (panel.frame === undefined || panel.frame === null || FRAME_JOINS.includes(panel.frame))
      );
      if (!location || !['start', 'end'].includes(endpoint) || !validPanel) return;
      location.wall.endPanels ??= { start: null, end: null };
      const stored = location.wall.endPanels[endpoint];
      location.wall.endPanels[endpoint] = panel ? {
        width: panel.width ?? null,
        ...(panel.frame ? { frame: panel.frame } : {}),
        ...(stored?.styleId !== undefined ? { styleId: stored.styleId } : {}),
        ...(stored?.sizes !== undefined ? { sizes: stored.sizes } : {}),
      } : null;
      syncRoomAt(state, location.roomIndex);
    },
    setWallLanding(state, action) {
      const location = wallLocation(state, action.payload);
      const { endpoint } = action.payload;
      const landing = location?.wall.landings?.[endpoint];
      if (!location || !landing) return;
      const ref = action.payload.ref ?? landing.ref;
      const to = action.payload.to ?? landing.to;
      if (!LANDING_TO.includes(to)) return;
      if (ref !== 'left' && ref !== 'right') {
        const refWall = location.room.walls.find((wall) => wall.id === ref);
        if (!refWall || !landingEndpoint(refWall, landing.wallId, landing.side)) return;
        if (landingRefCreatesCycle(
          location.room,
          location.wall.id,
          landing.wallId,
          landing.side,
          ref,
        )) return;
      }
      const offset = action.payload.offset === undefined
        ? landingOffsetFor(location.room, location.wall, endpoint, ref, to)
        : action.payload.offset;
      if (!Number.isFinite(offset)) return;
      location.wall.landings[endpoint] = { ...landing, ref, to, offset };
      syncRoomAt(state, location.roomIndex);
    },
    detachWallLanding(state, action) {
      const location = wallLocation(state, action.payload);
      const { endpoint } = action.payload;
      if (!location?.wall.landings?.[endpoint]) return;
      state.rooms[location.roomIndex] = releaseWall(
        location.room,
        location.wall.id,
        { deleting: false },
      );
      const wall = state.rooms[location.roomIndex].walls.find(
        (candidate) => candidate.id === location.wall.id,
      );
      wall.landings[endpoint] = null;
      syncRoomAt(state, location.roomIndex);
    },
    updateWall(state, action) {
      const location = wallLocation(state, action.payload);
      if (!location) return;
      const { wallId, roomId, id, changes, ...inlineChanges } = action.payload;
      void wallId;
      void roomId;
      void id;
      const allowedChanges = changes ?? inlineChanges;
      for (const key of ['name', 'height']) {
        if (allowedChanges[key] !== undefined) location.wall[key] = allowedChanges[key];
      }
      const thickness = allowedChanges.thickness;
      if (Number.isFinite(thickness) && thickness >= 0) location.wall.thickness = thickness;
      if (allowedChanges.numberOverride !== undefined) {
        const value = allowedChanges.numberOverride;
        if (value === null || (Number.isInteger(value) && value > 0)) {
          location.wall.numberOverride = value;
        }
      }
      if (typeof allowedChanges.elevationForced === 'boolean') location.wall.elevationForced = allowedChanges.elevationForced;
      const profileChanges = allowedChanges.profile ?? allowedChanges.profileOverrides;
      if (profileChanges) {
        for (const [key, value] of Object.entries(profileChanges)) {
          if (value === null || value === undefined) delete location.wall.profile[key];
          else location.wall.profile[key] = value;
        }
      }
      syncRoomAt(state, location.roomIndex);
    },
    deleteWall(state, action) {
      const location = wallLocation(state, typeof action.payload === 'string'
        ? { wallId: action.payload }
        : action.payload);
      if (!location) return;
      const wallId = location.wall.id;
      location.room.walls = releaseWall(location.room, wallId).walls;
      const wallIndex = location.room.walls.findIndex((wall) => wall.id === wallId);
      location.room.walls.splice(wallIndex, 1);
      for (const wall of location.room.walls) {
        for (const endpoint of ['start', 'end']) {
          if (wall.connections[endpoint]?.wallId === wallId) wall.connections[endpoint] = null;
        }
      }
      const deletedActiveWall = state.activeWallId === wallId;
      const deletedSelectedWall = state.selection.wallId === wallId;
      if (deletedActiveWall) {
        state.activeWallId = location.room.walls[0]?.id ?? null;
        state.activeWallSide = 'front';
      }
      if (deletedActiveWall || deletedSelectedWall) {
        clearTransientSelection(state);
      }
      syncRoomAt(state, location.roomIndex);
    },
    setActiveWall(state, action) {
      const wallId = action.payload.wallId ?? action.payload;
      const room = roomFor(state, action.payload.roomId);
      if (!room?.walls.some((wall) => wall.id === wallId)) return;
      state.activeWallId = wallId;
      state.activeWallSide = 'front';
      clearTransientSelection(state);
      state.selection.wallId = wallId;
    },
    setActiveWallSide(state, action) {
      const side = action.payload.side ?? action.payload;
      if (side !== 'front' && side !== 'back') return;
      state.activeWallSide = side;
      clearTransientSelection(state);
    },
    flipWall(state, action) {
      const location = wallLocation(state, action.payload);
      if (!location) return;
      location.room.walls[location.wallIndex] = flipRunsForWall(location.wall);
      syncRoomAt(state, location.roomIndex);
    },
};
