/**
 * Issued room versions (DATABASE-PLAN DB2, DB3; SPEC-DB8a): the label default and the shape
 * the store hands the screens.
 */

export const ROOM_STATUSES = ['drafting', 'approved', 'released'];

/** "Kyle Cardwell" → "KC"; one letter per word, up to 3. */
export function nameInitials(name) {
  return String(name ?? '')
    .split(/[\s._-]+/)
    .map((word) => word.match(/[A-Za-z0-9]/)?.[0] ?? '')
    .filter(Boolean)
    .slice(0, 3)
    .join('')
    .toUpperCase();
}

/**
 * The prefilled version label: the issuing user's initials and today's date, `KC 10/13/26`
 * (DB3). Month and day aren't padded (`KC 3/5/27`). Without a name it's just the date.
 */
export function defaultVersionLabel(userName, date = new Date()) {
  const when = `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear() % 100).padStart(2, '0')}`;
  const initials = nameInitials(userName);
  return initials ? `${initials} ${when}` : when;
}

/** PDF revision text for the current drawing; local rooms have no revision. */
export function drawingRevision(source, info) {
  if (!info) return null;
  if (source === 'version') {
    return info.issued ? `${info.issued.label} (v${info.issued.seq})` : null;
  }
  if (source === 'cloud') {
    return info.lastVersion
      ? `DRAFT · last issued ${info.lastVersion.label} (v${info.lastVersion.seq})`
      : 'DRAFT';
  }
  return null;
}

/** A `list_design_room_versions` row → `{ versionId, seq, label, note, schemaVersion, issuedBy, issuedByName, issuedAt }`. */
export function versionFromRow(row) {
  return {
    versionId: row.version_id,
    seq: row.seq,
    label: row.label,
    note: row.note ?? null,
    schemaVersion: row.schema_version ?? null,
    issuedBy: row.issued_by ?? null,
    issuedByName: row.issued_by_name ?? null,
    issuedAt: row.issued_at ?? null,
  };
}

/** `get_design_project`'s `last_version` → `{ seq, label, issuedAt }` or null. */
export function lastVersionFromRow(lastVersion) {
  return lastVersion ? { seq: lastVersion.seq, label: lastVersion.label, issuedAt: lastVersion.issued_at ?? null } : null;
}
