import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import apiClient from '../../api/apiClient';

export const fetchProjects = createAsyncThunk('projects/fetchAll', async (_, { getState }) => {
  const { teamId } = getState().auth;
  const { data } = await apiClient.get(`/api/projects?team_id=${teamId}`);
  return data;
});

export const createProject = createAsyncThunk('projects/create', async (projectData) => {
  const { data } = await apiClient.post('/api/projects', projectData);
  return data;
});

const projectSlice = createSlice({
  name: 'projects',
  initialState: {
    list: [{
      project_id: 1,
      name: 'Test Project',
      team_id: 1,
      created_at: '2025-10-13T12:00:00Z',
      updated_at: '2025-10-13T12:00:00Z',
    }],
    loading: false,
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchProjects.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchProjects.fulfilled, (state, action) => {
        state.list = action.payload;
        state.loading = false;
      })
      .addCase(fetchProjects.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      .addCase(createProject.fulfilled, (state, action) => {
        state.list.push(action.payload);
      });
  },
});

export default projectSlice.reducer;
