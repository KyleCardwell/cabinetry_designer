import { cellPieces } from './cells.js';
import { layoutRun } from './faceLayouts.js';
import { wallLength } from './geometry.js';
import { RUN_LABELS } from './pick.js';
import { syncRoom } from './roomSync.js';
import { moveRun } from './runMoves.js';
import { formatInches } from './units.js';
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

/** Move run `runId` once so its center sits on the target's center (SPEC-CV1 §1.3–1.4). */
export function centerRunOver(room, wallId, runId, targetKey, settings) {
  const target = centerOverTargets(room, wallId, runId, settings)
    .find((entry) => entry.key === targetKey);
  if (!target) return { ok: false, reason: 'target-not-found', room };
  const { run } = findRun(syncRoom(room, settings), wallId, runId);
  const result = moveRun(room, wallId, runId, target.center - run.width / 2, settings, { exact: true });
  if (!result.ok) return { ...result, target, off: null };
  const moved = findRun(result.room, wallId, runId).run;
  return { ...result, target, off: moved.x + moved.width / 2 - target.center };
}
