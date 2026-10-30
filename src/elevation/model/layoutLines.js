/**
 * Layout lines (LL2, plans/LAYOUT-PLAN.md): lines stored on a wall face, and the attachments
 * openings, runs and root columns carry to them. Data only for now: nothing places anything
 * from a line until LL3/LL4.
 *
 * line   = { id, label, wallSide?, from: 'left'|'right', value }   (measured on its own face)
 * attach = { lineId, at: 'left'|'center'|'right', offset }        (offset + = toward the face's right)
 */
import { ATTACHABLE_KINDS } from './constants.js';
import { rootItems } from './grid.js';
import { featuresOn, wallSideOf } from './wallSides.js';

export const LINE_FROM = Object.freeze(['left', 'right']);
export const ATTACH_AT = Object.freeze(['left', 'center', 'right']);

const LINE_KEYS = new Set(['id', 'label', 'wallSide', 'from', 'value']);
const ATTACH_KEYS = new Set(['lineId', 'at', 'offset']);
const MAX_LABEL = 24;

function isPlain(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** A stored layout line's shape (no extra keys). */
export function isLayoutLine(line) {
  if (!isPlain(line) || !Object.keys(line).every((key) => LINE_KEYS.has(key))) return false;
  const label = typeof line.label === 'string' ? line.label.trim() : '';
  return typeof line.id === 'string' && line.id.length > 0
    && label.length >= 1 && label.length <= MAX_LABEL
    && (line.wallSide === undefined || line.wallSide === 'front' || line.wallSide === 'back')
    && LINE_FROM.includes(line.from)
    && Number.isFinite(line.value) && line.value >= 0;
}

/** A stored attachment's shape (no extra keys). */
export function isAttachment(attach) {
  return isPlain(attach)
    && Object.keys(attach).every((key) => ATTACH_KEYS.has(key))
    && typeof attach.lineId === 'string' && attach.lineId.length > 0
    && ATTACH_AT.includes(attach.at)
    && Number.isFinite(attach.offset);
}

/**
 * LL4: where a root column is placed: its attachment's point, else its pin's anchor, else null.
 * Every "is this column placed?" check reads this, so attachments and pins act alike.
 */
export function placedAt(item) {
  return item?.attach?.at ?? item?.pin?.anchor ?? null;
}

/** The layout lines on one face of a wall (or a side view's own face). */
export function linesOn(wallOrView, side) {
  return side === undefined ? featuresOn('lines', wallOrView) : featuresOn('lines', wallOrView, side);
}

export function findLine(wall, lineId) {
  return (wall?.sideSource ?? wall)?.lines?.find((line) => line.id === lineId) ?? null;
}

/** The line's position from its face's left end. */
export function lineX(line, wallLength) {
  return line.from === 'left' ? line.value : wallLength - line.value;
}

/** Measure the line from the other end without moving it. */
export function setLineFrom(line, from, wallLength) {
  if (line.from === from || !LINE_FROM.includes(from)) return line;
  return { ...line, from, value: wallLength - line.value };
}

/** The lowest unused `L<n>` on one face; labels that aren't `L<number>` don't count. */
export function nextLineLabel(wall, side = 'front') {
  const used = new Set(linesOn(wall, side)
    .map((line) => /^L(\d+)$/.exec(line.label ?? ''))
    .filter(Boolean)
    .map((match) => Number(match[1])));
  let n = 1;
  while (used.has(n)) n += 1;
  return `L${n}`;
}

/**
 * Whether `attach` may be stored on a thing of `kind` ('opening' | 'run' | 'column') on this wall.
 * For a column `thing` is its run; pass the root `item` to also check its kind and that it has no pin.
 */
export function canAttach(wall, kind, thing, attach, item) {
  if (!isAttachment(attach)) return false;
  const line = findLine(wall, attach.lineId);
  if (!line) return false;
  if (kind === 'opening') return true;
  if (kind !== 'run' && kind !== 'column') return false;
  if (wallSideOf(line) !== wallSideOf(thing)) return false;
  if (kind === 'column' && item !== undefined) {
    return ATTACHABLE_KINDS.has(item?.kind) && !item.pin;
  }
  return true;
}

/** Everything on the wall attached to one line: openings, then each run and its root columns. */
export function attachmentsTo(wall, lineId) {
  const found = [];
  for (const opening of wall.openings ?? []) {
    if (opening.attach?.lineId === lineId) found.push({ kind: 'opening', openingId: opening.id });
  }
  for (const run of wall.runs ?? []) {
    if (run.attach?.lineId === lineId) found.push({ kind: 'run', runId: run.id });
    if (!run.grid) continue;
    for (const item of rootItems(run.grid)) {
      if (item.attach?.lineId === lineId) found.push({ kind: 'column', runId: run.id, itemId: item.id });
    }
  }
  return found;
}

function withoutAttach(entity) {
  const next = { ...entity };
  delete next.attach;
  return next;
}

/**
 * Drop attachments whose line is missing from this wall, or (runs and columns) on the other face.
 * Returns the same wall object when nothing is dropped.
 */
export function pruneLines(wall) {
  const faces = new Map((wall.lines ?? []).map((line) => [line.id, wallSideOf(line)]));
  let changed = false;
  const openings = wall.openings?.map((opening) => {
    if (!opening?.attach || faces.has(opening.attach.lineId)) return opening;
    changed = true;
    return withoutAttach(opening);
  });
  const runs = wall.runs?.map((run) => {
    const side = wallSideOf(run);
    const keeps = (attach) => faces.get(attach.lineId) === side;
    let next = run;
    if (run.attach && !keeps(run.attach)) next = withoutAttach(run);
    if (run.grid?.cols?.some((col) => col.attach && !keeps(col.attach))) {
      next = {
        ...next,
        grid: {
          ...run.grid,
          cols: run.grid.cols.map((col) => (col.attach && !keeps(col.attach) ? withoutAttach(col) : col)),
        },
      };
    }
    if (next !== run) changed = true;
    return next;
  });
  if (!changed) return wall;
  return {
    ...wall,
    ...(openings ? { openings } : {}),
    ...(runs ? { runs } : {}),
  };
}
