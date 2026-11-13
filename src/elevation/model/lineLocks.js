import { PINNABLE_KINDS } from './constants.js';
import { runItems } from './grid.js';
import { isJointAnchor, runShortLabel } from './joints.js';
import { findLine, placedAt } from './layoutLines.js';
import { lineHeldJoints, movableRunSides } from './linePlacement.js';
import { columnSetsRunEnd } from './runPins.js';
import { wallSideOf } from './wallSides.js';

function attachedLine(wall, run, item = run) {
  const line = item.attach && findLine(wall, item.attach.lineId);
  return line && wallSideOf(line) === wallSideOf(run) ? line : null;
}

/** Free ends set by the outermost placed root columns, reading only stored structure. */
export function lineEndColumns(run, wall) {
  const items = runItems(run);
  const placed = items.filter((item) => PINNABLE_KINDS.has(item.kind) && placedAt(item)
    && (attachedLine(wall, run, item) || item.pin?.from === 'return'));
  const ends = {};
  for (const [side, item] of [['left', placed[0]], ['right', placed.at(-1)]]) {
    if (!item || !attachedLine(wall, run, item)) continue;
    const index = items.indexOf(item);
    const outerItems = side === 'left' ? items.slice(0, index) : items.slice(index + 1);
    if (columnSetsRunEnd(run, side, item, outerItems)) ends[side] = item.id;
  }
  return ends;
}

/** A held joint is positioned by its owning run's line, even before placement. */
export function jointLineLock(wall, jointId) {
  if (!wall) return null;
  const held = lineHeldJoints(wall).get(jointId);
  if (!held) return null;
  const line = findLine(wall, held.lineId);
  const run = wall.runs.find((candidate) => candidate.id === held.runId);
  return {
    reason: 'line-held-joint', lineId: line.id,
    message: `This joint follows line ${line.label} (${runShortLabel(run)}): move ${line.label}, or detach that run.`,
  };
}

/** Refuse position/size edits whose result is controlled by a layout line. */
export function runLineLock(wall, runId, action) {
  const run = wall?.runs?.find((candidate) => candidate.id === runId);
  if (!run) return null;
  const line = attachedLine(wall, run);
  const items = runItems(run);
  const lock = (reason, line, message) => ({ reason, lineId: line.id, message });
  const jointLock = (side) => {
    const anchor = run.anchors?.[side];
    return isJointAnchor(anchor) ? jointLineLock(wall, anchor.jointId) : null;
  };
  if (action === 'move') {
    if (line) return lock('line-attached', line,
      `${runShortLabel(run)} is attached to line ${line.label}: move the line, or detach.`);
    const columnLine = items.map((item) => attachedLine(wall, run, item)).find(Boolean);
    if (columnLine) return lock('line-column', columnLine,
      `A cabinet in this run is on line ${columnLine.label}: move the line, or detach it.`);
    return jointLock('left') ?? jointLock('right');
  }
  if (!['left', 'right', 'width'].includes(action)) return null;
  if (action !== 'width') {
    const heldLock = jointLock(action);
    if (heldLock) return heldLock;
  }
  const ends = lineEndColumns(run, wall);
  const endId = action === 'width' ? ends.left ?? ends.right : ends[action];
  if (endId) {
    const endLine = attachedLine(wall, run, items.find((item) => item.id === endId));
    return lock('line-end', endLine, action === 'width'
      ? `${runShortLabel(run)} gets its width from the cabinet on line ${endLine.label}: move the line, or detach the cabinet.`
      : `This end follows the cabinet on line ${endLine.label}: move the line, or detach the cabinet.`);
  }
  if (line && movableRunSides(run, lineHeldJoints(wall)).length < 2) {
    return lock('line-sized', line,
      `${runShortLabel(run)} gets its size from line ${line.label} and its anchored end: move the line, or detach.`);
  }
  if (line && run.attach.at === action) {
    return lock('line-attached-edge', line,
      `${runShortLabel(run)}'s ${action} edge is on line ${line.label}: drag the other edge, or move the line.`);
  }
  return null;
}
