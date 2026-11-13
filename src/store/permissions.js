/**
 * Design permissions (DATABASE-PLAN DB15), computed the same way as the database's
 * has_team_permission(): role 1 is admin; a key present in custom_permissions wins;
 * otherwise the role's own flag.
 */
const ADMIN_ROLE_ID = 1;

function flag(member, role, permission) {
  if (Number(member?.role_id) === ADMIN_ROLE_ID) return true;
  const custom = member?.custom_permissions;
  if (custom && typeof custom === 'object' && Object.hasOwn(custom, permission)) {
    return String(custom[permission]).toLowerCase() === 'true';
  }
  return role?.[permission] === true;
}

/** `{ view, edit, manage }` for one team member row and its role row. */
export function teamPermissions(member, role) {
  if (!member) return { view: false, edit: false, manage: false };
  const edit = flag(member, role, 'can_create_estimates');
  return {
    view: edit || flag(member, role, 'can_view_estimates'),
    edit,
    manage: flag(member, role, 'can_manage_teams'),
  };
}

export const NO_PERMISSIONS = Object.freeze({ view: false, edit: false, manage: false });

export function selectDesignPermissions(state) {
  return state.auth?.permissions ?? NO_PERMISSIONS;
}
