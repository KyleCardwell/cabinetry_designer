import { v4 as uuid } from 'uuid';
import {
  clamp,
  dot,
  planPointToWallX,
  subtract,
  wallFrame,
} from './geometry.js';
import { verticalStart } from './overlap.js';
import { positionReadouts, startFromReadout, stretchedStart } from './positions.js';
import { openingPlanDepths } from './recesses.js';
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
  const offsetAnchor = opening.offsetAnchor ?? 'edge';
  const referenceLeftX = startFromReadout(
    opening.offsetFrom,
    offsetAnchor,
    opening.offset,
    referenceWidth,
    wallLength,
  );
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
  const offsets = {
    left: {
      jamb: positionReadouts(jamb.x, jamb.width, wallLength).left,
      casing: positionReadouts(
        casing?.x ?? jamb.x,
        casing?.width ?? jamb.width,
        wallLength,
      ).left,
    },
    right: {
      jamb: positionReadouts(jamb.x, jamb.width, wallLength).right,
      casing: positionReadouts(
        casing?.x ?? jamb.x,
        casing?.width ?? jamb.width,
        wallLength,
      ).right,
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
    offset: geometry.offsets[opening.offsetFrom][mode][opening.offsetAnchor ?? 'edge'],
  };
}

/** Change the measured-from wall end without moving the opening. */
export function setOffsetSide(opening, side, wallLength, settings) {
  if (side !== 'left' && side !== 'right') return opening;
  const geometry = openingGeometry(opening, wallLength, settings);
  return {
    ...opening,
    offsetFrom: side,
    offset: geometry.offsets[side][opening.measureMode][opening.offsetAnchor ?? 'edge'],
  };
}

/** Change the reference anchor without moving the opening. */
export function setOffsetAnchor(opening, anchor, wallLength, settings) {
  if (anchor !== 'edge' && anchor !== 'center') return opening;
  const geometry = openingGeometry(opening, wallLength, settings);
  return {
    ...opening,
    offsetAnchor: anchor,
    offset: geometry.offsets[opening.offsetFrom][opening.measureMode][anchor],
  };
}

function referenceRect(opening, geometry) {
  return opening.measureMode === 'jamb' || !geometry.casing
    ? geometry.jamb
    : geometry.casing;
}

/** The rect an opening's sizes and offsets are measured to: the jamb, or the outside of the casing. */
export function openingReferenceRect(opening, wallLength, settings) {
  return referenceRect(opening, openingGeometry(opening, wallLength, settings));
}

/** Return the allowed wall-local range for an opening's reference left edge. */
export function openingReferenceBounds(opening, wallLength, settings) {
  const geometry = openingGeometry(opening, wallLength, settings);
  const reference = referenceRect(opening, geometry);
  const bounds = geometry.casing ?? geometry.jamb;
  const inset = reference.x - bounds.x;
  return {
    min: inset,
    max: wallLength - bounds.width + inset,
  };
}

/** Snap and clamp an opening to a wall-local reference-left x coordinate. */
export function setOpeningReferenceX(opening, x, wallLength, settings) {
  if (!Number.isFinite(x)) return opening;
  const geometry = openingGeometry(opening, wallLength, settings);
  const reference = referenceRect(opening, geometry);
  const range = openingReferenceBounds(opening, wallLength, settings);
  const referenceX = clamp(roundTo(x, settings.openingSnap), range.min, range.max);
  return {
    ...opening,
    offset: positionReadouts(referenceX, reference.width, wallLength)
      [opening.offsetFrom][opening.offsetAnchor ?? 'edge'],
  };
}

/**
 * Change an opening's width, growing toward 'left', 'right' or 'both' (about its center).
 * The width is in the opening's measure mode; the offset is re-expressed in its own terms
 * without snapping or clamping (validateOpeningPlacement decides whether it fits).
 */
export function resizeOpening(opening, width, grow, wallLength, settings) {
  if (!Number.isFinite(width) || width <= 0) return opening;
  const reference = referenceRect(opening, openingGeometry(opening, wallLength, settings));
  const referenceX = stretchedStart(reference.x, reference.width, reference.width + width - opening.width, grow);
  const resized = { ...opening, width };
  const nextReference = referenceRect(resized, openingGeometry(resized, wallLength, settings));
  return {
    ...resized,
    offset: positionReadouts(referenceX, nextReference.width, wallLength)
      [opening.offsetFrom][opening.offsetAnchor ?? 'edge'],
  };
}

const LABEL_PREFIX = { door: 'D', window: 'W' };

/**
 * Number doors (D1, D2…) and windows (W1, W2…) by wall order, then left to right on each wall.
 * A typed label (`labelOverride`) stays; automatic numbers skip any number a typed label uses.
 */
export function labelOpenings(room, settings) {
  const walls = room.walls ?? [];
  const order = room.wallOrder ?? [];
  const byId = new Map(walls.map((wall) => [wall.id, wall]));
  const ordered = [
    ...order.map((id) => byId.get(id)).filter(Boolean),
    ...walls.filter((wall) => !order.includes(wall.id)),
  ];
  const taken = { door: new Set(), window: new Set() };
  for (const wall of walls) {
    for (const opening of wall.openings ?? []) {
      const prefix = LABEL_PREFIX[opening.kind];
      const match = prefix && typeof opening.labelOverride === 'string'
        ? opening.labelOverride.trim().match(new RegExp(`^${prefix}(\\d+)$`, 'i'))
        : null;
      if (match) taken[opening.kind].add(Number(match[1]));
    }
  }
  const labels = new Map();
  const next = { door: 0, window: 0 };
  for (const wall of ordered) {
    if (!wall.openings?.length) continue;
    const length = wallFrame(room, wall).length;
    const sorted = wall.openings
      .map((opening) => ({ opening, x: openingGeometry(opening, length, settings).jamb.x }))
      .sort((a, b) => a.x - b.x);
    for (const { opening } of sorted) {
      if (opening.labelOverride) {
        labels.set(opening.id, opening.labelOverride);
        continue;
      }
      if (!LABEL_PREFIX[opening.kind]) continue;
      do next[opening.kind] += 1; while (taken[opening.kind].has(next[opening.kind]));
      labels.set(opening.id, `${LABEL_PREFIX[opening.kind]}${next[opening.kind]}`);
    }
  }
  return {
    ...room,
    walls: walls.map((wall) => (wall.openings?.length ? {
      ...wall,
      openings: wall.openings.map((opening) => (
        labels.has(opening.id) && labels.get(opening.id) !== opening.label
          ? { ...opening, label: labels.get(opening.id) }
          : opening
      )),
    } : wall)),
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
  const existingCount = (room.walls ?? []).reduce((count, candidateWall) => (
    count + (candidateWall.openings ?? []).filter((opening) => opening.kind === kind).length
  ), 0);

  return setOpeningReferenceX({
    id: uuid(),
    kind,
    label: `${kind === 'door' ? 'D' : 'W'}${existingCount + 1}`,
    measureMode: mode,
    width,
    height,
    sillZ,
    offset: 0,
    offsetFrom: 'left',
    offsetAnchor: 'edge',
    casing,
  }, x, wallLength, settings);
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
      const depths = openingPlanDepths(wall, opening);
      const inVoid = contains(wallX, geometry.jamb.x, geometry.jamb.x + geometry.jamb.width)
        && contains(wallOffset, depths.back, depths.face);
      const inCasing = Boolean(
        geometry.casing
        && contains(wallX, geometry.casing.x, geometry.casing.x + geometry.casing.width)
        && contains(wallOffset, depths.face, depths.face + geometry.casing.thickness),
      );
      entries.push({ id: opening.id, containsPoint: inVoid || inCasing });
    }
  }
  return entries.reverse()
    .filter((entry) => entry.containsPoint)
    .map((entry) => entry.id);
}
