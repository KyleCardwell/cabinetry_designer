import { elevationKey, elevationLetters, wallLabel } from './topology.js';
import { resolveWall } from './room.js';
import { WALL_SIDES } from './wallSides.js';
import { elevationParts } from './elevationParts.js';
import { bandParts } from './bandParts.js';
import { wallParts } from './wallParts.js';
import { cornerParts } from './cornerParts.js';
import { plotScale } from './drawingScale.js';
import { elevationDimensions } from './elevationDimensions.js';
import { elevationMarks } from './elevationMarks.js';
import { planParts } from './planParts.js';
import { planDimensions } from './planDimensions.js';

export const DRAWING_PAYLOAD_VERSION = 1;

/**
 * What geometry draws for one room (SPEC-40, payload v1): one elevation per lettered wall face, in
 * letter order. Takes a synced room (every room in the store is). Round 40 carries each face's
 * outline; round 41 adds each face's parts; round 42 its bands; 42.1 the wall's own parts; 42.2 its
 * neighbours (corner returns and profiles). Round 43 adds the drawing scale and each face's dimensions;
 * 43.3 its centreline marks; round 44 the room in plan; round 45 its dimensions.
 */
export function toDrawingPayload(room, settings) {
  const elevations = Array.from(elevationLetters(room), ([key, letter]) => {
    const wall = room.walls.find((candidate) => WALL_SIDES.some(
      (side) => elevationKey(candidate.id, side) === key,
    ));
    const side = WALL_SIDES.find((candidate) => elevationKey(wall.id, candidate) === key);

    return {
      key,
      letter,
      wallId: wall.id,
      side,
      title: `Elevation ${letter}`,
      wallLabel: wallLabel(room, wall),
      length: resolveWall(room, wall, side).length,
      height: wall.height,
      parts: [
        ...elevationParts(room, wall, side, settings),
        ...bandParts(room, wall, side, settings),
        ...wallParts(room, wall, side, settings),
        ...cornerParts(room, wall, side, settings),
      ],
      dimensions: elevationDimensions(room, wall, side, settings),
      marks: elevationMarks(room, wall, side, settings),
    };
  });

  return {
    payloadVersion: DRAWING_PAYLOAD_VERSION,
    units: 'in',
    room: { id: room.id, name: room.name },
    elevations,
    plotScale: plotScale(settings),
    plan: { parts: planParts(room, settings), dimensions: planDimensions(room, settings) },
  };
}

/** "G1 Euro kitchen" → "g1-euro-kitchen.zip" (SPEC-40); the API uses the same rule. */
export function drawingZipName(roomName) {
  const name = roomName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${name || 'room'}.zip`;
}
