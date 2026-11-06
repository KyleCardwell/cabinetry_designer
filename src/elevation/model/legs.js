import { frontDepth, runBackOffset } from './corners.js';
import { isLeg } from './endLegs.js';
import { runBaseProfile } from './furnitureBase.js';
import { rectangle, resolveShape, shapeView } from './libraryShapes.js';
import { resolveProfile } from './profile.js';
import { resolveWall } from './room.js';
import { shapeOutlines, transformOutline } from './sectionProfileOutline.js';
import { isCountertop, runTop } from './tops.js';
import { formatInches } from './units.js';
import { wallSideOf } from './wallSides.js';

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

/** Library shapes and generated square legs share the same placement geometry. */
export function legShapeOf(leg, settings) {
  if (!leg.square) return (settings.shapes ?? []).find(({ id }) => id === leg.shapeId);
  const w = leg.square.w ?? settings.squareLegWidth;
  const d = leg.square.d ?? settings.squareLegDepth;
  return {
    id: 'square-leg', name: 'Square leg', kind: 'leg', archived: false, version: 1,
    box: { x: 0, y: 0, z: 0, w, h: 1, d }, stretch: { z: [[0, 1]] },
    views: {
      front: rectangle(0, 0, w, 1, 'f', 'outline'),
      plan: rectangle(0, 0, w, d, 'p', 'outline'),
      side: rectangle(0, 0, d, 1, 's', 'outline'),
    },
  };
}

/** Resolve what a leg stands on, falling back to the floor when its support is missing. */
export function legBottom(room, wall, run, settings, leg, u0, w) {
  if (leg.sitsOn === 'base') {
    const base = runBaseProfile(room, wall, run, settings);
    return base.kind === 'furniture_base'
      ? { z: base.height } : { z: 0, warning: { code: 'leg-no-base' } };
  }
  if (leg.sitsOn === 'countertop') {
    const view = resolveWall(room, wall, wall.side ?? wallSideOf(run));
    const profile = resolveProfile(settings, room, wall);
    let z;
    for (const other of view.runs) {
      if (other.id === run.id
        || Math.min(u0 + w, other.x + other.width) - Math.max(u0, other.x) <= EPS) continue;
      const top = runTop(view, other, profile);
      const surface = other.z + other.height + top.height;
      if (isCountertop(top.kind) && surface <= run.z + EPS) z = Math.max(z ?? -Infinity, surface);
    }
    return z === undefined ? { z: 0, warning: { code: 'leg-no-countertop' } } : { z };
  }
  return { z: 0 };
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
    const shape = legShapeOf(leg, settings);
    const width = shape?.box.w ?? 0;
    const u0 = leg.from === 'left' ? run.x - leg.x : run.x + run.width + leg.x - width;
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
      leg, index, shapeName: shape.name, stretched: resolved.stretched,
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
export function legPreset(preset, { shapeId, square, height = 'full', sitsOn, fill, proud = 0, backOffset = 0, leaveOut }, newId) {
  const corners = { four: ['LF', 'LB', 'RF', 'RB'], front: ['LF', 'RF'],
    three: ['LF', 'LB', 'RF', 'RB'].filter((corner) => corner !== leaveOut),
    left: ['LF', 'LB'], right: ['RF', 'RB'] };
  return (corners[preset] ?? []).map((corner) => ({
    id: newId(), ...(square ? { square: { ...square } } : { shapeId }),
    height, from: corner[0] === 'L' ? 'left' : 'right', x: 0,
    yFrom: corner[1] === 'F' ? 'front' : 'back',
    y: corner[1] === 'F' ? proud : backOffset,
    ...(sitsOn ? { sitsOn } : {}),
    ...(fill && (fill === 'filler' || corner[1] === 'F') ? { fill: { type: fill } } : {}),
    ...(corner[0] === 'L' ? { mirror: true } : {}),
    ...(corner[1] === 'B' ? { mirrorDepth: true } : {}),
  }));
}

export function legWarningText({ code, index, target, fixed, height, sitsOn, type, other }) {
  if (code === 'leg-fill-return-short') return `Leg ${index}: its panel return is no deeper than the panel's thickness.`;
  if (code === 'leg-fill-no-depth') return `Leg ${index}: no room for its ${type} (the legs touch or overlap).`;
  if (code === 'leg-fill-no-height') return `Leg ${index}: its ${type} has no height.`;
  if (code === 'leg-fill-shared') return `Leg ${index}: Leg ${other} already fills the gap between them.`;
  if (code === 'leg-shape-missing') return `Leg ${index}: its shape isn't in the library.`;
  if (code === 'leg-no-height') return sitsOn
    ? `Leg ${index} has no height (the run sits on what the leg stands on).`
    : `Leg ${index} has no height (the run sits on the floor).`;
  if (code === 'leg-no-base') return `Leg ${index}: the run has no furniture base. Drawn from the floor.`;
  if (code === 'leg-no-countertop') return `Leg ${index}: no countertop below it. Drawn from the floor.`;
  if (code === 'shape-too-small') {
    return `Leg ${index} can't be ${formatInches(target)} tall: its fixed parts are ${formatInches(fixed)}. Drawn at ${formatInches(height)}.`;
  }
  if (code === 'leg-fixed-height') return `Leg ${index} doesn't stretch: drawn at its own height, ${formatInches(height)}.`;
  return '';
}
