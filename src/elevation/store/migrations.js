// To add a migration: bump ELEVATION_SCHEMA_VERSION, add { from, to, note, up },
// and add a test with an old full document. up(document) returns the upgraded document.
import { ELEVATION_SCHEMA_VERSION } from './persistence.js';

export const MIGRATIONS = [];

/** Upgrade a full document on a copy; a missing step leaves the original unchanged. */
export function migrateDocument(document, list = MIGRATIONS) {
  if (typeof document?.schemaVersion !== 'number'
    || document.schemaVersion >= ELEVATION_SCHEMA_VERSION) return document;

  let current = structuredClone(document);
  while (current.schemaVersion < ELEVATION_SCHEMA_VERSION) {
    const migration = list.find(({ from, to }) => (
      from === current.schemaVersion && to === from + 1
    ));
    if (!migration) return document;
    current = { ...migration.up(current), schemaVersion: migration.to };
  }
  return current;
}
