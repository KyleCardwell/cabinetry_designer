import { describe, expect, it } from 'vitest';
import { teamPermissions } from '../permissions.js';

const role = (view, create, manage) => ({
  can_view_estimates: view, can_create_estimates: create, can_manage_teams: manage,
});

describe('teamPermissions', () => {
  it('gives an admin (role 1) everything', () => {
    expect(teamPermissions({ role_id: 1, custom_permissions: {} }, role(false, false, false)))
      .toEqual({ view: true, edit: true, manage: true });
  });

  it('uses the role flags when nothing is customised', () => {
    expect(teamPermissions({ role_id: 3, custom_permissions: {} }, role(true, false, false)))
      .toEqual({ view: true, edit: false, manage: false });
  });

  it('lets a custom permission override the role, either way', () => {
    expect(teamPermissions({ role_id: 3, custom_permissions: { can_create_estimates: 'false' } }, role(false, true, false)))
      .toEqual({ view: false, edit: false, manage: false });
    expect(teamPermissions({ role_id: 3, custom_permissions: { can_manage_teams: 'true' } }, role(false, false, false)))
      .toEqual({ view: false, edit: false, manage: true });
    expect(teamPermissions({ role_id: '3', custom_permissions: { can_view_estimates: true } }, null))
      .toEqual({ view: true, edit: false, manage: false });
  });

  it('gives nothing without a membership', () => {
    expect(teamPermissions(null, role(true, true, true))).toEqual({ view: false, edit: false, manage: false });
  });
});
