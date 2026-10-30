import { v4 as uuid } from 'uuid';
import { ATTACHABLE_KINDS } from '../../model/constants.js';
import { wallFrame } from '../../model/geometry.js';
import { runItems, updateRootItem } from '../../model/grid.js';
import {
  LINE_FROM,
  attachmentsTo,
  canAttach,
  nextLineLabel,
  setLineFrom,
} from '../../model/layoutLines.js';
import { attachOffsetHere } from '../../model/linePlacement.js';
import { ATTACH_AT, findLine, lineX, placedAt } from '../../model/layoutLines.js';
import { openingReferenceRect } from '../../model/openings.js';
import { splitOptionsForRun } from '../../model/placement.js';
import { splitRun } from '../../model/splitRun.js';
import { roundTo } from '../../model/units.js';
import { wallSideOf } from '../../model/wallSides.js';
import { itemIndexFor, settingsFor, syncRoomAt, wallLocation } from './helpers.js';

/** LL2: layout lines on a wall face and attachments to them. Data only: nothing is placed from them yet. */

const MAX_LABEL = 24;

function cleanLabel(label) {
  if (typeof label !== 'string') return null;
  const trimmed = label.trim();
  return trimmed.length >= 1 && trimmed.length <= MAX_LABEL ? trimmed : null;
}

function validValue(value) {
  return Number.isFinite(value) && value >= 0;
}

function lineIndex(wall, lineId) {
  return (wall.lines ?? []).findIndex((line) => line.id === lineId);
}

function withoutAttach(entity) {
  if (entity && 'attach' in entity) delete entity.attach;
}

const AT_FRACTION = { left: 0, center: 0.5, right: 1 };

/**
 * The run's split by piece id: as drawn (with its segment targets), or with `unplaced` the split that
 * ignores them, which is what pinning locked widths to (kept so the locked numbers don't change).
 */
function currentPieces(state, location, run, { unplaced = false } = {}) {
  const settings = settingsFor(state, location.room);
  const options = splitOptionsForRun(location.room, location.wall, run, settings);
  const layout = splitRun(run, settings, unplaced ? { ...options, pinTargets: {} } : options);
  return new Map(layout.pieces.map((piece) => [piece.id, piece]));
}

/**
 * LL4: attach a root column, doing what pinning did: auto count off, and when the run already has a
 * placed column, lock widths to the unplaced split as pinning did (a second placed column locks both, a later one itself).
 */
function attachColumn(state, location, run, item, attach) {
  const placedBefore = runItems(run).filter((candidate) => placedAt(candidate));
  const adds = !placedAt(item);
  const pieces = adds && placedBefore.length >= 1 ? currentPieces(state, location, run, { unplaced: true }) : null;
  run.grid = updateRootItem(run.grid, item.id, { attach });
  run.autoCount = false;
  if (!pieces) return;
  const lock = placedBefore.length === 1 ? [...placedBefore, item] : [item];
  const step = settingsFor(state, location.room).roundTo;
  for (const placed of lock) {
    const width = pieces.get(placed.id)?.width;
    if (Number.isFinite(width) && width > 0) run.grid = updateRootItem(run.grid, placed.id, { width: roundTo(width, step) });
  }
}

/** A new line on `side` through face point `x`, measured from the nearer end. */
function lineThrough(wall, side, x, length, id) {
  const from = x <= length / 2 ? 'left' : 'right';
  return {
    id,
    label: nextLineLabel(wall, side),
    ...(side === 'back' ? { wallSide: 'back' } : {}),
    from,
    value: from === 'left' ? x : length - x,
  };
}

function columnLocation(state, payload) {
  const location = wallLocation(state, payload);
  const run = location?.wall.runs.find((candidate) => candidate.id === payload.runId);
  const item = run ? runItems(run)[itemIndexFor(run, payload.itemId)] : null;
  if (!item || !ATTACHABLE_KINDS.has(item.kind) || item.pin) return null;
  return { location, run, item };
}

export const lineReducers = {
  addLayoutLine: {
    reducer(state, action) {
      const { wallSide, from, value, label, id } = action.payload;
      if (!LINE_FROM.includes(from) || !validValue(value)) return;
      if (wallSide !== undefined && wallSide !== 'front' && wallSide !== 'back') return;
      const location = wallLocation(state, action.payload);
      if (!location) return;
      const side = wallSide === 'back' ? 'back' : 'front';
      const line = {
        id,
        label: cleanLabel(label) ?? nextLineLabel(location.wall, side),
        ...(side === 'back' ? { wallSide: 'back' } : {}),
        from,
        value,
      };
      location.wall.lines = [...(location.wall.lines ?? []), line];
      syncRoomAt(state, location.roomIndex);
    },
    prepare(payload = {}) {
      return { payload: { ...payload, id: payload.id ?? uuid() } };
    },
  },

  updateLayoutLine(state, action) {
    const { lineId, label, from, value } = action.payload;
    const location = wallLocation(state, action.payload);
    if (!location) return;
    const index = lineIndex(location.wall, lineId);
    if (index === -1) return;
    if (from !== undefined && !LINE_FROM.includes(from)) return;
    if (value !== undefined && !validValue(value)) return;
    let line = { ...location.wall.lines[index] };
    if (from !== undefined) line = setLineFrom(line, from, wallFrame(location.room, location.wall).length);
    if (value !== undefined) line = { ...line, value };
    const nextLabel = label === undefined ? null : cleanLabel(label);
    if (nextLabel) line = { ...line, label: nextLabel };
    location.wall.lines[index] = line;
    syncRoomAt(state, location.roomIndex);
  },

  deleteLayoutLine(state, action) {
    const location = wallLocation(state, action.payload);
    if (!location) return;
    const { lineId } = action.payload;
    const index = lineIndex(location.wall, lineId);
    if (index === -1) return;
    const { wall } = location;
    for (const target of attachmentsTo(wall, lineId)) {
      if (target.kind === 'opening') withoutAttach(wall.openings.find((opening) => opening.id === target.openingId));
      const run = wall.runs.find((candidate) => candidate.id === target.runId);
      if (target.kind === 'run') withoutAttach(run);
      if (target.kind === 'column') run.grid = updateRootItem(run.grid, target.itemId, { attach: undefined });
    }
    wall.lines.splice(index, 1);
    syncRoomAt(state, location.roomIndex);
  },

  /** LL3: a new front line through an opening's `at` point (measured from the opening's own end), attached; nothing moves. */
  attachOpeningToNewLine: {
    reducer(state, action) {
      const { openingId, at = 'center', id } = action.payload;
      if (!ATTACH_AT.includes(at)) return;
      const location = wallLocation(state, action.payload);
      const opening = location?.wall.openings?.find((candidate) => candidate.id === openingId);
      if (!opening) return;
      const length = wallFrame(location.room, location.wall).length;
      const point = attachOffsetHere(
        opening, { from: 'left', value: 0 }, at, length, settingsFor(state, location.room),
      );
      const from = opening.offsetFrom === 'right' ? 'right' : 'left';
      const line = {
        id,
        label: nextLineLabel(location.wall, 'front'),
        from,
        value: from === 'left' ? point : length - point,
      };
      location.wall.lines = [...(location.wall.lines ?? []), line];
      opening.attach = { lineId: id, at, offset: 0 };
      syncRoomAt(state, location.roomIndex);
    },
    prepare(payload = {}) {
      return { payload: { ...payload, id: payload.id ?? uuid() } };
    },
  },

  /** LL4: a new line on the run's face through a column's current `at` point, attached; nothing moves. */
  attachColumnToNewLine: {
    reducer(state, action) {
      const { at = 'center', id } = action.payload;
      if (!ATTACH_AT.includes(at)) return;
      const found = columnLocation(state, action.payload);
      if (!found) return;
      const { location, run, item } = found;
      const piece = currentPieces(state, location, run).get(item.id);
      if (!piece) return;
      const side = wallSideOf(run);
      const length = wallFrame(location.room, location.wall).length;
      const line = lineThrough(location.wall, side, piece.x + AT_FRACTION[at] * piece.width, length, id);
      location.wall.lines = [...(location.wall.lines ?? []), line];
      attachColumn(state, location, run, item, { lineId: id, at, offset: 0 });
      syncRoomAt(state, location.roomIndex);
    },
    prepare(payload = {}) {
      return { payload: { ...payload, id: payload.id ?? uuid() } };
    },
  },

  /** LL4 "Centre on W1": the column's centre goes on the opening's centre and follows it. */
  attachColumnToOpening: {
    reducer(state, action) {
      const { openingId, id } = action.payload;
      const found = columnLocation(state, action.payload);
      if (!found) return;
      const { location, run, item } = found;
      const { wall } = location;
      const opening = wall.openings?.find((candidate) => candidate.id === openingId);
      if (!opening) return;
      const side = wallSideOf(run);
      const length = wallFrame(location.room, wall).length;
      const rect = openingReferenceRect(opening, length, settingsFor(state, location.room));
      const frontCentre = rect.x + rect.width / 2;
      const centre = side === 'back' ? length - frontCentre : frontCentre;
      if (opening.attach) {
        const line = findLine(wall, opening.attach.lineId);
        if (!line) return;
        if (wallSideOf(line) !== side) {
          state.message = `${opening.label ?? 'The opening'} is on a ${wallSideOf(line)}-face line. Attach the cabinet to a line on this face.`;
          return;
        }
        attachColumn(state, location, run, item, { lineId: line.id, at: 'center', offset: centre - lineX(line, length) });
      } else {
        wall.lines = [...(wall.lines ?? []), lineThrough(wall, side, centre, length, id)];
        opening.attach = { lineId: id, at: 'center', offset: 0 };
        attachColumn(state, location, run, item, { lineId: id, at: 'center', offset: 0 });
      }
      syncRoomAt(state, location.roomIndex);
    },
    prepare(payload = {}) {
      return { payload: { ...payload, id: payload.id ?? uuid() } };
    },
  },

  setAttachment(state, action) {
    const { target, attach } = action.payload;
    const location = wallLocation(state, action.payload);
    if (!location || !target) return;
    const { wall } = location;
    const value = attach ? { lineId: attach.lineId, at: attach.at, offset: attach.offset } : null;
    if (attach && Object.keys(attach).some((key) => !['lineId', 'at', 'offset'].includes(key))) return;

    if (target.kind === 'opening') {
      const opening = (wall.openings ?? []).find((candidate) => candidate.id === target.openingId);
      if (!opening) return;
      if (value === null) withoutAttach(opening);
      else if (canAttach(wall, 'opening', opening, value)) opening.attach = value;
      else return;
    } else if (target.kind === 'run' || target.kind === 'column') {
      const run = wall.runs.find((candidate) => candidate.id === target.runId);
      if (!run) return;
      if (target.kind === 'run') {
        if (value === null) withoutAttach(run);
        else if (canAttach(wall, 'run', run, value)) run.attach = value;
        else return;
      } else {
        const item = runItems(run)[itemIndexFor(run, target.itemId)];
        if (!item) return;
        if (value === null) run.grid = updateRootItem(run.grid, item.id, { attach: undefined });
        else if (canAttach(wall, 'column', run, value, item)) attachColumn(state, location, run, item, value);
        else return;
      }
    } else {
      return;
    }
    syncRoomAt(state, location.roomIndex);
  },
};
