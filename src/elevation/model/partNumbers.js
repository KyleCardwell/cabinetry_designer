import { CABINET_TYPE_IDS } from './constants.js';
import { runFaceLayouts } from './faceLayouts.js';
import { blindEntries, blindPartWidths } from './blind.js';
import { blindCellWidths, cellPieces, partPieces } from './cells.js';
import { frameBadgeAnchor, frameMembers, frameRegions, regionOpenings } from './frames.js';
import { wallLength } from './geometry.js';
import { resolveProfile } from './profile.js';
import {
  endCornerAnglesForRun,
  endMinWidthsForRun,
  pinTargetsForRun,
} from './room.js';
import { splitRun } from './splitRun.js';
import { teeFillers } from './tees.js';
import { runTop } from './tops.js';
import { wallNumbers } from './topology.js';
import { wallEndPanels } from './wallEndPanels.js';
import { WALL_SIDES, wallSideView } from './wallSides.js';

export const PART_MOLDINGS = ['toeKick', 'topMold', 'crown'];
export const MOLDING_LABELS = { toeKick: 'TK', topMold: 'TM', crown: 'CR' };
/** Horizontal slot for each molding badge: -1 left of centre, 0 centre, 1 right. */
export const MOLDING_BADGE_SLOTS = { toeKick: 0, topMold: -1, crown: 1 };

const PART_KINDS = new Set(['cabinet', 'filler', 'end_panel', 'panel', 'shelf']);
const LOWER_TYPES = new Set([CABINET_TYPE_IDS.BASE, CABINET_TYPE_IDS.TALL]);

export function moldingPartKey(molding) {
  return `molding:${molding}`;
}

export function wallEndPanelPartKey(wallId, endpoint) {
  return `${wallId}:endPanel:${endpoint}`;
}

function compareRuns(a, b) {
  return a.x - b.x || a.id.localeCompare(b.id);
}

function runsInWalkOrder(view) {
  const lower = view.runs.filter((run) => LOWER_TYPES.has(run.cabinetTypeId));
  const upper = view.runs.filter((run) => run.cabinetTypeId === CABINET_TYPE_IDS.UPPER);
  return [...lower.sort(compareRuns), ...upper.sort(compareRuns)];
}

function carriesMolding(wall, run, profile, molding) {
  if (molding === 'toeKick') {
    return LOWER_TYPES.has(run.cabinetTypeId)
      && (run.overrides?.toeKickHeight ?? profile.toeKickHeight) > 0;
  }
  const top = runTop(wall, run, profile).kind;
  return molding === 'topMold' ? top === 'crown' || top === 'topMold' : top === 'crown';
}

/**
 * Where a seam T goes in its run's part list (SPEC-37.3): the key of the part it follows. A vertical T
 * follows the last part of the boxes on its left (a whole stacked column), a horizontal T the first
 * of the boxes below it, so it sits between the cabinets of its seam. Null if none of them is a part.
 */
function teeAnchor(tee, parts, pieces) {
  const before = tee.boxIds
    .map((id) => pieces.find((piece) => piece.id === id))
    .filter((piece) => piece && (tee.orientation === 'vertical'
      ? piece.x + piece.width / 2 < tee.x + tee.width / 2
      : piece.z + piece.height / 2 < tee.z + tee.height / 2));
  const indexes = before
    .map((piece) => parts.findIndex((part) => part.pieceId === piece.id))
    .filter((index) => index >= 0);
  if (indexes.length === 0) return null;
  return parts[tee.orientation === 'vertical' ? Math.max(...indexes) : Math.min(...indexes)].key;
}

function runParts(room, wall, side, settings) {
  const view = wallSideView(wall, side);
  return runsInWalkOrder(view).flatMap((run) => {
    const layout = splitRun(run, settings, {
      endMinWidths: endMinWidthsForRun(room, view, run, settings),
      endCornerAngles: endCornerAnglesForRun(room, view, run),
      pinTargets: pinTargetsForRun(run, view, wallLength(view), settings),
    });
    const widths = blindPartWidths(room, view, run, settings, layout);
    const cells = cellPieces(run, layout);
    const entries = blindEntries(room, view, run, settings, layout).entries;
    const cellWidths = blindCellWidths(cells.pieces, layout.pieces, entries);
    const blindPanels = new Set(entries
      .filter((entry) => entry.panel && entry.endPieceId)
      .map((entry) => entry.endPieceId));
    const frames = frameRegions(room, run, cells, settings);
    const inFrame = frames.fillerIds;
    const { tees } = teeFillers(room, run, cells, settings);
    const teeWidths = new Map(tees.filter((tee) => tee.end).map((tee) => [tee.id, tee.partWidth]));
    const pieceParts = partPieces(cells.pieces, settings)
      .filter((piece) => PART_KINDS.has(piece.kind) && piece.width > 1e-6
        && (!inFrame.has(piece.id) || blindPanels.has(piece.id)))
      .map((piece) => ({
        key: piece.id,
        kind: piece.kind,
        wallId: wall.id,
        side,
        runId: run.id,
        pieceId: piece.id,
        molding: null,
        width: teeWidths.get(piece.id) ?? cellWidths.get(piece.id) ?? widths.get(piece.id) ?? piece.width,
      }));
    // A T-filler between boxes is a filler part of its own, numbered beside its seam (SPEC-37.3).
    const seamParts = tees.filter((tee) => !tee.end).map((tee) => ({
      anchor: teeAnchor(tee, pieceParts, cells.pieces),
      part: {
        key: tee.id,
        kind: 'filler',
        wallId: wall.id,
        side,
        runId: run.id,
        pieceId: tee.id,
        molding: null,
        width: tee.partWidth,
      },
    }));
    return [
      ...pieceParts.flatMap((part) => [
        part,
        ...seamParts.filter((entry) => entry.anchor === part.key).map((entry) => entry.part),
      ]),
      ...seamParts.filter((entry) => entry.anchor === null).map((entry) => entry.part),
      // One part per face frame, after its run's pieces (SPEC-36.2).
      ...frames.regions.map((region) => ({
        key: region.id,
        kind: 'frame',
        wallId: wall.id,
        side,
        runId: run.id,
        pieceId: null,
        molding: null,
        width: region.width,
      })),
    ];
  });
}

function wallPanelPart(wall, panel) {
  return {
    key: wallEndPanelPartKey(wall.id, panel.endpoint),
    kind: 'wall_end_panel',
    wallId: wall.id,
    side: null,
    runId: null,
    pieceId: null,
    molding: null,
    width: panel.width,
  };
}

function orderedParts(room, settings) {
  const wallById = new Map((room?.walls ?? []).map((wall) => [wall.id, wall]));
  const walls = [...wallNumbers(room).entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([wallId]) => wallById.get(wallId))
    .filter(Boolean);

  const parts = walls.flatMap((wall) => {
    const panels = wallEndPanels(room, wall, settings);
    const left = panels.filter((panel) => panel.front.side === 'left');
    const right = panels.filter((panel) => panel.front.side === 'right');
    return [
      ...left.map((panel) => wallPanelPart(wall, panel)),
      ...WALL_SIDES.flatMap((side) => runParts(room, wall, side, settings)),
      ...right.map((panel) => wallPanelPart(wall, panel)),
    ];
  });

  for (const molding of PART_MOLDINGS) {
    const present = walls.some((wall) => {
      const profile = resolveProfile(settings, room, wall);
      return wall.runs.some((run) => carriesMolding(wall, run, profile, molding));
    });
    if (present) {
      parts.push({
        key: moldingPartKey(molding),
        kind: 'molding',
        wallId: null,
        side: null,
        runId: null,
        pieceId: null,
        molding,
        width: null,
      });
    }
  }
  return parts;
}

export function partNumbers(room, settings) {
  const ordered = orderedParts(room, settings);
  const start = Number.isInteger(room?.partNumberStart) && room.partNumberStart > 0
    ? room.partNumberStart
    : 1;
  const overrides = room?.partNumberOverrides ?? {};
  const byKey = new Map();
  const taken = new Set();
  const overrideKeys = new Set();
  const claims = new Map();
  for (const part of ordered) {
    const override = overrides[part.key];
    if (!Number.isInteger(override) || override <= 0) continue;
    byKey.set(part.key, override);
    taken.add(override);
    overrideKeys.add(part.key);
    const keys = claims.get(override) ?? [];
    keys.push(part.key);
    claims.set(override, keys);
  }
  let next = start;
  for (const part of ordered) {
    if (byKey.has(part.key)) continue;
    while (taken.has(next)) next += 1;
    byKey.set(part.key, next);
    taken.add(next);
    next += 1;
  }

  const parts = ordered.map((part) => ({ ...part, number: byKey.get(part.key) }));
  const warnings = [...claims.entries()]
    .filter(([, keys]) => keys.length > 1)
    .map(([number, keys]) => ({ code: 'duplicate-part-number', number, keys }));
  return { parts, byKey, overrideKeys, warnings };
}

export function wallMoldingBadges(room, wall, settings, byKey) {
  const profile = resolveProfile(settings, room, wall);
  const runs = [...wall.runs].sort(compareRuns);
  return PART_MOLDINGS.flatMap((molding) => {
    const key = moldingPartKey(molding);
    const number = byKey.get(key);
    const run = runs.find((candidate) => carriesMolding(wall, candidate, profile, molding));
    if (!run || number === undefined) return [];
    const boxTop = run.z + run.height;
    const toeKickHeight = run.overrides?.toeKickHeight ?? profile.toeKickHeight;
    const rect = molding === 'toeKick'
      ? {
        x: run.x + Math.min(3, run.width / 2),
        z: 0,
        width: Math.max(0, run.width - 6),
        height: toeKickHeight,
      }
      : molding === 'topMold'
        ? { x: run.x, z: boxTop, width: run.width, height: profile.topMoldHeight }
        : {
          x: run.x,
          z: boxTop + profile.crownStackHeight - profile.crownHeight,
          width: run.width,
          height: profile.crownHeight,
        };
    return [{
      molding,
      slot: MOLDING_BADGE_SLOTS[molding],
      key,
      number,
      label: MOLDING_LABELS[molding],
      ...rect,
    }];
  });
}

/**
 * Every part-badge group on one elevation, in draw order.
 * Each group lays out independently, exactly as RunGroup laid one run out.
 * @returns {{key: string, lift: number, pieces: object[]}[]}
 */
export function wallBadgeGroups(room, wall, settings) {
  const groups = wall.runs.flatMap((run) => {
    const layout = splitRun(run, settings, {
      endMinWidths: endMinWidthsForRun(room, wall, run, settings),
      endCornerAngles: endCornerAnglesForRun(room, wall, run),
      pinTargets: pinTargetsForRun(run, wall, wallLength(wall), settings),
    });
    const cells = cellPieces(run, layout);
    const frames = frameRegions(room, run, cells, settings);
    const covered = new Set(frames.regions.flatMap((region) => region.fillerIds));
    const seamTees = teeFillers(room, run, cells, settings).tees.filter((tee) => !tee.end);
    let layouts = null;
    const faceLayouts = () => (layouts ??= runFaceLayouts(room, wall, run, settings, layout));
    return [
      {
        key: `run:${run.id}`,
        lift: 0,
        pieces: partPieces(cells.pieces, settings).filter((piece) => !covered.has(piece.id)),
      },
      // A T-filler between boxes badges one level up, clear of the boxes' own (SPEC-37).
      {
        key: `tees:${run.id}`,
        lift: 1,
        pieces: seamTees.map(({ id, x, z, width, height }) => ({ id, x, z, width, height })),
      },
      // Each frame's badge sits two levels up, over the stile nearest its centre (SPEC-36.2.1).
      ...frames.regions.map((region) => {
        const openings = regionOpenings(region, faceLayouts());
        return {
          key: region.id,
          lift: 2,
          pieces: [{
            id: region.id,
            x: region.x,
            z: region.z,
            width: region.width,
            height: region.height,
            anchor: frameBadgeAnchor(region, frameMembers(region, openings)),
          }],
        };
      }),
    ];
  }).filter((group) => group.pieces.length > 0);

  for (const panel of wallEndPanels(room, wall, settings)) {
    const side = panel[wall.side ?? 'front'];
    groups.push({
      key: `panel:${panel.endpoint}`,
      lift: 1,
      pieces: [{
        id: wallEndPanelPartKey(wall.id, panel.endpoint),
        x: side.x,
        z: 0,
        width: panel.width,
        height: panel.top,
      }],
    });
  }

  return groups;
}
