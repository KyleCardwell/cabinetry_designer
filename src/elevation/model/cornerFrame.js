import { cellPieces } from './cells.js';
import { DEFAULT_SETTINGS } from './constants.js';
import { cornerEnd } from './cornerEnd.js';
import { cornerReturnRuns } from './corners.js';
import { runFaceLayouts } from './faceLayouts.js';
import { frameMembers, frameRegions } from './frames.js';
import { frameDrop } from './styles.js';

const EPSILON = 1e-6;

/** Opening rows shared by both legs, with pair doors and side-by-side faces counted once. */
function openingRows(openings) {
  const rows = [];
  for (const { z, height } of openings) {
    if (!rows.some((row) => Math.abs(row.z - z) < EPSILON && Math.abs(row.height - height) < EPSILON)) {
      rows.push({ z, height });
    }
  }
  return rows.sort((a, b) => a.z - b.z);
}

/**
 * A Corner 90's separate face frame (CC6). Leg coordinates run away from the inside corner;
 * member x coordinates unfold each leg onto the owner's wall axis, identified by side A / B.
 * Optional face layouts share the caller's resolved rows; this function never changes them.
 */
export function cornerFrame(room, wall, run, side, settings, layout, faceLayouts) {
  if (!run._frame || run._frame.bead > 0) return null;
  const corner = cornerEnd(room, wall, run, side, settings, layout);
  if (!corner?.active || corner.kind !== 90 || !corner.shape || !corner.columnId) return null;

  const cells = cellPieces(run, layout);
  const frames = frameRegions(room, run, cells, settings, faceLayouts);
  const entry = (faceLayouts ?? runFaceLayouts(room, wall, run, settings, layout)).get(corner.columnId);
  if (!entry) return null;
  const rows = openingRows(entry.openings);
  const drop = frameDrop(run, settings);
  const frame = { z: run.z - drop, height: run.height + drop, thickness: run._frame.thickness };
  // Use the same cutting rule as an ordinary single-column frame, retaining just its rails.
  const rowMembers = frameMembers({ x: 0, width: 1, z: frame.z, height: frame.height },
    rows.map((row) => ({ x: 0, width: 1, ...row }))) ?? [];
  const railRows = rowMembers.filter((member) => member.kind === 'rail');
  const lap = { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame }.stile;
  const gap = settings.cornerDoorGap ?? DEFAULT_SETTINGS.cornerDoorGap;
  const ownerLaps = frames.cornerLaps.some((entry) => entry.columnId === corner.columnId && entry.side === side);
  const { corner: joint, runs: returns } = cornerReturnRuns(room, wall, run, side);
  const returnLaps = returns.some((other) => other._frame && !(other._frame.bead > 0)
    && other.ends?.[joint.neighborSide]?.type === 'none');
  const legs = [
    { id: 'A', start: corner.depthB, edge: corner.legA,
      openingStart: corner.depthB + corner.offsetB + gap, laps: ownerLaps, outer: corner.legA + lap },
    { id: 'B', start: corner.depthA + frame.thickness, edge: corner.legB,
      openingStart: corner.depthA + frame.thickness + gap, laps: returnLaps,
      outer: corner.legB + (corner.returnSide.type === 'none' ? lap : corner.returnSide.width) },
  ].map(({ id, start, edge, openingStart, laps, outer }) => {
    const end = edge - lap;
    const stileAtEnd = laps ? null : { x0: end, x1: outer };
    return {
      id, x0: start, x1: stileAtEnd?.x1 ?? end,
      rails: railRows.map(({ z, height }) => ({ p0: start, p1: end, z, height })),
      openings: rows.map((row) => ({ p0: openingStart, p1: end, ...row })),
      stileAtEnd,
    };
  });
  const memberX = (p0, p1) => corner.cornerX + corner.dir * (corner.dir === 1 ? p0 : p1);
  const members = legs.flatMap((leg) => [
    ...leg.rails.map(({ p0, p1, z, height }) => ({
      kind: 'rail', side: leg.id, x: memberX(p0, p1), z, width: p1 - p0, height, length: p1 - p0,
    })),
    ...(leg.stileAtEnd ? [{ kind: 'stile', side: leg.id,
      x: memberX(leg.stileAtEnd.x0, leg.stileAtEnd.x1), z: frame.z,
      width: leg.stileAtEnd.x1 - leg.stileAtEnd.x0, height: frame.height, length: frame.height }] : []),
  ]);
  return { columnId: corner.columnId, kind: corner.kind, side, frame, legs, members, warnings: [] };
}
