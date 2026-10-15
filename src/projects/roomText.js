import { ROOM_STATUS_LABELS } from '../elevation/model/designProjects.js';

const namesOf = (entries) => [...new Set(entries.map((entry) => entry.userName || 'Someone'))];

export function editorsText(entries) {
  const names = namesOf(entries);
  if (!names.length) return 'Someone else';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

export function readOnlyText(reason, openBy = []) {
  switch (reason) {
    case 'others': return `${editorsText(openBy)} ${namesOf(openBy).length > 1 ? 'have' : 'has'} this room open. You're viewing only.`;
    case 'permission': return "View only: you don't have permission to edit designs.";
    case 'archived': return 'This room is archived. Restore it on the project page to edit it.';
    case 'version': return "This is an issued version. It can't be edited.";
    default: return null;
  }
}

export function statusBlockText({ status, byName }) {
  return `This room is ${ROOM_STATUS_LABELS[status]}${byName ? ` (by ${byName})` : ''}. Saving your changes will move it back to Drafting.`;
}

export function openRoomChips(entries) {
  const editors = entries.filter((entry) => !entry.readOnly);
  const viewers = entries.filter((entry) => entry.readOnly);
  return [
    ...(editors.length ? [{ label: `Open · ${editorsText(editors)}`, editing: true }] : []),
    ...(viewers.length ? [{ label: `Viewing · ${editorsText(viewers)}`, editing: false }] : []),
  ];
}

export function missingDesignName(designId) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(designId)
    ? 'An archived door design' : `Door design \`${designId}\``;
}
