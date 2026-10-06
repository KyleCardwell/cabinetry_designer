import { landingProjection, landingsOn } from './landings.js';
import { openingGeometry } from './openings.js';
import { openingPlanDepths, recessGeometry, recessesOn } from './recesses.js';
import { resolveWall } from './room.js';
import { runScene } from './runScene.js';
import { soffitFlushSides, soffitSeams, soffitsOn } from './soffits.js';
import { wallEndPanelPartKey } from './parts.js';
import { wallEndPanels } from './wallEndPanels.js';

const EPSILON = 1e-6;

/**
 * The wall's own things on one face as geometry draws them (SPEC-42.1): wall end panels, then each door
 * or window (its casing, then its opening), then soffits, recesses and projections, then wing walls.
 * Only wall end panels hide what's behind them; the rest are outlines (`opaque: false`). None has a run.
 */
export function wallParts(room, wall, side, settings) {
  const view = resolveWall(room, wall, side);
  const source = view.sideSource ?? view;
  const parts = [];
  const emit = (part) => {
    if (part.width > EPSILON && part.height > EPSILON) parts.push(part);
  };
  const outline = (id, kind, rect, back, front, extra = {}) => emit({
    id, kind, x: rect.x, z: rect.z, width: rect.width, height: rect.height, back, front,
    coversBoxEdges: false, opaque: false, ...extra,
  });

  for (const panel of wallEndPanels(room, view, settings)) {
    const mine = panel[side];
    const theirs = panel[side === 'front' ? 'back' : 'front'];
    // A face frame mitered over the panel's edge sits in front of it (SPEC-36.2, as in round 41).
    const miter = Math.max(0, ...view.runs
      .filter((run) => run._frame && mine.runIds.includes(run.id)
        && runScene(room, view, run, settings).frames.regions
          .some((region) => (region.wallPanels ?? []).some((covered) => covered.side === mine.side)))
      .map((run) => run._frame.thickness),
    // A back panel mitered into it does the same (SPEC-43).
    mine.panelRun?.join === 'miter' ? mine.panelRun.thickness : 0);
    emit({
      id: wallEndPanelPartKey(source.id, panel.endpoint),
      kind: 'wall_end_panel',
      x: mine.x,
      z: 0,
      width: panel.width,
      height: panel.top,
      back: -(panel.thickness + theirs.depth),
      front: mine.depth - miter,
      coversBoxEdges: false,
    });
  }

  for (const opening of view.openings ?? []) {
    const geometry = openingGeometry(opening, view.length, settings);
    const face = side === 'front' ? openingPlanDepths(source, opening).face : 0;
    if (geometry.casing) {
      outline(`${opening.id}:casing`, 'casing', geometry.casing, face, face + (opening.casing?.thickness ?? 0));
    }
    outline(opening.id, 'opening', geometry.jamb, face - source.thickness, face);
  }

  for (const soffit of soffitsOn(view)) {
    const flush = soffitFlushSides(room, view, soffit);
    const openEdges = ['left', 'right'].filter((edge) => flush[edge]);
    outline(soffit.id, 'soffit', {
      x: soffit.x, z: soffit.bottom, width: soffit.width, height: view.height - soffit.bottom,
    }, 0, soffit.depth, openEdges.length > 0 ? { openEdges } : {});
  }

  for (const recess of recessesOn(view)) {
    const geometry = recessGeometry(recess, view.length, view.height);
    const rect = { x: geometry.x, z: geometry.bottom, width: geometry.width, height: geometry.top - geometry.bottom };
    if (geometry.plane < 0) outline(recess.id, 'recess', rect, geometry.plane, 0);
    else outline(recess.id, 'projection', rect, 0, geometry.plane);
  }

  const seams = soffitSeams(room, view);
  for (const { wallId, a, b } of landingsOn(room, view)) {
    const landed = room.walls.find((candidate) => candidate.id === wallId);
    if (!landed) continue;
    // A soffit as deep as the wing wall runs over it: the wing wall's sides stop at its bottom.
    const sideTop = (x) => seams.find((seam) => seam.wallId === wallId && Math.abs(seam.x - x) <= EPSILON)
      ?.bottom ?? landed.height;
    outline(wallId, 'wing_wall', { x: a, z: 0, width: b - a, height: landed.height },
      0, landingProjection(room, view, wallId) ?? 0, {
        openEdges: ['left', 'right'],
        lines: [a, b].map((x) => ({ x1: x, z1: 0, x2: x, z2: sideTop(x) })),
      });
  }

  return parts;
}
