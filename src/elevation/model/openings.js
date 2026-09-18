import { v4 as uuid } from 'uuid';
import {
  clamp,
  dot,
  planPointToWallX,
  subtract,
  wallFrame,
} from './geometry.js';
import { verticalStart } from './overlap.js';
import { roundTo } from './units.js';

const OVERLAP_EPSILON = 1e-6;

/** Return which sides of an opening receive casing. */
export function casingSides(kind) {
  return {
    top: true,
    left: true,
    right: true,
    bottom: kind === 'window',
  };
}

/** Resolve an opening's jamb, casing, head, and all measurement offsets. */
export function openingGeometry(opening, wallLength, settings) {
  void settings;
  const sides = casingSides(opening.kind);
  const casingWidth = opening.casing?.width ?? 0;
  const casingThickness = opening.casing?.thickness ?? 0;
  const casingHeightAddition = sides.bottom ? 2 * casingWidth : casingWidth;
  const jambWidth = opening.measureMode === 'jamb'
    ? opening.width
    : opening.width - 2 * casingWidth;
  const jambHeight = opening.measureMode === 'jamb'
    ? opening.height
    : opening.height - casingHeightAddition;
  const casingOuterWidth = jambWidth + 2 * casingWidth;
  const casingOuterHeight = jambHeight + casingHeightAddition;
  const jambZ = opening.kind === 'door'
    ? 0
    : opening.measureMode === 'jamb'
      ? opening.sillZ
      : opening.sillZ + casingWidth;
  const referenceWidth = opening.measureMode === 'jamb'
    ? jambWidth
    : casingOuterWidth;
  const referenceLeftX = opening.offsetFrom === 'left'
    ? opening.offset
    : wallLength - opening.offset - referenceWidth;
  const jambX = opening.measureMode === 'jamb'
    ? referenceLeftX
    : referenceLeftX + casingWidth;
  const jamb = {
    x: jambX,
    z: jambZ,
    width: jambWidth,
    height: jambHeight,
  };
  const casing = opening.casing ? {
    x: jambX - casingWidth,
    z: opening.kind === 'door' ? 0 : jambZ - casingWidth,
    width: casingOuterWidth,
    height: casingOuterHeight,
    thickness: casingThickness,
    sides,
  } : null;
  const rightJamb = wallLength - (jamb.x + jamb.width);
  const offsets = {
    left: {
      jamb: jamb.x,
      casing: casing ? casing.x : jamb.x,
    },
    right: {
      jamb: rightJamb,
      casing: casing ? wallLength - (casing.x + casing.width) : rightJamb,
    },
  };

  return {
    jamb,
    casing,
    head: jamb.z + jamb.height,
    offsets,
  };
}

/** Change measurement mode without changing resolved opening geometry. */
export function setMeasureMode(opening, mode, wallLength, settings) {
  if (mode !== 'jamb' && mode !== 'casing') return opening;
  const geometry = openingGeometry(opening, wallLength, settings);
  const reference = mode === 'jamb' || !geometry.casing
    ? geometry.jamb
    : geometry.casing;
  return {
    ...opening,
    measureMode: mode,
    width: reference.width,
    height: reference.height,
    sillZ: opening.kind === 'door' ? 0 : reference.z,
    offset: geometry.offsets[opening.offsetFrom][mode],
  };
}

/** Change the measured-from wall end without moving the opening. */
export function setOffsetSide(opening, side, wallLength, settings) {
  if (side !== 'left' && side !== 'right') return opening;
  const geometry = openingGeometry(opening, wallLength, settings);
  return {
    ...opening,
    offsetFrom: side,
    offset: geometry.offsets[side][opening.measureMode],
  };
}

/** Create a catalog-sized opening at a requested wall-local reference edge. */
export function createOpening({ kind, x, measureMode }, { settings, room, wall }) {
  const mode = measureMode ?? settings.defaultOpeningMeasureMode;
  const sides = casingSides(kind);
  const casing = settings.openingsHaveCasing
    ? { width: settings.casingWidth, thickness: settings.casingThickness }
    : null;
  const casingWidth = casing?.width ?? 0;
  const jambWidth = kind === 'door'
    ? settings.defaultDoorWidth
    : settings.defaultWindowWidth;
  const jambHeight = kind === 'door'
    ? settings.defaultDoorHeight
    : settings.defaultWindowHeight;
  const casingHeightAddition = sides.bottom ? 2 * casingWidth : casingWidth;
  const width = mode === 'jamb' ? jambWidth : jambWidth + 2 * casingWidth;
  const height = mode === 'jamb' ? jambHeight : jambHeight + casingHeightAddition;
  const sillZ = kind === 'door'
    ? 0
    : mode === 'jamb'
      ? settings.defaultWindowSillZ
      : settings.defaultWindowSillZ - casingWidth;
  const wallLength = wallFrame(room, wall).length;
  const referenceToCasingLeft = mode === 'jamb' ? casingWidth : 0;
  const casingOuterWidth = jambWidth + 2 * casingWidth;
  const minimumReferenceX = referenceToCasingLeft;
  const maximumReferenceX = wallLength - casingOuterWidth + referenceToCasingLeft;
  const snappedX = roundTo(x, settings.openingSnap);
  const offset = clamp(snappedX, minimumReferenceX, maximumReferenceX);
  const existingCount = (room.walls ?? []).reduce((count, candidateWall) => (
    count + (candidateWall.openings ?? []).filter((opening) => opening.kind === kind).length
  ), 0);

  return {
    id: uuid(),
    kind,
    label: `${kind === 'door' ? 'D' : 'W'}${existingCount + 1}`,
    measureMode: mode,
    width,
    height,
    sillZ,
    offset,
    offsetFrom: 'left',
    casing,
  };
}

function boundsRect(geometry) {
  return geometry.casing ?? geometry.jamb;
}

function rectanglesOverlap(a, b) {
  const horizontal = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const vertical = Math.min(a.z + a.height, b.z + b.height) - Math.max(a.z, b.z);
  return horizontal > OVERLAP_EPSILON && vertical > OVERLAP_EPSILON;
}

/** Validate opening size, wall bounds, and conflicts with other openings. */
export function validateOpeningPlacement(wall, opening, settings) {
  const geometry = openingGeometry(opening, wall.length, settings);
  const { jamb } = geometry;
  if (jamb.width < settings.minOpeningWidth || jamb.height <= 0) {
    return { ok: false, reason: 'opening-too-small' };
  }

  const bounds = boundsRect(geometry);
  if (bounds.x < -OVERLAP_EPSILON
    || bounds.x + bounds.width > wall.length + OVERLAP_EPSILON) {
    return { ok: false, reason: 'opening-out-of-bounds' };
  }
  if (bounds.z < -OVERLAP_EPSILON
    || bounds.z + bounds.height > wall.height + OVERLAP_EPSILON) {
    return { ok: false, reason: 'opening-too-tall' };
  }

  const conflict = (wall.openings ?? []).some((other) => (
    other.id !== opening.id
    && rectanglesOverlap(
      bounds,
      boundsRect(openingGeometry(other, wall.length, settings)),
    )
  ));
  return conflict
    ? { ok: false, reason: 'opening-conflict' }
    : { ok: true, reason: null };
}

/** Return whether a cabinet run overlaps an opening's jamb rectangle. */
export function runBlocksOpening(run, opening, wall, settings) {
  const wallLength = wall.length ?? wallFrame(null, wall).length;
  const { jamb, head } = openingGeometry(opening, wallLength, settings);
  const horizontal = Math.min(run.x + run.width, jamb.x + jamb.width)
    - Math.max(run.x, jamb.x);
  const vertical = Math.min(run.z + run.height, head)
    - Math.max(verticalStart(run), jamb.z);
  return horizontal > OVERLAP_EPSILON && vertical > OVERLAP_EPSILON;
}

function contains(value, start, end) {
  return value >= Math.min(start, end) - 1e-9
    && value <= Math.max(start, end) + 1e-9;
}

/** Return opening ids beneath a plan point in visual stacking order. */
export function openingsAtPoint(room, point, settings) {
  if (!room || !point) return [];
  const entries = [];
  for (const wall of room.walls ?? []) {
    const frame = wallFrame(room, wall);
    const wallX = planPointToWallX(frame, point);
    const wallOffset = dot(subtract(point, frame.leftPoint), frame.n);
    for (const opening of wall.openings ?? []) {
      const geometry = openingGeometry(opening, frame.length, settings);
      const inVoid = contains(wallX, geometry.jamb.x, geometry.jamb.x + geometry.jamb.width)
        && contains(wallOffset, -wall.thickness, 0);
      const inCasing = Boolean(
        geometry.casing
        && contains(
          wallX,
          geometry.casing.x,
          geometry.casing.x + geometry.casing.width,
        )
        && contains(wallOffset, 0, geometry.casing.thickness),
      );
      entries.push({ id: opening.id, containsPoint: inVoid || inCasing });
    }
  }
  return entries.reverse()
    .filter((entry) => entry.containsPoint)
    .map((entry) => entry.id);
}
