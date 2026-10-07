import { v4 as uuid } from 'uuid';
import { syncRoom } from '../../model/room.js';
import { roundTo } from '../../model/units.js';
import {
  createRoom,
  roomIndexFor,
  syncRoomAt,
  activateRoom,
} from './helpers.js';

export const roomReducers = {
    addRoom: {
      reducer(state, action) {
        const room = createRoom(action.payload.name, state.settings, action.payload.id);
        state.rooms.push(syncRoom(room, state.settings));
        activateRoom(state, room);
      },
      prepare(payload = {}) {
        return { payload: { id: uuid(), name: payload.name ?? 'Room 1' } };
      },
    },
    renameRoom(state, action) {
      const roomIndex = roomIndexFor(state, action.payload.roomId ?? action.payload.id);
      if (roomIndex === -1) return;
      state.rooms[roomIndex].name = action.payload.name;
      syncRoomAt(state, roomIndex);
    },
    deleteRoom(state, action) {
      const roomId = action.payload.roomId ?? action.payload;
      const index = state.rooms.findIndex((room) => room.id === roomId);
      if (index === -1) return;
      state.rooms.splice(index, 1);
      if (state.activeRoomId === roomId) {
        const nextRoom = state.rooms[0] ?? null;
        activateRoom(state, nextRoom);
      }
    },
    setActiveRoom(state, action) {
      const roomId = action.payload.roomId ?? action.payload;
      const room = state.rooms.find((candidate) => candidate.id === roomId);
      if (!room) return;
      activateRoom(state, room);
    },
    updateRoomProfile(state, action) {
      const roomIndex = roomIndexFor(state, action.payload.roomId);
      if (roomIndex === -1) return;
      const changes = action.payload.changes ?? action.payload.profile ?? {
        [action.payload.key]: action.payload.value,
      };
      for (const [key, value] of Object.entries(changes)) {
        state.rooms[roomIndex].profile[key] = value === null || value === undefined
          ? state.settings.defaultProfile[key]
          : value;
      }
      syncRoomAt(state, roomIndex);
    },
    useAutoHeightsForRoom(state, action) {
      const roomIndex = roomIndexFor(state, action.payload.roomId ?? action.payload);
      if (roomIndex === -1) return;
      for (const wall of state.rooms[roomIndex].walls) {
        for (const run of wall.runs) run.heightMode = 'auto';
      }
      syncRoomAt(state, roomIndex);
    },
    setRoomPartNumberStart(state, action) {
      const roomIndex = roomIndexFor(state, action.payload.roomId);
      if (roomIndex === -1) return;
      const value = action.payload.value ?? action.payload.start;
      state.rooms[roomIndex].partNumberStart = Number.isInteger(value) && value > 0 ? value : 1;
    },
    setPartNumberOverride(state, action) {
      const roomIndex = roomIndexFor(state, action.payload.roomId);
      const { key } = action.payload;
      if (roomIndex === -1 || typeof key !== 'string' || key === '') return;
      const room = state.rooms[roomIndex];
      room.partNumberOverrides ??= {};
      const number = action.payload.number ?? action.payload.value ?? null;
      if (number === null) delete room.partNumberOverrides[key];
      else if (Number.isInteger(number) && number > 0) room.partNumberOverrides[key] = number;
    },
    centerRoomOnOrigin(state, action) {
      const roomId = action.payload?.roomId ?? action.payload ?? state.activeRoomId;
      const roomIndex = roomIndexFor(state, roomId);
      if (roomIndex === -1) return;
      const room = state.rooms[roomIndex];
      if (room.walls.length === 0) return;
      const xs = room.walls.flatMap((wall) => [wall.x1, wall.x2]);
      const ys = room.walls.flatMap((wall) => [wall.y1, wall.y2]);
      const dx = roundTo(-(Math.min(...xs) + Math.max(...xs)) / 2, state.settings.planGrid);
      const dy = roundTo(-(Math.min(...ys) + Math.max(...ys)) / 2, state.settings.planGrid);
      if (dx === 0 && dy === 0) return;
      for (const wall of room.walls) {
        wall.x1 += dx;
        wall.y1 += dy;
        wall.x2 += dx;
        wall.y2 += dy;
      }
      syncRoomAt(state, roomIndex);
    },
};
