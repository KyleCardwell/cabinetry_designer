import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { faceDrawing } from '../drawingPayload.js';
import { elevationMeasureGeometry } from '../measure.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const key = ({ x, y }) => `${Math.round(x * 1024)},${Math.round(y * 1024)}`;
const corners = (geometry) => new Set(geometry.corners.map(key));

function golden(name, settings) {
  return syncRoom(structuredClone(document.rooms.find((candidate) => candidate.name === name)), settings);
}

describe('FX5 d measure snaps to every line the elevation draws', () => {
  it('snaps to a frame opening corner while profiled faces shrink inside it', () => {
    const settings = {
      ...document.settings,
      teamDoorStyle: { ...DEFAULT_DOOR_STYLE, profiles: { ...DEFAULT_DOOR_STYLE.profiles, outside: 'p-edge' } },
    };
    const synced = golden('G2 Face frame kitchen', settings);
    const geometry = elevationMeasureGeometry(synced, synced.walls[0], 'front', settings);
    expect(corners(geometry).has(key({ x: 78.25, y: 5.75 }))).toBe(true);
    expect(corners(geometry).has(key({ x: 78.3125, y: 5.84375 }))).toBe(true);
  });

  it('snaps to open cabinet interiors (box edges, shelves) in Room 9', () => {
    const stored = JSON.parse(readFileSync(new URL('./fixtures/room9.json', import.meta.url), 'utf8'));
    const settings = { ...DEFAULT_SETTINGS, ...stored.settingsOverrides };
    const synced = syncRoom(stored, settings);
    const wall = synced.walls.find(({ name }) => name === 'Wall 2');
    const lines = faceDrawing(synced, wall, 'front', settings).interiors.flatMap((entry) => entry.lines);
    expect(lines.length).toBeGreaterThan(0);
    const found = corners(elevationMeasureGeometry(synced, wall, 'front', settings));
    for (const { x1, z1, x2, z2 } of lines) {
      expect(found.has(key({ x: x1, y: z1 }))).toBe(true);
      expect(found.has(key({ x: x2, y: z2 }))).toBe(true);
    }
  });

  it('snaps to pulls and swing marks', () => {
    for (const { name } of document.rooms) {
      const synced = golden(name, document.settings);
      for (const wall of synced.walls) {
        const drawing = faceDrawing(synced, wall, 'front', document.settings);
        if (!drawing.parts.length) continue;
        const found = corners(elevationMeasureGeometry(synced, wall, 'front', document.settings));
        for (const { outlines } of drawing.pulls) {
          for (const outline of outlines.filter((points) => !points.every((point) => point[2]))) {
            expect(found.has(key({ x: outline[0][0], y: outline[0][1] }))).toBe(true);
          }
        }
        for (const { lines } of drawing.swingMarks) {
          for (const { x1, z1 } of lines) expect(found.has(key({ x: x1, y: z1 }))).toBe(true);
        }
      }
    }
  });
});
