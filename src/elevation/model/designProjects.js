import { createRoom } from '../store/slices/helpers.js';
import { ELEVATION_SCHEMA_VERSION } from '../store/persistence.js';

export const ROOM_STATUS_LABELS = {
  drafting: 'Drafting',
  approved: 'Approved',
  released: 'Released to shop',
};

export function projectAddress(row) {
  const part = (key) => String(row[key] ?? '').trim();
  return [part('street'), part('city'), [part('state'), part('zip')].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');
}

export function nextName(prefix, names) {
  let number = names.length + 1;
  while (names.includes(`${prefix} ${number}`)) number += 1;
  return `${prefix} ${number}`;
}

export function copyName(name) {
  return `${name} copy`;
}

export function newRoomDocument(name) {
  return { document: createRoom(name), schemaVersion: ELEVATION_SCHEMA_VERSION };
}
