import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { supabase } from '../../api/supabaseClient';

export const initAuth = createAsyncThunk('auth/init', async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { session: null, teamId: null };

  // Fetch team membership from existing teams/team_members tables
  const { data: membership } = await supabase
    .from('team_members')
    .select('team_id, user_name, role')
    .eq('user_id', session.user.id)
    .single();

  return {
    session,
    teamId: membership?.team_id ?? null,
    userName: membership?.user_name ?? null,
    role: membership?.role ?? null,
  };
});

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    session: null,
    teamId: null,
    userName: null,
    role: null,
    loading: true,
  },
  reducers: {
    setSession(state, action) {
      state.session = action.payload;
    },
    clearAuth(state) {
      state.session = null;
      state.teamId = null;
      state.userName = null;
      state.role = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(initAuth.pending, (state) => { state.loading = true; })
      .addCase(initAuth.fulfilled, (state, action) => {
        state.session = action.payload.session;
        state.teamId = action.payload.teamId;
        state.userName = action.payload.userName;
        state.role = action.payload.role;
        state.loading = false;
      })
      .addCase(initAuth.rejected, (state) => { state.loading = false; });
  },
});

export const { setSession, clearAuth } = authSlice.actions;
export default authSlice.reducer;
