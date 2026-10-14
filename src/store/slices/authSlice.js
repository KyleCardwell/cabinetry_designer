import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { supabase } from '../../api/supabaseClient';
import { NO_PERMISSIONS, teamPermissions } from '../permissions.js';

export const initAuth = createAsyncThunk('auth/init', async () => {
  const { data: { session } } = await supabase.auth.getSession();
  const none = { teamId: null, teamName: null, userName: null, roleId: null, permissions: NO_PERMISSIONS };
  if (!session) return { session: null, ...none };

  // Team membership from ff-job-schedule's tables (team_members has role_id, not a role name).
  const { data: membership, error } = await supabase
    .from('team_members')
    .select('team_id, team_name, user_name, role_id, custom_permissions')
    .eq('user_id', session.user.id)
    .limit(1)
    .maybeSingle();
  if (error || !membership) {
    return { session, ...none };
  }

  const { data: role } = await supabase
    .from('roles')
    .select('can_view_estimates, can_create_estimates, can_manage_teams')
    .eq('role_id', membership.role_id)
    .maybeSingle();

  return {
    session,
    teamId: membership.team_id,
    teamName: membership.team_name ?? null,
    userName: membership.user_name ?? null,
    roleId: membership.role_id ?? null,
    permissions: teamPermissions(membership, role),
  };
});

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    session: null,
    teamId: null,
    teamName: null,
    userName: null,
    roleId: null,
    permissions: NO_PERMISSIONS,
    loading: true,
  },
  reducers: {
    setSession(state, action) {
      state.session = action.payload;
    },
    clearAuth(state) {
      state.session = null;
      state.teamId = null;
      state.teamName = null;
      state.userName = null;
      state.roleId = null;
      state.permissions = NO_PERMISSIONS;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(initAuth.pending, (state) => { state.loading = true; })
      .addCase(initAuth.fulfilled, (state, action) => {
        state.session = action.payload.session;
        state.teamId = action.payload.teamId;
        state.teamName = action.payload.teamName;
        state.userName = action.payload.userName;
        state.roleId = action.payload.roleId;
        state.permissions = action.payload.permissions;
        state.loading = false;
      })
      .addCase(initAuth.rejected, (state) => { state.loading = false; });
  },
});

export const { setSession, clearAuth } = authSlice.actions;
export default authSlice.reducer;
