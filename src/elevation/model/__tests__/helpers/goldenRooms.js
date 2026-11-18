import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { DEFAULT_PREFS, DEFAULT_SETTINGS } from '../../constants.js';
import { effectiveSettings } from '../../effectiveSettings.js';
import { settingsFromSnapshot } from '../../settingsSnapshot.js';
import { normalizeElevationDocument, roomFromDocument } from '../../../store/persistence.js';

const fixtures = new URL('../fixtures/', import.meta.url);
const read = (file) => JSON.parse(readFileSync(new URL(file, fixtures), 'utf8'));

// Defer normalization until the test has reset the UUID counter. Every load is fresh.
export function goldenRooms() {
  const rooms = read('golden.json').rooms.map((room, index) => ({
    key: `G${index + 1}`,
    name: room.name,
    load() {
      const document = normalizeElevationDocument(read('golden.json'));
      return { room: document.rooms[index], settings: document.settings, shop: document.settings };
    },
  }));
  for (const [index, file] of ['room8cc.json', 'room10w8.json', 'room9b.json'].entries()) {
    rooms.push({
      key: `S${index + 1}`,
      name: read(file).name,
      load() {
        // These are already room objects, as loaded by their existing model tests.
        // Keep them unmodified: no document migration or per-test fixture edits.
        const room = read(file);
        return { room, settings: { ...DEFAULT_SETTINGS, ...room.settingsOverrides }, shop: DEFAULT_SETTINGS };
      },
    });
  }
  const issued = new URL('golden/', fixtures);
  if (existsSync(issued)) {
    for (const file of readdirSync(issued).filter((name) => name.endsWith('.json')).sort()) {
      rooms.push({
        key: file.replace(/\.json$/, '').split('-')[0],
        name: read(`golden/${file}`).name,
        load() {
          const row = read(`golden/${file}`);
          const frozen = settingsFromSnapshot(row.settingsSnapshot);
          if (!frozen.ok) throw new Error(`${file}: ${frozen.message}`);
          const loaded = roomFromDocument(row.document, row.schemaVersion, frozen.settings);
          if (!loaded.ok) throw new Error(`${file}: ${loaded.message}`);
          // roomVersionLoaded rebuilds state with default transient preferences and frozen layers.
          const settings = effectiveSettings({ ...frozen, prefs: { ...DEFAULT_PREFS } }, loaded.room);
          return { room: loaded.room, settings, shop: frozen.settings };
        },
      });
    }
  }
  return rooms;
}
