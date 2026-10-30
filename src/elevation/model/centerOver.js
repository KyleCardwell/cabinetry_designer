import { cellPieces } from './cells.js';
import { layoutRun } from './faceLayouts.js';
import { ATTACHABLE_KINDS } from './constants.js';
import { wallFrame, wallLength } from './geometry.js';
import { runItems, updateRootItem } from './grid.js';
import { isJointAnchor } from './joints.js';
import { findLine, lineX, nextLineLabel, placedAt } from './layoutLines.js';
import { splitOptionsForRun } from './placement.js';
import { RUN_LABELS } from './pick.js';
import { syncRoom } from './roomSync.js';
import { splitRun } from './splitRun.js';
import { formatInches, roundTo } from './units.js';
import { wallSideOf, wallViewForRun } from './wallSides.js';

const EPSILON = 1e-6;
const CELL_KINDS = new Set(['cabinet', 'void']);

function sameRect(left, right) {
  return Math.abs(left.x - right.x) <= EPSILON
    && Math.abs(left.z - right.z) <= EPSILON
    && Math.abs(left.width - right.width) <= EPSILON
    && Math.abs(left.height - right.height) <= EPSILON;
}

function isCell(piece) {
  return CELL_KINDS.has(piece.kind) && !String(piece.role ?? '').startsWith('end');
}

function target(run, itemId, kind, rect) {
  const width = formatInches(rect.width);
  const names = { void: 'Open', cabinet: 'Cabinet', column: 'Column' };
  const label = kind === 'run'
    ? `Whole ${(RUN_LABELS[run.cabinetTypeId] ?? 'Run').toLowerCase()} · ${width}`
    : `${names[kind]} ${width}`;
  return {
    key: `${run.id}:${itemId ?? 'run'}`,
    runId: run.id,
    itemId,
    kind,
    rect,
    center: rect.x + rect.width / 2,
    label,
  };
}

function findRun(room, wallId, runId) {
  const wall = room.walls.find((candidate) => candidate.id === wallId);
  const run = wall?.runs.find((candidate) => candidate.id === runId);
  return { wall, run };
}

/** Everything run `runId` can be centered over: other same-face runs and every cell in them (SPEC-CV1 §1.1). */
export function centerOverTargets(room, wallId, runId, settings) {
  const resolved = syncRoom(room, settings);
  const { wall, run: source } = findRun(resolved, wallId, runId);
  if (!wall || !source) return [];
  const side = wallSideOf(source);
  const view = wallViewForRun(wall, source);
  const faceWall = { ...view, length: wallLength(view) };
  const targets = [];
  for (const run of wall.runs) {
    if (run.id === runId || wallSideOf(run) !== side) continue;
    targets.push(target(run, null, 'run', { x: run.x, z: run.z, width: run.width, height: run.height }));
    const layout = layoutRun(resolved, faceWall, run, settings);
    const cells = [
      ...layout.pieces.filter(isCell),
      ...cellPieces(run, layout).pieces.filter(isCell),
    ];
    const kept = [];
    for (const cell of cells) {
      const rect = { x: cell.x, z: cell.z, width: cell.width, height: cell.height };
      if (kept.some((entry) => entry.id === cell.id || sameRect(entry.rect, rect))) continue;
      kept.push({ id: cell.id, kind: cell.kind, rect });
    }
    // A root column that holds smaller cells reads as a column, not one cabinet.
    for (const cell of kept) {
      const holds = kept.some((other) => other !== cell && contains(cell.rect, other.rect)
        && contains(cell.rect, { x: other.rect.x + other.rect.width, z: other.rect.z + other.rect.height }));
      if (holds) cell.kind = 'column';
    }
    kept.sort((left, right) => (
      Math.abs(left.rect.x - right.rect.x) > EPSILON ? left.rect.x - right.rect.x : left.rect.z - right.rect.z
    ));
    targets.push(...kept.map((cell) => target(run, cell.id, cell.kind, cell.rect)));
  }
  return targets;
}

function contains(rect, point) {
  return point.x >= rect.x - EPSILON
    && point.x <= rect.x + rect.width + EPSILON
    && point.z >= rect.z - EPSILON
    && point.z <= rect.z + rect.height + EPSILON;
}

/** Targets under `point` ({ x, z }), smallest area first, whole runs last (SPEC-CV1 §1.2). */
export function targetsAt(targets, point) {
  if (!point) return [];
  return targets
    .filter((entry) => contains(entry.rect, point))
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const runOrder = (left.entry.kind === 'run') - (right.entry.kind === 'run');
      if (runOrder) return runOrder;
      const area = left.entry.rect.width * left.entry.rect.height
        - right.entry.rect.width * right.entry.rect.height;
      return Math.abs(area) > EPSILON ? area : left.index - right.index;
    })
    .map(({ entry }) => entry);
}

/** Attach a root target with the same auto-count and width locking rules as setAttachment. */
function attachTargetColumn(room, wall, run, item, attach, settings) {
  const placed = runItems(run).filter(placedAt);
  let grid = updateRootItem(run.grid, item.id, { attach });
  if (!placedAt(item) && placed.length) {
    const options = splitOptionsForRun(room, wall, run, settings);
    const pieces = splitRun(run, settings, { ...options, pinTargets: {} }).pieces;
    for (const locked of placed.length === 1 ? [...placed, item] : [item]) {
      const width = pieces.find((piece) => piece.id === locked.id)?.width;
      if (Number.isFinite(width) && width > 0) {
        grid = updateRootItem(grid, locked.id, { width: roundTo(width, settings.roundTo) });
      }
    }
  }
  return { ...run, grid, autoCount: false };
}

/** LL4: center on a shared layout line, attaching the target too when it can follow the line. */
export function centerRunOver(room, wallId, runId, targetKey, settings, { lineId } = {}) {
  const target = centerOverTargets(room, wallId, runId, settings)
    .find((entry) => entry.key === targetKey);
  if (!target) return { ok: false, reason: 'target-not-found', room };
  const resolved = syncRoom(room, settings);
  const { wall, run } = findRun(resolved, wallId, runId);
  if (['left', 'right'].some((side) => run.anchors?.[side] && !isJointAnchor(run.anchors[side]))) {
    return { ok: false, reason: 'anchored', room, target };
  }
  const targetRun = wall.runs.find((candidate) => candidate.id === target.runId);
  const item = target.itemId === null ? null : runItems(targetRun).find(({ id }) => id === target.itemId);
  const entity = target.itemId === null ? targetRun : item;
  const existing = entity?.attach && findLine(wall, entity.attach.lineId);
  const side = wallSideOf(run);
  const length = wallFrame(resolved, wall).length;
  const reuse = existing && wallSideOf(existing) === side;
  const from = target.center <= length / 2 ? 'left' : 'right';
  const line = reuse ? existing : {
    id: lineId,
    label: nextLineLabel(wall, side),
    ...(side === 'back' ? { wallSide: 'back' } : {}),
    from,
    value: from === 'left' ? target.center : length - target.center,
  };
  const targetAttached = Boolean(reuse || target.itemId === null || (item && ATTACHABLE_KINDS.has(item.kind) && !item.pin));
  const attach = { lineId: line.id, at: 'center', offset: 0 };
  const runs = wall.runs.map((candidate) => {
    if (candidate.id === runId) {
      return { ...candidate, attach: { ...attach, offset: reuse ? target.center - lineX(line, length) : 0 } };
    }
    if (candidate.id !== target.runId || reuse || !targetAttached) return candidate;
    return item ? attachTargetColumn(resolved, wall, candidate, item, attach, settings) : { ...candidate, attach };
  });
  const nextWall = { ...wall, runs, ...(!reuse ? { lines: [...(wall.lines ?? []), line] } : {}) };
  const next = { ...resolved, walls: resolved.walls.map((candidate) => candidate.id === wallId ? nextWall : candidate) };
  return { ok: true, reason: null, room: syncRoom(next, settings), target, lineId: line.id, targetAttached };
}

/** The shared success message for the store click and the canvas chooser. */
export function centerOverMessage(result) {
  const line = result.room.walls.flatMap((wall) => wall.lines ?? []).find(({ id }) => id === result.lineId);
  return result.targetAttached
    ? `Centred on ${line.label}. Move ${line.label} to move both.`
    : `Centred on ${line.label}. That cell can't attach to a line yet, so ${line.label} won't follow it.`;
}
