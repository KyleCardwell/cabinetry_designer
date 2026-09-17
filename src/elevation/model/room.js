import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from './constants.js';
import {
  cornerAt,
  cornerFillerMin,
  cornerReserve,
  resolveHorizontal,
} from './corners.js';
import { findCollisions } from './footprints.js';
import {
  dot,
  subtract,
  wallFrame,
  wallLength,
} from './geometry.js';
import { validateRunPlacement } from './overlap.js';
import { resolveProfile, resolveVertical } from './profile.js';
import { splitRun, syncAutoItems } from './splitRun.js';
import { computeWallOrder } from './topology.js';
import { roundTo } from './units.js';

const STRETCH_EDGE_SNAP_DISTANCE = 2;

function cloneRun(run) {
  return {
    ...run,
    ends: {
      left: { ...run.ends.left },
      right: { ...run.ends.right },
    },
    overrides: { ...(run.overrides ?? {}) },
    anchors: { left: false, right: false, ...(run.anchors ?? {}) },
    ...(run.cornerClearance
      ? { cornerClearance: { ...run.cornerClearance } }
      : {}),
    items: run.items.map((item) => ({ ...item })),
  };
}

function cloneRoom(room) {
  return {
    ...room,
    wallOrder: [...(room.wallOrder ?? [])],
    profile: { ...room.profile },
    walls: room.walls.map((wall) => ({
      ...wall,
      name: wall.name ?? '',
      numberOverride: wall.numberOverride ?? null,
      profile: { ...(wall.profile ?? {}) },
      connections: {
        start: wall.connections?.start ? { ...wall.connections.start } : null,
        end: wall.connections?.end ? { ...wall.connections.end } : null,
      },
      runs: wall.runs.map(cloneRun),
    })),
  };
}

/**
 * Shift unanchored run x values so geometry edits keep their plan positions fixed.
 *
 * @param {object} oldRoom
 * @param {object} newRoom
 * @returns {object}
 */
export function compensateRuns(oldRoom, newRoom) {
  const oldWalls = new Map(oldRoom.walls.map((wall) => [wall.id, wall]));
  return {
    ...newRoom,
    walls: newRoom.walls.map((wall) => {
      const oldWall = oldWalls.get(wall.id);
      if (!oldWall) return wall;
      const oldFrame = wallFrame(oldRoom, oldWall);
      const newFrame = wallFrame(newRoom, wall);
      const shift = dot(subtract(newFrame.leftPoint, oldFrame.leftPoint), newFrame.r);
      if (Math.abs(shift) <= 1e-9) return wall;
      return {
        ...wall,
        runs: (wall.runs ?? []).map((run) => (
          run.anchors?.left ? run : { ...run, x: run.x - shift }
        )),
      };
    }),
  };
}

/** Return per-side flex-filler minimums for a run in its room context. */
export function endMinWidthsForRun(room, wall, run, settings) {
  return Object.fromEntries(['left', 'right'].map((side) => {
    const corner = cornerAt(room, wall, side);
    return [
      side,
      run.anchors?.[side] && corner.type === 'inside'
        ? cornerFillerMin(settings, corner.angle)
        : settings.fillerMinWidth,
    ];
  }));
}

/** Return per-side corner angles for anchored inside-corner fillers. */
export function endCornerAnglesForRun(room, wall, run) {
  return Object.fromEntries(['left', 'right'].map((side) => {
    const corner = cornerAt(room, wall, side);
    return [
      side,
      run.anchors?.[side] && corner.type === 'inside' ? corner.angle : undefined,
    ];
  }));
}

/**
 * Resolve all stored horizontal, vertical, and automatic-item geometry in a room.
 *
 * @param {object} room
 * @param {object} settings
 * @returns {object}
 */
export function syncRoom(room, settings) {
  let nextRoom = cloneRoom(room);

  nextRoom.wallOrder = computeWallOrder(nextRoom, nextRoom.wallOrder ?? []);

  nextRoom = {
    ...nextRoom,
    walls: nextRoom.walls.map((wall) => {
      const length = wallLength(wall);
      return {
        ...wall,
        runs: wall.runs.map((run) => {
          const reserveLeft = cornerReserve(nextRoom, wall, 'left', run, settings);
          const reserveRight = cornerReserve(nextRoom, wall, 'right', run, settings);
          const horizontal = resolveHorizontal(
            run,
            length,
            reserveLeft,
            reserveRight,
            settings,
          );
          return { ...run, x: horizontal.x, width: horizontal.width };
        }),
      };
    }),
  };

  nextRoom = {
    ...nextRoom,
    walls: nextRoom.walls.map((wall) => {
      const profile = resolveProfile(settings, nextRoom, wall);
      const runs = wall.runs.map(cloneRun);
      for (const typeId of [
        CABINET_TYPE_IDS.BASE,
        CABINET_TYPE_IDS.TALL,
        CABINET_TYPE_IDS.UPPER,
      ]) {
        for (let index = 0; index < runs.length; index += 1) {
          const run = runs[index];
          if (run.cabinetTypeId !== typeId || run.heightMode === 'manual') continue;
          const vertical = resolveVertical(
            run,
            profile,
            runs.filter((candidate) => candidate.cabinetTypeId === CABINET_TYPE_IDS.BASE),
            wall,
          );
          runs[index] = { ...run, z: vertical.z, height: vertical.height };
        }
      }
      return { ...wall, runs };
    }),
  };

  nextRoom = {
    ...nextRoom,
    walls: nextRoom.walls.map((wall) => ({
      ...wall,
      runs: wall.runs.map((run) => syncAutoItems(run, settings, {
        endMinWidths: endMinWidthsForRun(nextRoom, wall, run, settings),
      })),
    })),
  };

  return nextRoom;
}

/**
 * Combine layout, height, anchor, placement, and footprint diagnostics by run id.
 *
 * @returns {Record<string, {warnings:object[], errors:object[]} >}
 */
export function roomDiagnostics(room, settings) {
  const synced = syncRoom(room, settings);
  const diagnostics = {};
  for (const wall of synced.walls) {
    const profile = resolveProfile(settings, synced, wall);
    const length = wallLength(wall);
    const bases = wall.runs.filter((run) => run.cabinetTypeId === CABINET_TYPE_IDS.BASE);
    const resolvedWall = { ...wall, length };
    for (const run of wall.runs) {
      const minimums = endMinWidthsForRun(synced, wall, run, settings);
      const layout = splitRun(run, settings, {
        endMinWidths: minimums,
        endCornerAngles: endCornerAnglesForRun(synced, wall, run),
      });
      const vertical = resolveVertical(run, profile, bases, wall);
      const horizontal = resolveHorizontal(
        run,
        length,
        cornerReserve(synced, wall, 'left', run, settings),
        cornerReserve(synced, wall, 'right', run, settings),
        settings,
      );
      const placement = validateRunPlacement(resolvedWall, run, settings);
      const overhang = {
        code: 'overhang',
        left: Math.max(0, -run.x),
        right: Math.max(0, run.x + run.width - length),
      };
      diagnostics[run.id] = {
        warnings: [
          ...layout.warnings,
          ...vertical.warnings,
          ...(overhang.left > 0 || overhang.right > 0 ? [overhang] : []),
        ],
        errors: [
          ...layout.errors,
          ...vertical.errors,
          ...horizontal.errors,
          ...(placement.ok ? [] : [{ code: placement.reason }]),
        ],
      };
    }
  }
  for (const collision of findCollisions(synced, settings)) {
    diagnostics[collision.runId]?.warnings.push(collision);
  }
  return diagnostics;
}

/**
 * Resolve and validate adding a run to a room without mutating the input.
 *
 * @returns {{ok:boolean,reason:string|null,room:object}}
 */
export function tryPlaceRun(room, wallId, run, settings) {
  const temporary = cloneRoom(room);
  const wall = temporary.walls.find((candidate) => candidate.id === wallId);
  if (!wall) return { ok: false, reason: 'wall-not-found', room };
  wall.runs.push(cloneRun(run));
  const synced = syncRoom(temporary, settings);
  const resolvedWall = synced.walls.find((candidate) => candidate.id === wallId);
  const resolvedRun = resolvedWall.runs.find((candidate) => candidate.id === run.id);
  const validation = validateRunPlacement(
    { ...resolvedWall, length: wallLength(resolvedWall) },
    resolvedRun,
    settings,
  );
  return { ...validation, room: synced };
}

/**
 * Stretch one run edge, resolve its room geometry, and validate the result.
 *
 * @returns {{ok:boolean,reason:string|null,room:object}}
 */
export function stretchRun(room, wallId, runId, side, newEdgeX, settings) {
  if (side !== 'left' && side !== 'right') {
    return { ok: false, reason: 'invalid-side', room };
  }
  const sourceWall = room.walls.find((wall) => wall.id === wallId);
  const sourceRun = sourceWall?.runs.find((run) => run.id === runId);
  if (!sourceWall || !sourceRun || !Number.isFinite(newEdgeX)) {
    return { ok: false, reason: 'run-not-found', room };
  }

  const length = wallLength(sourceWall);
  const reserveLeft = cornerReserve(room, sourceWall, 'left', sourceRun, settings);
  const reserveRight = cornerReserve(room, sourceWall, 'right', sourceRun, settings);
  const insideCorner = cornerAt(room, sourceWall, side).type === 'inside';
  const candidates = [
    { value: 0, anchor: side === 'left' && insideCorner },
    { value: length, anchor: side === 'right' && insideCorner },
    { value: reserveLeft, anchor: side === 'left' && insideCorner },
    { value: length - reserveRight, anchor: side === 'right' && insideCorner },
    ...sourceWall.runs
      .filter((run) => run.id !== runId)
      .flatMap((run) => [
        { value: run.x, anchor: false },
        { value: run.x + run.width, anchor: false },
      ]),
  ];

  let edge = roundTo(newEdgeX, 0.5);
  let snapped = null;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate.value - edge);
    if (distance > STRETCH_EDGE_SNAP_DISTANCE + 1e-9) continue;
    if (!snapped
      || distance < snapped.distance - 1e-9
      || (Math.abs(distance - snapped.distance) <= 1e-9
        && candidate.anchor && !snapped.anchor)) {
      snapped = { ...candidate, distance };
    }
  }
  if (snapped) edge = snapped.value;

  const fixedEdge = side === 'left' ? sourceRun.x + sourceRun.width : sourceRun.x;
  const unclampedEdge = edge;
  edge = side === 'left'
    ? Math.min(edge, fixedEdge - settings.minRunWidth)
    : Math.max(edge, fixedEdge + settings.minRunWidth);
  const maxRunOverhang = settings.maxRunOverhang ?? DEFAULT_SETTINGS.maxRunOverhang;
  if (edge < -maxRunOverhang || edge > length + maxRunOverhang) {
    return { ok: false, reason: 'out-of-bounds', room };
  }
  const anchorsAtSnap = Boolean(
    snapped?.anchor && Math.abs(edge - unclampedEdge) <= 1e-9,
  );
  const proposed = {
    ...sourceRun,
    x: side === 'left' ? edge : sourceRun.x,
    width: side === 'left' ? fixedEdge - edge : edge - fixedEdge,
    anchors: { ...sourceRun.anchors, [side]: anchorsAtSnap },
    ends: {
      left: { ...sourceRun.ends.left },
      right: { ...sourceRun.ends.right },
    },
  };
  if (anchorsAtSnap && cornerAt(room, sourceWall, side).type === 'inside') {
    proposed.ends[side] = { type: 'filler', width: null };
  }

  const temporary = cloneRoom(room);
  const wall = temporary.walls.find((candidate) => candidate.id === wallId);
  const runIndex = wall.runs.findIndex((candidate) => candidate.id === runId);
  wall.runs[runIndex] = cloneRun(proposed);
  const synced = syncRoom(temporary, settings);
  const resolvedWall = synced.walls.find((candidate) => candidate.id === wallId);
  const resolvedRun = resolvedWall.runs.find((candidate) => candidate.id === runId);
  const validation = validateRunPlacement(
    { ...resolvedWall, length: wallLength(resolvedWall) },
    resolvedRun,
    settings,
  );
  return validation.ok
    ? { ok: true, reason: null, room: synced }
    : { ok: false, reason: validation.reason, room };
}

/** Mirror a wall's elevation-facing state and stored run intent. */
export function flipRunsForWall(wall) {
  const length = wallLength(wall);
  return {
    ...wall,
    flipped: !wall.flipped,
    runs: wall.runs.map((run) => ({
      ...run,
      x: length - run.x - run.width,
      ends: { left: { ...run.ends.right }, right: { ...run.ends.left } },
      anchors: { left: run.anchors.right, right: run.anchors.left },
      ...(run.cornerClearance
        ? {
            cornerClearance: {
              left: run.cornerClearance.right,
              right: run.cornerClearance.left,
            },
          }
        : {}),
      items: [...run.items].reverse().map((item) => ({ ...item })),
    })),
  };
}

/** Return a wall with its derived elevation length for legacy elevation consumers. */
export function resolveWall(room, wall) {
  return wall ? { ...wall, length: wallFrame(room, wall).length } : null;
}
