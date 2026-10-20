import { elevationKey, elevationLetters, wallLabel } from './topology.js';
import { resolveWall } from './room.js';
import { WALL_SIDES } from './wallSides.js';
import { elevationParts } from './elevationParts.js';
import { bandParts } from './bandParts.js';
import { wallParts } from './wallParts.js';
import { cornerParts } from './cornerParts.js';
import { paperSize, plotScale } from './drawingScale.js';
import { elevationDimensions } from './elevationDimensions.js';
import { elevationMarks } from './elevationMarks.js';
import { elevationDoorDetails } from './elevationDoorDetails.js';
import { elevationSwingMarks } from './swingMarks.js';
import { elevationPulls } from './pullLayouts.js';
import { elevationPartNumbers } from './elevationPartNumbers.js';
import { planParts } from './planParts.js';
import { planDimensions } from './planDimensions.js';
import { planMarks } from './planMarks.js';
import { combinedViewOf } from './combinedElevations.js';
import { combinedElevationPayload } from './combinedPayload.js';
import { wallShowThrough } from './showThrough.js';
import { glassMarks } from './glassMarks.js';
import { openingGeometry } from './openings.js';

export const DRAWING_PAYLOAD_VERSION = 1;

function itemLines({ x, z, width, height }) {
  if (width === 0 || height === 0) return [{ x1: x, z1: z, x2: x + width, z2: z + height }];
  return [
    { x1: x, z1: z, x2: x + width, z2: z },
    { x1: x + width, z1: z, x2: x + width, z2: z + height },
    { x1: x + width, z1: z + height, x2: x, z2: z + height },
    { x1: x, z1: z + height, x2: x, z2: z },
  ];
}

function interiorRecord({ itemId, items }) {
  const seen = new Set();
  const lines = items.flatMap(itemLines).filter(({ x1, z1, x2, z2 }) => {
    const ends = [[x1, z1], [x2, z2]].sort(([ax, az], [bx, bz]) => ax - bx || az - bz);
    const key = JSON.stringify(ends);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const labels = items.filter(({ kind, width, height }) => kind === 'accessory' && width > 0 && height > 0)
    .map(({ label, x, z, width, height }) => ({ text: label, x, z, width, height }));
  return { partId: itemId, lines, labels };
}

function facePayload(room, wall, side, key, letter, settings, options) {
  const parts = [
    ...elevationParts(room, wall, side, settings),
    ...bandParts(room, wall, side, settings),
    ...wallParts(room, wall, side, settings),
    ...cornerParts(room, wall, side, settings),
  ];
  const partIds = new Set(parts.map(({ id }) => id));
  const swingMarks = elevationSwingMarks(room, wall, side, settings, partIds);
  const pulls = elevationPulls(room, wall, side, settings, partIds);
  const showThrough = [...wallShowThrough(room, wall, side, settings).values()];
  const interiors = showThrough.map(interiorRecord)
    .filter(({ partId, lines }) => partIds.has(partId) && lines.length);
  const glass = showThrough.flatMap(({ glass }) => glass);
  const openingsByPart = new Map(glass.map(({ partId, openings }) => [partId, openings]));
  for (const part of parts) {
    if (part.kind === 'face' && openingsByPart.has(part.id)) part.holes = openingsByPart.get(part.id);
  }
  const view = resolveWall(room, wall, side);
  const marks = [
    ...glass.map(({ partId, marks }) => ({ partId, lines: marks })),
    ...(view.openings ?? []).filter(({ kind }) => kind === 'window').map((opening) => ({
      partId: opening.id, lines: glassMarks(openingGeometry(opening, view.length, settings).jamb),
    })),
  ].filter(({ partId, lines }) => partIds.has(partId) && lines.length);

  return {
    key,
    letter,
    wallId: wall.id,
    side,
    title: `Elevation ${letter}`,
    wallLabel: wallLabel(room, wall),
    length: view.length,
    height: wall.height,
    parts,
    dimensions: elevationDimensions(room, wall, side, settings, options),
    marks: elevationMarks(room, wall, side, settings),
    doorDetails: elevationDoorDetails(room, wall, side, settings, partIds),
    partNumbers: elevationPartNumbers(room, wall, side, settings),
    ...(swingMarks.length ? { swingMarks } : {}),
    ...(pulls.length ? { pulls } : {}),
    ...(interiors.length ? { interiors } : {}),
    ...(marks.length ? { glassMarks: marks } : {}),
  };
}

/**
 * What geometry draws for one room (SPEC-40, payload v1): one elevation per lettered wall face, in
 * letter order. Takes a synced room (every room in the store is). Round 40 carries each face's
 * outline; round 41 adds each face's parts; round 42 its bands; 42.1 the wall's own parts; 42.2 its
 * neighbours (corner returns and profiles). Round 43 adds the drawing scale and each face's dimensions;
 * 43.3 its centreline marks; round 44 the room in plan; round 45 its dimensions; 45.1 its
 * markers and labels; 46.4 each face's door details; 50.13 its part number badges; HP2 its swing marks;
 * HP5 its pulls; CE combines every saved group into one elevation; IN14 its visible interiors and glass.
 */
export function toDrawingPayload(room, settings, { revision } = {}) {
  const elevations = Array.from(elevationLetters(room), ([key, letter]) => {
    const wall = room.walls.find((candidate) => WALL_SIDES.some(
      (side) => elevationKey(candidate.id, side) === key,
    ));
    const side = WALL_SIDES.find((candidate) => elevationKey(wall.id, candidate) === key);
    const combined = combinedViewOf(room, wall.id, side);
    if (combined) {
      return combinedElevationPayload(room, combined, settings, (faceWall, faceSide, options) =>
        facePayload(room, faceWall, faceSide, key, letter, settings, options));
    }
    return facePayload(room, wall, side, key, letter, settings);
  });

  return {
    payloadVersion: DRAWING_PAYLOAD_VERSION,
    units: 'in',
    room: {
      id: room.id,
      name: room.name,
      ...(typeof revision === 'string' && revision.length > 0 ? { revision: revision.slice(0, 80) } : {}),
    },
    elevations,
    plotScale: plotScale(settings),
    paperSize: paperSize(settings),
    plan: {
      parts: planParts(room, settings),
      dimensions: planDimensions(room, settings),
      marks: planMarks(room, settings),
    },
  };
}

/** "G1 Euro kitchen" → "g1-euro-kitchen.zip" (SPEC-40); the API uses the same rule. */
export function drawingZipName(roomName) {
  const name = roomName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${name || 'room'}.zip`;
}
