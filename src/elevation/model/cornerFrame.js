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

/** True-size layout along Pa → Pb; only member x unfolds onto the owner's wall axis. */
function diagonalFrame(corner, frame, rows, railRows, lap) {
  const { from: a, to: b } = corner.shape.faces[0];
  const { trueWidth, miters } = corner.shape;
  const u = [(b[0] - a[0]) / trueWidth, (b[1] - a[1]) / trueWidth];
  const width = 2 * lap;
  const stiles = ['a', 'b'].map((end) => ({ end, width,
    backWidth: width + frame.thickness * Math.tan(miters[end] * Math.PI / 180), cut: miters[end] }));
  const { feet: { a: pa, b: pb }, span: frontWidth } = corner.faceLayout;
  const p0 = width;
  const p1 = frontWidth - width;
  const rails = railRows.map(({ z, height }) => ({ p0, p1, z, height }));
  const openings = rows.map((row) => ({ p0, p1, ...row }));
  // The 3/4" box sides are bevelled to the diagonal; their inside faces are the long points.
  const thickness = 0.75;
  const hang = { a: stiles[0].backWidth - thickness / -u[0],
    b: stiles[1].backWidth - thickness / u[1] };
  const abox = a.map((value, i) => value + hang.a * u[i]);
  const bbox = b.map((value, i) => value - hang.b * u[i]);
  const box = {
    polygon: [[0, 0], [abox[0], 0], abox, bbox, [0, bbox[1]]], hang,
    sideLongPoints: {
      a: [abox[0] - thickness, abox[1] + thickness * u[1] / -u[0]],
      b: [bbox[0] + thickness * -u[0] / u[1], bbox[1] - thickness],
    },
  };
  const memberX = (start, end) => corner.cornerX
    + corner.dir * (pa[0] - (corner.dir === 1 ? end : start));
  const members = [
    ...stiles.map((stile, i) => ({ kind: 'stile', side: stile.end.toUpperCase(),
      x: memberX(i === 0 ? 0 : p1, i === 0 ? p0 : frontWidth), z: frame.z,
      width, height: frame.height, length: frame.height, backWidth: stile.backWidth, cut: stile.cut })),
    ...rails.map(({ p0, p1, z, height }) => ({ kind: 'rail', x: memberX(p0, p1),
      z, width: p1 - p0, height, length: p1 - p0 })),
  ];
  return { diagonal: { a, b, pa, pb, stiles, rails, openings, trueWidth, frontWidth, box }, members };
}

/**
 * A corner's separate face frame (CC6). Leg coordinates run away from the inside corner;
 * member x coordinates unfold each leg onto the owner's wall axis, identified by side A / B.
 * Optional face layouts share the caller's resolved rows; this function never changes them.
 */
export function cornerFrame(room, wall, run, side, settings, layout, faceLayouts) {
  if (!run._frame || run._frame.bead > 0) return null;
  const corner = cornerEnd(room, wall, run, side, settings, layout);
  if (!corner?.active || !corner.shape || !corner.columnId) return null;

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
  if (corner.kind === 45) return { columnId: corner.columnId, kind: corner.kind, side, frame,
    ...diagonalFrame(corner, frame, rows, railRows, lap), warnings: [] };
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
