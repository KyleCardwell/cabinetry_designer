import { frontDepth, runBackOffset } from './corners.js';
import { isLeg, legWarningSubject, runLegList } from './endLegs.js';
import { legBottom, legShapeOf } from './legSupport.js';
import { resolveShape, shapeView } from './libraryShapes.js';
import { resolveWall } from './room.js';
import { shapeOutlines, transformOutline } from './sectionProfileOutline.js';
import { formatInches } from './units.js';
import { wallSideOf } from './wallSides.js';

export { legBottom, legShapeOf } from './legSupport.js';

const EPS = 1e-6;

/** Stored legs are non-empty, with ids unique within the list (and checked across the room by the store). */
export function isLegList(value) {
  if (!Array.isArray(value) || !value.length) return false;
  const ids = new Set();
  return Array.from(value).every((leg) => {
    if (!isLeg(leg) || ids.has(leg.id)) return false;
    ids.add(leg.id);
    return true;
  });
}

/** Drawn placements only. The array's `warnings` also retains warnings for skipped legs. */
export function runLegs(room, wall, run, settings) {
  const placed = Object.assign([], { warnings: [] });
  const view = resolveWall(room, wall, wall.side ?? wallSideOf(run));
  if (view.side !== wallSideOf(run)) return placed;
  const F = frontDepth(run, settings);
  const B = runBackOffset(run);
  runLegList(run).forEach((leg) => {
    const subject = legWarningSubject(run, leg);
    const warnings = [];
    const warn = (warning) => {
      const entry = { ...warning, ...subject, legId: leg.id };
      warnings.push(entry);
      placed.warnings.push(entry);
    };
    const shape = legShapeOf(leg, settings);
    const width = shape?.box.w ?? 0;
    const u0 = leg.wall
      ? (leg.from === 'left' ? leg.wall.endX - leg.x : leg.wall.endX + leg.x - width)
      : (leg.from === 'left' ? run.x - leg.x : run.x + run.width + leg.x - width);
    const bottom = legBottom(room, view, run, settings, leg, u0, width);
    const z0 = bottom.z;
    const H = leg.height === 'full' ? run.z + run.height - z0 : leg.height === 'feet' ? run.z - z0 : leg.height;
    if (!shape) warn({ code: 'leg-shape-missing' });
    if (bottom.warning) warn(bottom.warning);
    if (H <= EPS) warn({ code: 'leg-no-height', ...(leg.sitsOn ? { sitsOn: leg.sitsOn } : {}) });
    if (!shape || H <= EPS) return;
    const resolved = resolveShape(shape, { h: H });
    const b = resolved.shape.box;
    resolved.warnings.forEach((warning) => warn({ ...warning, height: b.h }));
    if (!shape.stretch.z?.length && Math.abs(H - b.h) > EPS) {
      warn({ code: 'leg-fixed-height', height: b.h });
    }
    // x and y: + = outside the run (past its end / proud of the doors / past its back), − = into it (Kyle 2026-11-05).
    const t0 = leg.yFrom === 'front' ? -leg.y : F - B + leg.y - b.d;
    const mirror = leg.mirror === true;
    const mirrorDepth = leg.mirrorDepth === true;
    const toY = (py) => F - t0 - (mirrorDepth ? b.y + b.d - py : py - b.y);
    const toX = (px) => u0 + (mirror ? b.x + b.w - px : px - b.x);
    const toFront = ([px, pz]) => [toX(px), pz - b.z + z0];
    const [x, z] = toFront([resolved.origin.x, resolved.origin.z]);
    placed.push({
      leg, ...subject, shapeName: shape.name, stretched: resolved.stretched,
      bounds: { x: u0, z: z0, width: b.w, height: b.h },
      front: F - t0, back: F - t0 - b.d,
      outlines: shapeOutlines(resolved.shape.views.front).map(({ closed, outline }) => ({
        closed, outline: transformOutline(outline, toFront, mirror),
      })),
      insert: { x, z },
      plan: {
        top: z0 + b.h,
        loops: shapeOutlines(shapeView(resolved.shape, 'plan')).map(({ closed, outline }) => ({
          closed,
          points: transformOutline(outline, ([px, py]) => [toX(px), toY(py)], !mirror !== mirrorDepth),
        })),
      },
      size: { w: b.w, h: b.h, d: b.d }, warnings,
    });
  });
  return placed;
}

/** Presets append these placements in corner order; ids come from the caller. */
export function legPreset(preset, { shapeId, square, height = 'full', sitsOn, proud = 0, backOffset = 0, leaveOut }, newId) {
  const corners = { four: ['LF', 'LB', 'RF', 'RB'], front: ['LF', 'RF'],
    three: ['LF', 'LB', 'RF', 'RB'].filter((corner) => corner !== leaveOut),
    left: ['LF', 'LB'], right: ['RF', 'RB'] };
  return (corners[preset] ?? []).map((corner) => ({
    id: newId(), ...(square ? { square: { ...square } } : { shapeId }),
    height, from: corner[0] === 'L' ? 'left' : 'right', x: 0,
    yFrom: corner[1] === 'F' ? 'front' : 'back',
    y: corner[1] === 'F' ? proud : backOffset,
    ...(sitsOn ? { sitsOn } : {}),
    ...(corner[0] === 'L' ? { mirror: true } : {}),
    ...(corner[1] === 'B' ? { mirrorDepth: true } : {}),
  }));
}

export function legWarningText({ code, index, name, target, fixed, height, sitsOn, type }) {
  const who = name ?? `Leg ${index}`;
  if (code === 'wall-leg-no-run') return `${who}: no run on that face stops at this end.`;
  if (code === 'wall-panel-no-depth') return `${who}: no room between the legs (they touch or overlap). Drawn inside the legs.`;
  if (code === 'wall-panel-no-height') return `${who}: it has no height. Drawn inside the legs.`;
  if (code === 'leg-fill-return-short') return `${who}: its panel return is no deeper than the panel's thickness.`;
  if (code === 'leg-fill-no-depth') return `${who}: no room for its ${type} (the legs touch or overlap).`;
  if (code === 'leg-fill-no-height') return `${who}: its ${type} has no height.`;
  if (code === 'leg-shape-missing') return `${who}: its shape isn't in the library.`;
  if (code === 'leg-no-height') return sitsOn
    ? `${who} has no height (the run sits on what the leg stands on).`
    : `${who} has no height (the run sits on the floor).`;
  if (code === 'leg-no-base') return `${who}: the run has no furniture base. Drawn from the floor.`;
  if (code === 'leg-no-countertop') return `${who}: no countertop below it. Drawn from the floor.`;
  if (code === 'shape-too-small') {
    return `${who} can't be ${formatInches(target)} tall: its fixed parts are ${formatInches(fixed)}. Drawn at ${formatInches(height)}.`;
  }
  if (code === 'leg-fixed-height') return `${who} doesn't stretch: drawn at its own height, ${formatInches(height)}.`;
  return '';
}
