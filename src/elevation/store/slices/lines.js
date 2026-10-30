import { v4 as uuid } from 'uuid';
import { wallFrame } from '../../model/geometry.js';
import { runItems, updateRootItem } from '../../model/grid.js';
import {
  LINE_FROM,
  attachmentsTo,
  canAttach,
  nextLineLabel,
  setLineFrom,
} from '../../model/layoutLines.js';
import { itemIndexFor, syncRoomAt, wallLocation } from './helpers.js';

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
        if (value !== null && !canAttach(wall, 'column', run, value, item)) return;
        run.grid = updateRootItem(run.grid, item.id, { attach: value ?? undefined });
      }
    } else {
      return;
    }
    syncRoomAt(state, location.roomIndex);
  },
};
