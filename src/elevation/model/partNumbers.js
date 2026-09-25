import { CABINET_TYPE_IDS } from './constants.js';
import { blindEntries, blindPartWidths } from './blind.js';
import { blindCellWidths, cellPieces, partPieces } from './cells.js';
import { wallLength } from './geometry.js';
import { resolveProfile } from './profile.js';
import {
  endCornerAnglesForRun,
  endMinWidthsForRun,
  pinTargetsForRun,
} from './room.js';
import { runMolding } from './soffits.js';
import { splitRun } from './splitRun.js';
import { wallNumbers } from './topology.js';
import { wallEndPanels } from './wallEndPanels.js';
import { WALL_SIDES, wallSideView } from './wallSides.js';

export const PART_MOLDINGS = ['toeKick', 'topMold', 'crown'];
export const MOLDING_LABELS = { toeKick: 'TK', topMold: 'TM', crown: 'CR' };
/** Horizontal slot for each molding badge: -1 left of centre, 0 centre, 1 right. */
export const MOLDING_BADGE_SLOTS = { toeKick: 0, topMold: -1, crown: 1 };

const PART_KINDS = new Set(['cabinet', 'filler', 'end_panel', 'panel', 'shelf']);
const LOWER_TYPES = new Set([CABINET_TYPE_IDS.BASE, CABINET_TYPE_IDS.TALL]);
const MOLDING_TYPES = new Set([CABINET_TYPE_IDS.UPPER, CABINET_TYPE_IDS.TALL]);

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
  if (run.heightMode !== 'auto' || !MOLDING_TYPES.has(run.cabinetTypeId)) return false;
  const resolved = runMolding(wall, run, profile);
  return molding === 'topMold' ? resolved !== 'none' : resolved === 'crown';
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
    const cellWidths = blindCellWidths(
      cells.pieces, layout.pieces, blindEntries(room, view, run, settings, layout).entries,
    );
    return partPieces(cells.pieces, settings)
      .filter((piece) => PART_KINDS.has(piece.kind) && piece.width > 1e-6)
      .map((piece) => ({
        key: piece.id,
        kind: piece.kind,
        wallId: wall.id,
        side,
        runId: run.id,
        pieceId: piece.id,
        molding: null,
        width: cellWidths.get(piece.id) ?? widths.get(piece.id) ?? piece.width,
      }));
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
  const groups = wall.runs.map((run) => ({
    key: `run:${run.id}`,
    lift: 0,
    pieces: partPieces(cellPieces(run, splitRun(run, settings, {
      endMinWidths: endMinWidthsForRun(room, wall, run, settings),
      endCornerAngles: endCornerAnglesForRun(room, wall, run),
      pinTargets: pinTargetsForRun(run, wall, wallLength(wall), settings),
    })).pieces, settings),
  })).filter((group) => group.pieces.length > 0);

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
