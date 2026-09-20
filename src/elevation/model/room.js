import { v4 as uuid } from 'uuid';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from './constants.js';
import {
  cornerAt,
  cornerFillerMin,
  cornerReserve,
  cornerReserveParts,
  resolveHorizontal,
} from './corners.js';
import { findCollisions } from './footprints.js';
import {
  isJointAnchor,
  jointEdgeX,
  jointEndTypes,
  jointMembers,
  pruneJoints,
  runShortLabel,
} from './joints.js';
import { openingGeometry, runBlocksOpening } from './openings.js';
import {
  dot,
  subtract,
  wallFrame,
  wallLength,
} from './geometry.js';
import { validateRunPlacement, verticalStart } from './overlap.js';
import { resolveProfile, resolveVertical } from './profile.js';
import { stretchedStart } from './positions.js';
import { runWidthRange, splitRun, syncAutoItems } from './splitRun.js';
import { computeWallOrder } from './topology.js';
import { formatInches, roundTo } from './units.js';

const STRETCH_EDGE_SNAP_DISTANCE = 2;
const PIN_EPSILON = 1e-6;
const JOIN_EDGE_TOLERANCE = 0.015625;
function cloneRun(run) {
  const anchors = { left: false, right: false, ...(run.anchors ?? {}) };
  return {
    ...run,
    ends: {
      left: { ...run.ends.left },
      right: { ...run.ends.right },
    },
    overrides: { ...(run.overrides ?? {}) },
    anchors: Object.fromEntries(Object.entries(anchors).map(([side, anchor]) => [
      side,
      anchor?.to === 'joint' ? { ...anchor } : anchor,
    ])),
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
      elevationForced: wall.elevationForced ?? false,
      profile: { ...(wall.profile ?? {}) },
      connections: {
        start: wall.connections?.start ? { ...wall.connections.start } : null,
        end: wall.connections?.end ? { ...wall.connections.end } : null,
      },
      openings: (wall.openings ?? []).map((opening) => ({
        ...opening,
        casing: opening.casing ? { ...opening.casing } : null,
      })),
      joints: (wall.joints ?? []).map((joint) => ({ ...joint })),
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
        joints: (wall.joints ?? []).map((joint) => ({
          ...joint,
          x: joint.x - shift,
        })),
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
      run.anchors?.[side] === true && corner.type === 'inside'
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
      run.anchors?.[side] === true && corner.type === 'inside' ? corner.angle : undefined,
    ];
  }));
}

function openingAnchorDatum(anchor, side, wall, length, settings) {
  const opening = (wall.openings ?? []).find(
    (candidate) => candidate.id === anchor.openingId,
  );
  if (!opening) return { error: { code: 'anchor-opening-missing', side } };
  const geometry = openingGeometry(opening, length, settings);
  const edge = anchor.edge === 'jamb' ? geometry.jamb : geometry.casing ?? geometry.jamb;
  const clearance = anchor.clearance
    ?? settings.casingClearance
    ?? DEFAULT_SETTINGS.casingClearance;
  return {
    x: side === 'left'
      ? edge.x + edge.width + clearance
      : edge.x - clearance,
    opening,
    clearance,
    edge: anchor.edge,
  };
}

/** Resolve a run anchor into an absolute wall-local datum. */
export function resolveRunAnchorDatum(room, wall, run, side, settings) {
  const anchor = run.anchors?.[side];
  const length = wallLength(wall);
  if (anchor === true) {
    const reserve = cornerReserve(room, wall, side, run, settings);
    return { x: side === 'left' ? reserve : length - reserve, type: 'corner' };
  }
  if (anchor?.to === 'opening') {
    return { ...openingAnchorDatum(anchor, side, wall, length, settings), type: 'opening' };
  }
  if (isJointAnchor(anchor)) {
    const joint = (wall.joints ?? []).find((candidate) => candidate.id === anchor.jointId);
    if (!joint) return { error: { code: 'anchor-joint-missing', side } };
    return {
      x: jointEdgeX(joint, side, anchor.offset),
      type: 'joint',
      jointId: anchor.jointId,
    };
  }
  return { x: side === 'left' ? run.x : run.x + run.width, type: 'free' };
}

/** Describe a resolved wall-end or opening anchor in shop language. */
export function describeAnchor(room, wall, run, side, settings) {
  const anchor = run.anchors?.[side];
  if (!anchor) return '';
  if (anchor?.to === 'opening') {
    const resolved = resolveRunAnchorDatum(room, wall, run, side, settings);
    if (resolved.error || !resolved.opening) return 'Anchored opening is missing';
    const amount = resolved.clearance;
    return amount < 0
      ? `${formatInches(Math.abs(amount))} into ${resolved.opening.label} ${anchor.edge}`
      : `${formatInches(amount)} clear of ${resolved.opening.label} ${anchor.edge}`;
  }
  if (isJointAnchor(anchor)) {
    const otherMember = jointMembers(wall, anchor.jointId)
      .find((member) => member.runId !== run.id || member.side !== side);
    const otherRun = wall.runs.find((candidate) => candidate.id === otherMember?.runId);
    const label = otherRun ? runShortLabel(otherRun) : 'Run';
    const offset = anchor.offset ?? 0;
    const relation = offset > 0
      ? `${formatInches(offset)} gap`
      : offset < 0 ? `${formatInches(Math.abs(offset))} past` : 'flush';
    return `Joined to ${label} · ${relation}`;
  }

  const corner = cornerAt(room, wall, side);
  const parts = cornerReserveParts(room, wall, side, run, settings);
  if (corner.type !== 'inside') {
    if (parts.source === 'auto') return 'Flush with the wall end';
    return parts.total < 0
      ? `${formatInches(Math.abs(parts.total))} past the wall end`
      : `Held back ${formatInches(parts.total)}`;
  }
  const resolved = `Reserve ${formatInches(parts.total)}`;
  if (parts.source === 'face') return `${resolved} · Face only`;
  if (parts.source === 'custom') return `${resolved} · Custom`;
  return `${resolved} (face ${formatInches(parts.face)} + back ${formatInches(parts.back)})`;
}

function horizontalResolution(room, wall, run, settings) {
  const length = wallLength(wall);
  const left = resolveRunAnchorDatum(room, wall, run, 'left', settings);
  const right = resolveRunAnchorDatum(room, wall, run, 'right', settings);
  const errors = [left.error, right.error].filter(Boolean);
  if (Boolean(run.anchors?.left) && Boolean(run.anchors?.right)
    && !left.error && !right.error && right.x < left.x) {
    errors.push({ code: 'anchor-opening-overlap' });
  }
  if (errors.length > 0) {
    return { x: run.x, width: run.width, warnings: [], errors };
  }
  const resolved = resolveHorizontal(run, length, left, right, settings);
  return { ...resolved, errors: [...errors, ...resolved.errors] };
}

function casingClearanceWarnings(run, wall, length, settings) {
  const required = settings.casingClearance ?? DEFAULT_SETTINGS.casingClearance;
  if (!(required > 0)) return [];
  const runBottom = verticalStart(run);
  const runTop = run.z + run.height;
  return (wall.openings ?? []).flatMap((opening) => {
    const geometry = openingGeometry(opening, length, settings);
    if (Math.min(runTop, geometry.jamb.z + geometry.jamb.height)
      - Math.max(runBottom, geometry.jamb.z) <= PIN_EPSILON) return [];
    const casing = geometry.casing ?? geometry.jamb;
    const candidates = [];
    if (!run.anchors?.right && run.x + run.width <= casing.x + PIN_EPSILON) {
      const gap = casing.x - (run.x + run.width);
      if (gap < required - PIN_EPSILON) candidates.push({ side: 'left', gap });
    }
    const casingRight = casing.x + casing.width;
    if (!run.anchors?.left && run.x >= casingRight - PIN_EPSILON) {
      const gap = run.x - casingRight;
      if (gap < required - PIN_EPSILON) candidates.push({ side: 'right', gap });
    }
    return candidates.map(({ side, gap }) => ({
      code: 'casing-clearance',
      openingId: opening.id,
      label: opening.label,
      side,
      gap,
      required,
    }));
  });
}

/** Resolve a stored cabinet pin to a wall-local target coordinate. */
export function resolvePinTarget(pin, wall, wallLengthValue, settings) {
  if (!pin || !Number.isFinite(pin.value)) return null;
  if (pin.from === 'left') return pin.value;
  if (pin.from === 'right') return wallLengthValue - pin.value;
  if (pin.from !== 'opening' || typeof pin.openingId !== 'string') return null;
  const opening = (wall.openings ?? []).find((candidate) => candidate.id === pin.openingId);
  if (!opening) return null;
  const geometry = openingGeometry(opening, wallLengthValue, settings);
  const anchors = {
    center: geometry.jamb.x + geometry.jamb.width / 2,
    'casing-left': (geometry.casing ?? geometry.jamb).x,
    'casing-right': (geometry.casing ?? geometry.jamb).x
      + (geometry.casing ?? geometry.jamb).width,
    'jamb-left': geometry.jamb.x,
    'jamb-right': geometry.jamb.x + geometry.jamb.width,
  };
  const datum = anchors[pin.openingAnchor];
  return Number.isFinite(datum) ? datum + pin.value : null;
}

/** Resolve all usable pin targets for a run. */
export function pinTargetsForRun(run, wall, wallLengthValue, settings) {
  return Object.fromEntries(run.items.flatMap((item) => {
    const target = resolvePinTarget(item.pin, wall, wallLengthValue, settings);
    return Number.isFinite(target) ? [[item.id, target]] : [];
  }));
}

function storedEndMinimum(end, settings) {
  if (end.type === 'end_panel') return end.width ?? settings.endPanelThickness;
  if (end.type === 'filler') return end.width ?? settings.fillerMinWidth;
  return 0;
}

function storedItemsMinimum(items, settings) {
  return items.reduce((sum, item) => (
    sum + (item.width ?? (item.kind === 'cabinet' ? settings.minCabinetWidth : 0))
  ), 0);
}

function pinLeft(target, width, anchor) {
  if (anchor === 'center') return target - width / 2;
  if (anchor === 'right') return target - width;
  return target;
}

function validGrowth(run, wall, wallLengthValue, settings) {
  return validateRunPlacement({ ...wall, length: wallLengthValue }, run, settings).ok;
}

function growLeft(run, desiredX, wall, wallLengthValue, settings) {
  if (desiredX >= run.x - PIN_EPSILON || run.anchors?.left) return run;
  const maxOverhang = settings.maxRunOverhang ?? DEFAULT_SETTINGS.maxRunOverhang;
  const boundedX = Math.max(-maxOverhang, desiredX);
  const right = run.x + run.width;
  const candidate = { ...run, x: boundedX, width: right - boundedX };
  if (validGrowth(candidate, wall, wallLengthValue, settings)) return candidate;
  let invalid = boundedX;
  let valid = run.x;
  for (let index = 0; index < 48; index += 1) {
    const middle = (invalid + valid) / 2;
    const attempt = { ...run, x: middle, width: right - middle };
    if (validGrowth(attempt, wall, wallLengthValue, settings)) valid = middle;
    else invalid = middle;
  }
  return { ...run, x: valid, width: right - valid };
}

function growRight(run, desiredRight, wall, wallLengthValue, settings) {
  const currentRight = run.x + run.width;
  if (desiredRight <= currentRight + PIN_EPSILON || run.anchors?.right) return run;
  const maxOverhang = settings.maxRunOverhang ?? DEFAULT_SETTINGS.maxRunOverhang;
  const boundedRight = Math.min(wallLengthValue + maxOverhang, desiredRight);
  const candidate = { ...run, width: boundedRight - run.x };
  if (validGrowth(candidate, wall, wallLengthValue, settings)) return candidate;
  let valid = currentRight;
  let invalid = boundedRight;
  for (let index = 0; index < 48; index += 1) {
    const middle = (valid + invalid) / 2;
    const attempt = { ...run, width: middle - run.x };
    if (validGrowth(attempt, wall, wallLengthValue, settings)) valid = middle;
    else invalid = middle;
  }
  return { ...run, width: valid - run.x };
}

/** Grow free outer run ends when that can make the first or last pin reachable. */
export function resolvePinnedSpan(run, wall, wallLengthValue, settings, pinTargets) {
  const pinned = run.items
    .map((item, itemIndex) => ({ item, itemIndex, target: pinTargets[item.id] }))
    .filter(({ item, target }) => item.kind === 'cabinet'
      && item.pin
      && Number.isFinite(target));
  if (pinned.length === 0) {
    if (!run._pinWidths) return run;
    const { _pinWidths, ...withoutPinWidths } = run;
    void _pinWidths;
    return withoutPinWidths;
  }

  const pass1 = splitRun(run, settings, { pinTargets: {} });
  const pieces = new Map(pass1.pieces.map((piece) => [piece.id, piece]));
  const pinWidths = Object.fromEntries(pinned.map(({ item }) => [
    item.id,
    item.width ?? run._pinWidths?.[item.id] ?? pieces.get(item.id)?.width ?? 0,
  ]));
  const first = pinned[0];
  const last = pinned[pinned.length - 1];
  const firstWidth = pinWidths[first.item.id];
  const lastWidth = pinWidths[last.item.id];
  const leftMinimum = storedEndMinimum(run.ends.left, settings)
    + storedItemsMinimum(run.items.slice(0, first.itemIndex), settings);
  const rightMinimum = storedEndMinimum(run.ends.right, settings)
    + storedItemsMinimum(run.items.slice(last.itemIndex + 1), settings);

  let resolved = growLeft(
    run,
    pinLeft(first.target, firstWidth, first.item.pin.anchor) - leftMinimum,
    wall,
    wallLengthValue,
    settings,
  );
  resolved = growRight(
    resolved,
    pinLeft(last.target, lastWidth, last.item.pin.anchor) + lastWidth + rightMinimum,
    wall,
    wallLengthValue,
    settings,
  );
  return { ...resolved, _pinWidths: pinWidths };
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
  nextRoom.walls = nextRoom.walls.map(pruneJoints);

  nextRoom.wallOrder = computeWallOrder(nextRoom, nextRoom.wallOrder ?? []);

  nextRoom = {
    ...nextRoom,
    walls: nextRoom.walls.map((wall) => {
      return {
        ...wall,
        runs: wall.runs.map((run) => {
          const horizontal = horizontalResolution(nextRoom, wall, run, settings);
          return { ...run, x: horizontal.x, width: horizontal.width };
        }),
      };
    }),
  };

  nextRoom = {
    ...nextRoom,
    walls: nextRoom.walls.map((wall) => {
      const length = wallLength(wall);
      return {
        ...wall,
        runs: wall.runs.map((run) => resolvePinnedSpan(
          run,
          wall,
          length,
          settings,
          pinTargetsForRun(run, wall, length, settings),
        )),
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
    walls: nextRoom.walls.map((wall) => {
      const endTypes = jointEndTypes(wall);
      return {
        ...wall,
        runs: wall.runs.map((run) => ({
          ...run,
          ends: Object.fromEntries(Object.entries(run.ends).map(([side, end]) => [
            side,
            isJointAnchor(run.anchors?.[side]) && end.auto === true
              ? { type: endTypes.get(run.id)[side], width: null, auto: true }
              : end,
          ])),
        })),
      };
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
        pinTargets: pinTargetsForRun(run, wall, length, settings),
      });
      const vertical = resolveVertical(run, profile, bases, wall);
      const horizontal = horizontalResolution(synced, wall, run, settings);
      const placement = validateRunPlacement(resolvedWall, run, settings);
      const overhang = {
        code: 'overhang',
        left: Math.max(0, -run.x),
        right: Math.max(0, run.x + run.width - length),
      };
      const blockedOpenings = (wall.openings ?? [])
        .filter((opening) => runBlocksOpening(run, opening, resolvedWall, settings))
        .map((opening) => ({
          code: 'blocks-opening',
          openingId: opening.id,
          label: opening.label,
        }));
      diagnostics[run.id] = {
        warnings: [
          ...layout.warnings,
          ...run.items.flatMap((item) => (
            item.pin && resolvePinTarget(item.pin, wall, length, settings) === null
              ? [{
                  code: 'pin-unresolved',
                  pieceId: item.id,
                  message: 'Pinned opening no longer exists.',
                }]
              : []
          )),
          ...vertical.warnings,
          ...(overhang.left > 0 || overhang.right > 0 ? [overhang] : []),
          ...blockedOpenings,
          ...casingClearanceWarnings(run, wall, length, settings),
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

function runEdgeX(run, side) {
  return side === 'left' ? run.x : run.x + run.width;
}

function runsOverlapVertically(a, b) {
  return Math.min(a.z + a.height, b.z + b.height)
    - Math.max(verticalStart(a), verticalStart(b)) > 0;
}

function withoutAuto(end) {
  const { auto, ...manualEnd } = end;
  void auto;
  return manualEnd;
}

/** Join one run edge to another edge or to its existing joint. */
export function joinEdges(room, wallId, source, target, settings) {
  const validSide = (side) => side === 'left' || side === 'right';
  if (!validSide(source?.side) || !validSide(target?.side)) {
    return { ok: false, reason: 'run-not-found', room };
  }
  if (source.runId === target.runId) {
    return { ok: false, reason: 'joint-same-run', room };
  }

  const resolvedRoom = syncRoom(room, settings);
  const sourceWall = resolvedRoom.walls.find((wall) => wall.id === wallId);
  const sourceRun = sourceWall?.runs.find((run) => run.id === source.runId);
  const targetRun = sourceWall?.runs.find((run) => run.id === target.runId);
  if (!sourceWall || !sourceRun || !targetRun) {
    return { ok: false, reason: 'run-not-found', room };
  }

  const targetAnchor = targetRun.anchors?.[target.side];
  if (targetAnchor && !isJointAnchor(targetAnchor)) {
    return { ok: false, reason: 'joint-target-anchored', room };
  }

  const jointId = isJointAnchor(targetAnchor) ? targetAnchor.jointId : uuid();
  const otherSide = source.side === 'left' ? 'right' : 'left';
  if (sourceRun.anchors?.[otherSide]?.jointId === jointId) {
    return { ok: false, reason: 'joint-same-run', room };
  }
  const jointX = isJointAnchor(targetAnchor)
    ? sourceWall.joints.find((joint) => joint.id === jointId)?.x
    : runEdgeX(targetRun, target.side);
  if (!Number.isFinite(jointX)) {
    return { ok: false, reason: 'run-not-found', room };
  }

  const temporary = cloneRoom(resolvedRoom);
  const wall = temporary.walls.find((candidate) => candidate.id === wallId);
  const mutableSource = wall.runs.find((run) => run.id === source.runId);
  const mutableTarget = wall.runs.find((run) => run.id === target.runId);
  if (!isJointAnchor(targetAnchor)) {
    wall.joints ??= [];
    wall.joints.push({ id: jointId, x: jointX });
    mutableTarget.anchors[target.side] = { to: 'joint', jointId, offset: 0 };
  }
  const otherEdge = runEdgeX(mutableSource, otherSide);
  mutableSource.x = source.side === 'left' ? jointX : otherEdge;
  mutableSource.width = source.side === 'left' ? otherEdge - jointX : jointX - otherEdge;
  mutableSource.anchors[source.side] = { to: 'joint', jointId, offset: 0 };
  mutableSource.ends[source.side] = { ...mutableSource.ends[source.side], auto: true };
  mutableTarget.ends[target.side] = { ...mutableTarget.ends[target.side], auto: true };

  const synced = syncRoom(temporary, settings);
  const resolvedWall = synced.walls.find((candidate) => candidate.id === wallId);
  const resolvedSource = resolvedWall.runs.find((run) => run.id === source.runId);
  const validation = validateRunPlacement(
    { ...resolvedWall, length: wallLength(resolvedWall) },
    resolvedSource,
    settings,
  );
  return validation.ok
    ? { ok: true, reason: null, room: synced }
    : { ok: false, reason: validation.reason, room };
}

/** Join both touching sides of a newly placed run, preferring existing joints. */
export function joinTouchingEdges(room, wallId, runId, settings) {
  let nextRoom = syncRoom(room, settings);
  const joined = [];

  for (const side of ['left', 'right']) {
    const wall = nextRoom.walls.find((candidate) => candidate.id === wallId);
    const run = wall?.runs.find((candidate) => candidate.id === runId);
    if (!wall || !run) return { ok: false, reason: 'run-not-found', room, joined };
    if (run.anchors?.[side]) continue;
    const opposite = side === 'left' ? 'right' : 'left';
    const edge = runEdgeX(run, side);
    const candidates = wall.runs
      .filter((candidate) => candidate.id !== runId && runsOverlapVertically(run, candidate))
      .map((candidate) => ({
        run: candidate,
        anchor: candidate.anchors?.[opposite],
      }))
      .filter(({ run: candidate, anchor }) => (
        Math.abs(runEdgeX(candidate, opposite) - edge) <= JOIN_EDGE_TOLERANCE
        && (!anchor || isJointAnchor(anchor))
      ))
      .sort((a, b) => Number(isJointAnchor(b.anchor)) - Number(isJointAnchor(a.anchor)));
    const target = candidates[0]?.run;
    if (!target) continue;
    const result = joinEdges(
      nextRoom,
      wallId,
      { runId, side },
      { runId: target.id, side: opposite },
      settings,
    );
    if (!result.ok) return { ...result, joined };
    nextRoom = result.room;
    joined.push({ runId: target.id, side: opposite });
  }

  return { ok: true, reason: null, room: nextRoom, joined };
}

/** Disconnect every member of a joint without moving any run edge. */
export function dissolveJoint(room, wallId, jointId, settings) {
  const temporary = cloneRoom(syncRoom(room, settings));
  const wall = temporary.walls.find((candidate) => candidate.id === wallId);
  const joint = wall?.joints?.find((candidate) => candidate.id === jointId);
  if (!wall || !joint) return { ok: false, reason: 'joint-not-found', room };

  for (const member of jointMembers(wall, jointId)) {
    const run = wall.runs.find((candidate) => candidate.id === member.runId);
    run.anchors[member.side] = false;
    run.ends[member.side] = withoutAuto(run.ends[member.side]);
  }
  wall.joints = wall.joints.filter((candidate) => candidate.id !== jointId);
  return { ok: true, reason: null, room: syncRoom(temporary, settings) };
}

/** Resize a run, moving joined sides through their joints as needed. */
export function resizeRun(room, wallId, runId, width, grow, settings) {
  if (!Number.isFinite(width) || width <= 0 || !['left', 'both', 'right'].includes(grow)) {
    return { ok: false, reason: 'invalid-width', room };
  }
  const resolvedRoom = syncRoom(room, settings);
  const wall = resolvedRoom.walls.find((candidate) => candidate.id === wallId);
  const run = wall?.runs.find((candidate) => candidate.id === runId);
  if (!wall || !run) return { ok: false, reason: 'run-not-found', room };

  const desiredLeft = stretchedStart(run.x, run.width, width, grow);
  const desiredRight = desiredLeft + width;
  let nextRoom = resolvedRoom;
  for (const side of ['left', 'right']) {
    const anchor = run.anchors?.[side];
    if (!isJointAnchor(anchor)) continue;
    const desiredEdge = side === 'left' ? desiredLeft : desiredRight;
    if (Math.abs(desiredEdge - runEdgeX(run, side)) <= PIN_EPSILON) continue;
    const jointX = side === 'right'
      ? desiredEdge + (anchor.offset ?? 0)
      : desiredEdge - (anchor.offset ?? 0);
    const moved = moveJoint(nextRoom, wallId, anchor.jointId, jointX, settings);
    if (!moved.ok) return { ok: false, reason: moved.reason, room };
    nextRoom = moved.room;
  }

  const nextWall = nextRoom.walls.find((candidate) => candidate.id === wallId);
  const nextRun = nextWall.runs.find((candidate) => candidate.id === runId);
  const leftJoined = isJointAnchor(nextRun.anchors?.left);
  const rightJoined = isJointAnchor(nextRun.anchors?.right);
  if (!leftJoined || !rightJoined) {
    const temporary = cloneRoom(nextRoom);
    const mutableWall = temporary.walls.find((candidate) => candidate.id === wallId);
    const mutableRun = mutableWall.runs.find((candidate) => candidate.id === runId);
    if (leftJoined) {
      mutableRun.width = width;
    } else if (rightJoined) {
      mutableRun.x = runEdgeX(mutableRun, 'right') - width;
      mutableRun.width = width;
    } else {
      mutableRun.x = desiredLeft;
      mutableRun.width = width;
    }
    const synced = syncRoom(temporary, settings);
    const syncedWall = synced.walls.find((candidate) => candidate.id === wallId);
    const syncedRun = syncedWall.runs.find((candidate) => candidate.id === runId);
    const validation = validateRunPlacement(
      { ...syncedWall, length: wallLength(syncedWall) },
      syncedRun,
      settings,
    );
    if (!validation.ok) return { ok: false, reason: validation.reason, room };
    nextRoom = synced;
  }

  return { ok: true, reason: null, room: nextRoom };
}

function jointXRange(resolvedRoom, wall, jointId, settings, { excludeRunId = null } = {}) {
  const members = jointMembers(wall, jointId);
  const runsById = new Map(wall.runs.map((run) => [run.id, run]));
  const length = wallLength(wall);
  const maxRunOverhang = settings.maxRunOverhang ?? DEFAULT_SETTINGS.maxRunOverhang;
  let min = -Infinity;
  let max = Infinity;
  let minLimit = null;
  let maxLimit = null;
  const constrainMin = (value, limit) => {
    if (value > min) {
      min = value;
      minLimit = limit;
    }
  };
  const constrainMax = (value, limit) => {
    if (value < max) {
      max = value;
      maxLimit = limit;
    }
  };

  for (const member of members) {
    if (member.runId === excludeRunId) continue;
    const run = runsById.get(member.runId);
    if (!run) continue;
    const offset = member.offset ?? 0;
    const widthRange = runWidthRange(run, settings, {
      endMinWidths: endMinWidthsForRun(resolvedRoom, wall, run, settings),
    });
    const rigid = Number.isFinite(widthRange.max);
    const widthLimit = { runId: run.id, reason: rigid ? 'fixed-width' : 'min-width' };
    const wallLimit = { runId: run.id, reason: 'wall-bounds' };

    if (member.side === 'right') {
      const otherEdge = run.x;
      constrainMin(otherEdge + widthRange.min + offset, widthLimit);
      if (rigid) constrainMax(otherEdge + widthRange.max + offset, widthLimit);
      constrainMin(-maxRunOverhang + offset, wallLimit);
      constrainMax(length + maxRunOverhang + offset, wallLimit);
    } else {
      const otherEdge = run.x + run.width;
      constrainMax(otherEdge - widthRange.min - offset, widthLimit);
      if (rigid) constrainMin(otherEdge - widthRange.max - offset, widthLimit);
      constrainMin(-maxRunOverhang - offset, wallLimit);
      constrainMax(length + maxRunOverhang - offset, wallLimit);
    }
  }

  return { min, max, minLimit, maxLimit };
}

/** Move a wall joint within the width and wall limits of all its member runs. */
export function moveJoint(room, wallId, jointId, x, settings) {
  if (!Number.isFinite(x)) {
    return {
      ok: false,
      reason: 'joint-not-found',
      room,
      x,
      range: null,
      limit: null,
    };
  }

  const resolvedRoom = syncRoom(room, settings);
  const sourceWall = resolvedRoom.walls.find((wall) => wall.id === wallId);
  const sourceJoint = sourceWall?.joints?.find((joint) => joint.id === jointId);
  if (!sourceWall || !sourceJoint) {
    return {
      ok: false,
      reason: 'joint-not-found',
      room,
      x,
      range: null,
      limit: null,
    };
  }

  const members = jointMembers(sourceWall, jointId);
  const { min, max, minLimit, maxLimit } = jointXRange(
    resolvedRoom,
    sourceWall,
    jointId,
    settings,
  );
  const range = { min, max };
  if (min > max + PIN_EPSILON) {
    return {
      ok: false,
      reason: 'over-constrained',
      room,
      x: sourceJoint.x,
      range,
      limit: null,
    };
  }

  const clampedX = Math.max(min, Math.min(x, max));
  const limit = x < min ? minLimit : x > max ? maxLimit : null;
  const temporary = cloneRoom(resolvedRoom);
  const wall = temporary.walls.find((candidate) => candidate.id === wallId);
  const joint = wall.joints.find((candidate) => candidate.id === jointId);
  joint.x = clampedX;
  for (const member of members) {
    const runIndex = wall.runs.findIndex((run) => run.id === member.runId);
    if (runIndex < 0) continue;
    const run = wall.runs[runIndex];
    const edge = jointEdgeX(joint, member.side, member.offset);
    const otherEdge = member.side === 'right' ? run.x : run.x + run.width;
    wall.runs[runIndex] = {
      ...run,
      x: member.side === 'left' ? edge : otherEdge,
      width: member.side === 'left' ? otherEdge - edge : edge - otherEdge,
    };
  }
  const synced = syncRoom(temporary, settings);
  const resolvedWall = synced.walls.find((candidate) => candidate.id === wallId);
  const memberIds = new Set(members.map((member) => member.runId));

  for (const member of members) {
    const resolvedRun = resolvedWall.runs.find((run) => run.id === member.runId);
    const validation = validateRunPlacement({
      ...resolvedWall,
      length: wallLength(resolvedWall),
      runs: resolvedWall.runs.filter((run) => (
        run.id === member.runId || !memberIds.has(run.id)
      )),
    }, resolvedRun, settings);
    if (!validation.ok) {
      return {
        ok: false,
        reason: validation.reason,
        room,
        x: clampedX,
        range,
        limit,
      };
    }
  }

  return {
    ok: true,
    reason: null,
    room: synced,
    x: clampedX,
    range,
    limit,
  };
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
  const jointAnchor = sourceRun.anchors?.[side];
  if (isJointAnchor(jointAnchor)) {
    const offset = jointAnchor.offset ?? 0;
    const jointX = side === 'right' ? newEdgeX + offset : newEdgeX - offset;
    return moveJoint(room, wallId, jointAnchor.jointId, jointX, settings);
  }

  const length = wallLength(sourceWall);
  const reserveLeft = cornerReserve(room, sourceWall, 'left', sourceRun, settings);
  const reserveRight = cornerReserve(room, sourceWall, 'right', sourceRun, settings);
  const candidates = [
    { value: 0, anchor: side === 'left' },
    { value: length, anchor: side === 'right' },
    { value: reserveLeft, anchor: side === 'left' },
    { value: length - reserveRight, anchor: side === 'right' },
    ...sourceWall.runs
      .filter((run) => run.id !== runId)
      .flatMap((run) => [
        { value: run.x, anchor: false, runId: run.id, side: 'left' },
        { value: run.x + run.width, anchor: false, runId: run.id, side: 'right' },
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
  if (anchorsAtSnap) {
    const inside = cornerAt(room, sourceWall, side).type === 'inside';
    if (inside) proposed.ends[side] = { type: 'filler', width: null };
    else if (proposed.ends[side].type !== 'end_panel') {
      proposed.ends[side] = { type: 'end_panel', width: null };
    }
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
  if (!validation.ok) return { ok: false, reason: validation.reason, room };

  const snappedRun = snapped?.runId
    ? resolvedWall.runs.find((candidate) => candidate.id === snapped.runId)
    : null;
  const buttingRunEdge = snappedRun
    && snapped.side !== side
    && Math.abs(edge - unclampedEdge) <= PIN_EPSILON
    && runsOverlapVertically(resolvedRun, snappedRun);
  if (buttingRunEdge) {
    const joined = joinEdges(
      synced,
      wallId,
      { runId, side },
      { runId: snapped.runId, side: snapped.side },
      settings,
    );
    if (joined.ok) {
      return {
        ok: true,
        reason: null,
        room: joined.room,
        joined: { runId: snapped.runId, side: snapped.side },
      };
    }
  }
  return { ok: true, reason: null, room: synced };
}

/**
 * Move a run along its wall without changing its width, snapping either edge to the
 * same candidates stretchRun snaps to, then resolve and validate the room.
 *
 * @returns {{ok:boolean,reason:string|null,room:object,snap:{value:number,edge:string}|null}}
 */
export function moveRun(room, wallId, runId, newX, settings) {
  const sourceWall = room.walls.find((wall) => wall.id === wallId);
  const sourceRun = sourceWall?.runs.find((run) => run.id === runId);
  if (!sourceWall || !sourceRun || !Number.isFinite(newX)) {
    return { ok: false, reason: 'run-not-found', room, snap: null };
  }
  const anchors = [sourceRun.anchors?.left, sourceRun.anchors?.right];
  if (anchors.some((anchor) => anchor && !isJointAnchor(anchor))) {
    return { ok: false, reason: 'anchored', room, snap: null };
  }

  if (!anchors.some(isJointAnchor)) {
    const length = wallLength(sourceWall);
    const candidates = [
      0,
      length,
      cornerReserve(room, sourceWall, 'left', sourceRun, settings),
      length - cornerReserve(room, sourceWall, 'right', sourceRun, settings),
      ...sourceWall.runs
        .filter((run) => run.id !== runId)
        .flatMap((run) => [run.x, run.x + run.width]),
    ];

    let x = roundTo(newX, 0.5);
    let snap = null;
    for (const candidate of candidates) {
      for (const edge of ['left', 'right']) {
        const edgeX = edge === 'left' ? x : x + sourceRun.width;
        const distance = Math.abs(candidate - edgeX);
        if (distance > STRETCH_EDGE_SNAP_DISTANCE + 1e-9) continue;
        if (snap && distance >= snap.distance - 1e-9) continue;
        snap = { value: candidate, edge, distance };
      }
    }
    if (snap) x = snap.edge === 'left' ? snap.value : snap.value - sourceRun.width;

    const maxRunOverhang = settings.maxRunOverhang ?? DEFAULT_SETTINGS.maxRunOverhang;
    if (x < -maxRunOverhang || x + sourceRun.width > length + maxRunOverhang) {
      return { ok: false, reason: 'out-of-bounds', room, snap: null };
    }

    const temporary = cloneRoom(room);
    const wall = temporary.walls.find((candidate) => candidate.id === wallId);
    const runIndex = wall.runs.findIndex((candidate) => candidate.id === runId);
    wall.runs[runIndex] = cloneRun({ ...sourceRun, x });
    const synced = syncRoom(temporary, settings);
    const resolvedWall = synced.walls.find((candidate) => candidate.id === wallId);
    const resolvedRun = resolvedWall.runs.find((candidate) => candidate.id === runId);
    const validation = validateRunPlacement(
      { ...resolvedWall, length: wallLength(resolvedWall) },
      resolvedRun,
      settings,
    );
    return validation.ok
      ? {
          ok: true,
          reason: null,
          room: synced,
          snap: snap ? { value: snap.value, edge: snap.edge } : null,
          x,
          range: null,
          limit: null,
          joints: false,
        }
      : { ok: false, reason: validation.reason, room, snap: null };
  }

  const resolvedRoom = syncRoom(room, settings);
  const resolvedWall = resolvedRoom.walls.find((wall) => wall.id === wallId);
  const resolvedRun = resolvedWall.runs.find((run) => run.id === runId);
  const jointIds = [...new Set(['left', 'right']
    .map((side) => resolvedRun.anchors?.[side])
    .filter(isJointAnchor)
    .map((anchor) => anchor.jointId))];
  const joints = jointIds.map((jointId) => ({
    joint: resolvedWall.joints.find((joint) => joint.id === jointId),
    members: jointMembers(resolvedWall, jointId),
  }));
  const movingEdges = new Map();
  for (const { members } of joints) {
    for (const member of members) {
      if (member.runId === runId) continue;
      if (!movingEdges.has(member.runId)) movingEdges.set(member.runId, new Set());
      movingEdges.get(member.runId).add(member.side);
    }
  }

  const length = wallLength(resolvedWall);
  const candidates = [
    0,
    length,
    cornerReserve(resolvedRoom, resolvedWall, 'left', resolvedRun, settings),
    length - cornerReserve(resolvedRoom, resolvedWall, 'right', resolvedRun, settings),
    ...resolvedWall.runs
      .filter((run) => run.id !== runId)
      .flatMap((run) => {
        const edges = movingEdges.get(run.id);
        return [
          ...(edges?.has('left') ? [] : [run.x]),
          ...(edges?.has('right') ? [] : [run.x + run.width]),
        ];
      }),
  ];

  let x = roundTo(newX, 0.5);
  let snap = null;
  for (const candidate of candidates) {
    for (const edge of ['left', 'right']) {
      const edgeX = edge === 'left' ? x : x + resolvedRun.width;
      const distance = Math.abs(candidate - edgeX);
      if (distance > STRETCH_EDGE_SNAP_DISTANCE + 1e-9) continue;
      if (snap && distance >= snap.distance - 1e-9) continue;
      snap = { value: candidate, edge, distance };
    }
  }
  if (snap) x = snap.edge === 'left' ? snap.value : snap.value - resolvedRun.width;

  let min = -Infinity;
  let max = Infinity;
  let minLimit = null;
  let maxLimit = null;
  const constrainMin = (value, limit) => {
    if (value > min) {
      min = value;
      minLimit = limit;
    }
  };
  const constrainMax = (value, limit) => {
    if (value < max) {
      max = value;
      maxLimit = limit;
    }
  };
  for (const { joint } of joints) {
    const jointRange = jointXRange(
      resolvedRoom,
      resolvedWall,
      joint.id,
      settings,
      { excludeRunId: runId },
    );
    constrainMin(jointRange.min - joint.x, jointRange.minLimit);
    constrainMax(jointRange.max - joint.x, jointRange.maxLimit);
  }
  const maxRunOverhang = settings.maxRunOverhang ?? DEFAULT_SETTINGS.maxRunOverhang;
  const wallLimit = { runId, reason: 'wall-bounds' };
  constrainMin(-maxRunOverhang - resolvedRun.x, wallLimit);
  constrainMax(length + maxRunOverhang - (resolvedRun.x + resolvedRun.width), wallLimit);

  const range = { min, max };
  if (min > max + PIN_EPSILON) {
    return {
      ok: false,
      reason: 'over-constrained',
      room,
      snap: null,
      x: resolvedRun.x,
      range,
      limit: null,
      joints: true,
    };
  }

  const requestedDx = x - resolvedRun.x;
  const dx = Math.max(min, Math.min(requestedDx, max));
  const movedX = resolvedRun.x + dx;
  const limit = requestedDx < min ? minLimit : requestedDx > max ? maxLimit : null;
  const temporary = cloneRoom(resolvedRoom);
  const wall = temporary.walls.find((candidate) => candidate.id === wallId);
  for (const { joint: sourceJoint, members } of joints) {
    const joint = wall.joints.find((candidate) => candidate.id === sourceJoint.id);
    joint.x += dx;
    for (const member of members) {
      if (member.runId === runId) continue;
      const memberIndex = wall.runs.findIndex((run) => run.id === member.runId);
      if (memberIndex < 0) continue;
      const memberRun = wall.runs[memberIndex];
      const edge = jointEdgeX(joint, member.side, member.offset);
      const otherEdge = member.side === 'right'
        ? memberRun.x
        : memberRun.x + memberRun.width;
      wall.runs[memberIndex] = {
        ...memberRun,
        x: member.side === 'left' ? edge : otherEdge,
        width: member.side === 'left' ? otherEdge - edge : edge - otherEdge,
      };
    }
  }
  const runIndex = wall.runs.findIndex((run) => run.id === runId);
  wall.runs[runIndex] = cloneRun({ ...wall.runs[runIndex], x: movedX, width: resolvedRun.width });
  const synced = syncRoom(temporary, settings);
  const syncedWall = synced.walls.find((candidate) => candidate.id === wallId);
  const affectedIds = new Set([
    runId,
    ...joints.flatMap(({ members }) => members.map((member) => member.runId)),
  ]);

  for (const affectedRunId of affectedIds) {
    const affectedRun = syncedWall.runs.find((run) => run.id === affectedRunId);
    const validation = validateRunPlacement({
      ...syncedWall,
      length: wallLength(syncedWall),
      runs: syncedWall.runs.filter((run) => (
        run.id === affectedRunId || !affectedIds.has(run.id)
      )),
    }, affectedRun, settings);
    if (!validation.ok) {
      return {
        ok: false,
        reason: validation.reason,
        room,
        snap: null,
        x: movedX,
        range,
        limit,
        joints: true,
      };
    }
  }

  return {
    ok: true,
    reason: null,
    room: synced,
    snap: snap ? { value: snap.value, edge: snap.edge } : null,
    x: movedX,
    range,
    limit,
    joints: true,
  };
}

/** Mirror a wall's elevation-facing state and stored run intent. */
export function flipRunsForWall(wall) {
  const length = wallLength(wall);
  return {
    ...wall,
    flipped: !wall.flipped,
    joints: (wall.joints ?? []).map((joint) => ({
      ...joint,
      x: length - joint.x,
    })),
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
    openings: (wall.openings ?? []).map((opening) => ({
      ...opening,
      offsetFrom: opening.offsetFrom === 'left' ? 'right' : 'left',
      casing: opening.casing ? { ...opening.casing } : null,
    })),
  };
}

/** Return a wall with its derived elevation length for legacy elevation consumers. */
export function resolveWall(room, wall) {
  return wall ? { ...wall, length: wallFrame(room, wall).length } : null;
}
