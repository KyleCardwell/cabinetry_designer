import { frontDepth, runBackOffset } from './corners.js';
import { resolveShape, shapeView } from './libraryShapes.js';
import { resolveWall } from './room.js';
import { shapeOutlines, transformOutline } from './sectionProfileOutline.js';
import { formatInches } from './units.js';
import { wallSideOf } from './wallSides.js';

const EPS = 1e-6;
const isText = (value) => typeof value === 'string' && value.length > 0;

/** Stored legs are non-empty, with ids unique within the list (and checked across the room by the store). */
export function isLegList(value) {
  if (!Array.isArray(value) || !value.length) return false;
  const ids = new Set();
  return Array.from(value).every((leg) => {
    if (!leg || typeof leg !== 'object' || Array.isArray(leg)
      || !isText(leg.id) || ids.has(leg.id) || !isText(leg.shapeId)
      || !['left', 'right'].includes(leg.from) || !Number.isFinite(leg.x)
      || !['front', 'back'].includes(leg.yFrom) || !Number.isFinite(leg.y)
      || !(leg.height === 'full' || leg.height === 'feet'
        || (Number.isFinite(leg.height) && leg.height > 0))
      || (leg.mirror !== undefined && leg.mirror !== true)
      || (leg.mirrorDepth !== undefined && leg.mirrorDepth !== true)) return false;
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
  (run.legs ?? []).forEach((leg, offset) => {
    const index = offset + 1;
    const warnings = [];
    const warn = (warning) => {
      const entry = { ...warning, index, legId: leg.id };
      warnings.push(entry);
      placed.warnings.push(entry);
    };
    const shape = (settings.shapes ?? []).find(({ id }) => id === leg.shapeId);
    const H = leg.height === 'full' ? run.z + run.height : leg.height === 'feet' ? run.z : leg.height;
    if (!shape) warn({ code: 'leg-shape-missing' });
    if (H <= EPS) warn({ code: 'leg-no-height' });
    if (!shape || H <= EPS) return;
    const resolved = resolveShape(shape, { h: H });
    const b = resolved.shape.box;
    resolved.warnings.forEach((warning) => warn({ ...warning, height: b.h }));
    if (!shape.stretch.z?.length && Math.abs(H - b.h) > EPS) {
      warn({ code: 'leg-fixed-height', height: b.h });
    }
    const u0 = leg.from === 'left' ? run.x - leg.x : run.x + run.width + leg.x - b.w;
    // x and y: + = outside the run (past its end / proud of the doors / past its back), − = into it (Kyle 2026-11-05).
    const t0 = leg.yFrom === 'front' ? -leg.y : F - B + leg.y - b.d;
    const mirror = leg.mirror === true;
    const mirrorDepth = leg.mirrorDepth === true;
    const toY = (py) => F - t0 - (mirrorDepth ? b.y + b.d - py : py - b.y);
    const toX = (px) => u0 + (mirror ? b.x + b.w - px : px - b.x);
    const toFront = ([px, pz]) => [toX(px), pz - b.z];
    const [x, z] = toFront([resolved.origin.x, resolved.origin.z]);
    placed.push({
      leg, index, shapeName: shape.name, stretched: resolved.stretched,
      bounds: { x: u0, z: 0, width: b.w, height: b.h },
      front: F - t0, back: F - t0 - b.d,
      outlines: shapeOutlines(resolved.shape.views.front).map(({ closed, outline }) => ({
        closed, outline: transformOutline(outline, toFront, mirror),
      })),
      insert: { x, z },
      plan: {
        top: b.h,
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
export function legPreset(preset, { shapeId, height = 'full', proud = 0, backOffset = 0, leaveOut }, newId) {
  const corners = { four: ['LF', 'LB', 'RF', 'RB'], front: ['LF', 'RF'],
    three: ['LF', 'LB', 'RF', 'RB'].filter((corner) => corner !== leaveOut),
    left: ['LF', 'LB'], right: ['RF', 'RB'] };
  return (corners[preset] ?? []).map((corner) => ({
    id: newId(), shapeId, height, from: corner[0] === 'L' ? 'left' : 'right', x: 0,
    yFrom: corner[1] === 'F' ? 'front' : 'back',
    y: corner[1] === 'F' ? proud : backOffset,
    ...(corner[0] === 'L' ? { mirror: true } : {}),
    ...(corner[1] === 'B' ? { mirrorDepth: true } : {}),
  }));
}

export function legWarningText({ code, index, target, fixed, height }) {
  if (code === 'leg-shape-missing') return `Leg ${index}: its shape isn't in the library.`;
  if (code === 'leg-no-height') return `Leg ${index} has no height (the run sits on the floor).`;
  if (code === 'shape-too-small') {
    return `Leg ${index} can't be ${formatInches(target)} tall: its fixed parts are ${formatInches(fixed)}. Drawn at ${formatInches(height)}.`;
  }
  if (code === 'leg-fixed-height') return `Leg ${index} doesn't stretch: drawn at its own height, ${formatInches(height)}.`;
  return '';
}
