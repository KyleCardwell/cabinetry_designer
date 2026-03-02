import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import apiClient from '../../api/apiClient';

export const fetchRoom = createAsyncThunk('room/fetch', async (roomId) => {
  const { data } = await apiClient.get(`/api/rooms/${roomId}`);
  return data;
});

export const saveRoom = createAsyncThunk('room/save', async (roomData) => {
  const { data } = await apiClient.put(`/api/rooms/${roomData.room_id}`, roomData);
  return data;
});

const roomSlice = createSlice({
  name: 'room',
  initialState: {
    current: null,    // { room_id, project_id, name, floor_to_ceiling, default_params }
    loading: false,
    error: null,
    dirty: false,     // true when local edits haven't been saved
  },
  reducers: {
    setRoomParam(state, action) {
      const { key, value } = action.payload;
      if (state.current) {
        state.current.default_params[key] = value;
        state.dirty = true;
      }
    },
    clearRoom(state) {
      state.current = null;
      state.dirty = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRoom.pending, (state) => { state.loading = true; })
      .addCase(fetchRoom.fulfilled, (state, action) => {
        state.current = action.payload;
        state.loading = false;
        state.dirty = false;
      })
      .addCase(fetchRoom.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      .addCase(saveRoom.fulfilled, (state, action) => {
        state.current = action.payload;
        state.dirty = false;
      });
  },
});

export const { setRoomParam, clearRoom } = roomSlice.actions;
export default roomSlice.reducer;
