import { frontDepth, runBackOffset } from './corners.js';
import { wallFrame } from './geometry.js';
import { gridLeaves } from './grid.js';
import { wallSideOf, wallSideView } from './wallSides.js';

const EPSILON = 1e-6;

/** How far a mitered face frame, or back panel (SPEC-43), cuts into the panel's inside corner, front and back (SPEC-36.2). */
function panelMiters(source, panel) {
  const depth = (face) => Math.max(0, ...source.runs
    .filter((run) => panel[face].runIds.includes(run.id) && framedRun(run)
      && run._frame.wallPanels?.[panel[face].side]?.join === 'miter')
    .map((run) => run._frame.thickness), mitered(panel[face]));
  return { front: depth('front'), back: depth('back') };
}

/**
 * A face frame run (SPEC-36). A run that's only panels gets a `_frame` in an inset room too, but it
 * has no frame: it meets a wall end panel as a back panel (SPEC-43).
 */
function framedRun(run) {
  return Boolean(run._frame) && !panelRunFace(run);
}

/** How far a back panel run mitered into the panel cuts into it on one face (SPEC-43), else 0. */
function mitered(side) {
  return side.panelRun?.join === 'miter' ? side.panelRun.thickness : 0;
}

/**
 * A run that's only panels (SPEC-38), as a wall end panel meets it (SPEC-43): how far its outermost panel
 * face sits from the wall face, and that panel's thickness. Null for any other run.
 */
export function panelRunFace(run) {
  const leaves = run.grid ? gridLeaves(run.grid) : [];
  if (leaves.length === 0 || !leaves.every((leaf) => leaf.kind === 'panel')) return null;
  return leaves
    .map((leaf) => {
      const thickness = leaf.depth ?? run.depth;
      return { front: runBackOffset(run) + (leaf.align === 'back' ? thickness : run.depth), thickness };
    })
    .reduce((a, b) => (b.front > a.front ? b : a));
}

/**
 * The back panel run a wall end panel meets on one face (SPEC-43): of the panel-only runs anchored to
 * it, the one whose panel face is furthest out. Auto: mitered when that face is the end panel's depth
 * on this side, else butted. The panel's stored `frame` ('miter' or 'butt') overrides, as for a frame.
 */
function panelRunJoin(runs, depth, override) {
  const faces = runs.flatMap((run) => {
    const face = panelRunFace(run);
    return face ? [{ runId: run.id, ...face }] : [];
  });
  if (faces.length === 0) return null;
  const face = faces.reduce((a, b) => (b.front > a.front ? b : a));
  const flush = Math.abs(face.front - depth) <= EPSILON;
  return { runId: face.runId, thickness: face.thickness, join: override ?? (flush ? 'miter' : 'butt') };
}

function panelSide(room, wall, endpoint, elevationSide, width, settings) {
  const view = wallSideView(wall, elevationSide);
  const frame = wallFrame(room, view);
  const side = frame.leftEndpoint === endpoint ? 'left' : 'right';
  const runs = view.runs.filter((run) => run.anchors?.[side] === true);
  const depth = runs.reduce((deepest, run) => Math.max(deepest, frontDepth(run, settings)), 0);
  const panelRun = panelRunJoin(runs, depth, wall.endPanels?.[endpoint]?.frame);
  return {
    side,
    x: side === 'left' ? 0 : frame.length - width,
    depth,
    top: runs.reduce((top, run) => Math.max(top, run.z + run.height), 0),
    runIds: runs.map((run) => run.id),
    ...(panelRun ? { panelRun } : {}),
  };
}

export function wallEndPanels(room, wall, settings) {
  const source = wall.sideSource ?? wall;
  return ['start', 'end'].flatMap((endpoint) => {
    const stored = source.endPanels?.[endpoint];
    if (!stored || source.connections?.[endpoint] || source.landings?.[endpoint]) return [];
    const width = stored.width ?? source._endPanelThickness?.[endpoint] ?? settings.endPanelThickness;
    const front = panelSide(room, source, endpoint, 'front', width, settings);
    const back = panelSide(room, source, endpoint, 'back', width, settings);
    const top = Math.max(front.top, back.top);
    return top > 0 ? [{
      endpoint,
      width,
      top,
      thickness: source.thickness,
      front,
      back,
    }] : [];
  });
}

export function wallEndPanelPolygon(room, wall, panel) {
  const source = wall.sideSource ?? wall;
  const frame = wallFrame(room, wallSideView(source, 'front'));
  const point = (x, offset) => ({
    x: frame.leftPoint.x + frame.r.x * x + frame.n.x * offset,
    y: frame.leftPoint.y + frame.r.y * x + frame.n.y * offset,
  });
  const left = panel.front.x;
  const right = left + panel.width;
  const back = -(panel.thickness + panel.back.depth);
  const front = panel.front.depth;
  // A face frame mitered into the panel stops its inside edge at the box fronts (SPEC-36.2).
  const miter = panelMiters(source, panel);
  const inside = panel.front.side === 'left' ? right : left;
  const cut = (x, amount) => (x === inside ? amount : 0);
  return [
    point(left, back + cut(left, miter.back)),
    point(right, back + cut(right, miter.back)),
    point(right, front - cut(right, miter.front)),
    point(left, front - cut(left, miter.front)),
  ];
}

/**
 * The heights of a wall end panel left showing on one elevation (SPEC-36.2): all of it, floor to
 * top, less where a face frame run or back panel (SPEC-43) on this side is mitered over its edge.
 */
export function wallEndPanelSpans(wall, panel) {
  const side = panel[wall.side ?? 'front'];
  const covers = (wall.runs ?? [])
    .filter((run) => side.runIds.includes(run.id)
      && ((framedRun(run) && run._frame.wallPanels?.[side.side]?.join === 'miter')
        || (side.panelRun?.runId === run.id && side.panelRun.join === 'miter')))
    .map((run) => [run.z - (run._frame?.drop ?? 0), run.z + run.height])
    .sort((a, b) => a[0] - b[0]);
  const spans = [];
  let cursor = 0;
  for (const [bottom, top] of covers) {
    const end = Math.min(bottom, panel.top);
    if (end - cursor > EPSILON) spans.push({ z: cursor, height: end - cursor });
    cursor = Math.max(cursor, top);
  }
  if (panel.top - cursor > EPSILON) spans.push({ z: cursor, height: panel.top - cursor });
  return spans;
}

/**
 * Whether a face frame run (SPEC-36.2.1) or a back panel run (SPEC-43) meets this wall end panel on
 * either side, so its joint can be chosen.
 */
export function wallEndPanelFramed(wall, panel) {
  const source = wall.sideSource ?? wall;
  const ids = [...panel.front.runIds, ...panel.back.runIds];
  return Boolean(panel.front.panelRun || panel.back.panelRun)
    || source.runs.some((run) => ids.includes(run.id) && framedRun(run));
}

/**
 * Where a panel-only run is mitered into a wall end panel (SPEC-43), per side of the run as seen on its
 * own face: `{ width, thickness }` (the end panel's width, the back panel's thickness) or null.
 */
export function panelRunMiters(room, wall, run, settings) {
  const face = wallSideOf(run);
  const miters = { left: null, right: null };
  for (const panel of wallEndPanels(room, wall, settings)) {
    const side = panel[face];
    if (side.panelRun?.runId === run.id && side.panelRun.join === 'miter') {
      miters[side.side] = { width: panel.width, thickness: side.panelRun.thickness };
    }
  }
  return miters;
}

/**
 * A piece's x and width with its mitered ends (SPEC-43): a panel at a run end mitered into a wall end
 * panel runs on over that panel's width to the outside corner. Any other piece is as it is.
 */
export function miteredSpan(piece, run, miters) {
  if (piece.kind !== 'panel') return { x: piece.x, width: piece.width };
  const left = miters.left && Math.abs(piece.x - run.x) <= EPSILON ? miters.left.width : 0;
  const right = miters.right && Math.abs(piece.x + piece.width - run.x - run.width) <= EPSILON
    ? miters.right.width
    : 0;
  return { x: piece.x - left, width: piece.width + left + right };
}
