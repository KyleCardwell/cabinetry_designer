import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DOOR_DESIGNS } from '../doorStyles.js';
import { elevationDoorDetails } from '../elevationDoorDetails.js';
import { elevationMeasureGeometry, snapMeasure } from '../measure.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const settings = { ...document.settings, runFlex: 0, doorDesigns: DOOR_DESIGNS };
const BASE = 'b822e8ac-1a44-47ca-acec-ecb93caf7b8a';

function g1(patch = {}) {
  const synced = syncRoom({ ...structuredClone(document.rooms.find(({ name }) => name === 'G1 Euro kitchen')), ...patch }, settings);
  return { synced, wall: synced.walls.find(({ runs }) => runs.some(({ id }) => id === BASE)) };
}
const corners = ({ x, z, width, height }) => [
  { x, y: z }, { x: x + width, y: z }, { x, y: z + height }, { x: x + width, y: z + height },
];

describe('measure snaps to door details in elevation', () => {
  it('includes every door opening and profile line corner the drawing shows (G1 A)', () => {
    const { synced, wall } = g1();
    const details = elevationDoorDetails(synced, wall, 'front', settings);
    const rects = details.flatMap(({ openings = [], profileLines = [] }) => [...openings, ...profileLines]);
    expect(rects.length).toBeGreaterThan(0);
    const geometry = elevationMeasureGeometry(synced, wall, 'front', settings);
    for (const rect of rects) for (const corner of corners(rect)) expect(geometry.corners).toContainEqual(corner);
  });

  it('snaps to an opening corner and picks an opening edge as a line', () => {
    const { synced, wall } = g1();
    const [{ openings: [opening] }] = elevationDoorDetails(synced, wall, 'front', settings);
    const geometry = elevationMeasureGeometry(synced, wall, 'front', settings);
    expect(snapMeasure({ x: opening.x + 0.05, y: opening.z + 0.05 }, geometry, 0.2))
      .toMatchObject({ kind: 'corner', point: { x: opening.x, y: opening.z } });
    const edge = snapMeasure({ x: opening.x + 0.05, y: opening.z + opening.height / 3 }, geometry, 0.2);
    expect(edge).toMatchObject({ kind: 'edge', point: { x: opening.x } });
  });

  it('leaves door details out when the room hides them', () => {
    const { synced, wall } = g1({ doorDetails: false });
    const shown = g1();
    const [{ openings: [opening] }] = elevationDoorDetails(shown.synced, shown.wall, 'front', settings);
    const geometry = elevationMeasureGeometry(synced, wall, 'front', settings);
    expect(geometry.corners).not.toContainEqual({ x: opening.x, y: opening.z });
  });
});
