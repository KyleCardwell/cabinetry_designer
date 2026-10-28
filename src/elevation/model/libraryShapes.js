import { v4 as uuid } from 'uuid';
import { SHAPE_KINDS } from './constants.js';
import { isProfileGeometry, isSectionProfileDraft, sectionProfileBounds } from './sectionProfiles.js';
import { shapeOutlines, transformOutline } from './sectionProfileOutline.js';
import { formatInches } from './units.js';
import {
  buildShape, EXTRUDE_TEMPLATE, isShapeBuilder, shapeBuilderProblems, STACK_TEMPLATE,
} from './shapeBuilders.js';

const VIEW_AXES = { front: ['x', 'z'], plan: ['x', 'y'], side: ['y', 'z'] };
const AXIS_SIZE = { x: 'w', y: 'd', z: 'h' };
const EPS = 1e-6;
const isText = (value) => typeof value === 'string' && value.length > 0;

function hasKeys(value, allowed, required = allowed) {
  return value !== null && typeof value === 'object'
    && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && Reflect.ownKeys(value).every((key) => allowed.includes(key))
    && required.every((key) => Object.hasOwn(value, key));
}

/** Drafts allow zone conflicts, but still require complete, valid geometry and zone pairs. */
export function isShapeDraft(shape) {
  return hasKeys(shape, ['id', 'name', 'archived', 'version', 'kind', 'box', 'views', 'stretch', 'notes', 'builder'],
    ['id', 'name', 'archived', 'version', 'kind', 'box', 'views', 'stretch'])
    && isText(shape.id) && isText(shape.name) && shape.name === shape.name.trim()
    && typeof shape.archived === 'boolean' && Number.isInteger(shape.version) && shape.version >= 1
    && typeof shape.kind === 'string' && Object.hasOwn(SHAPE_KINDS, shape.kind)
    && hasKeys(shape.box, ['x', 'y', 'z', 'w', 'h', 'd'])
    && Object.values(shape.box).every(Number.isFinite)
    && ['w', 'h', 'd'].every((key) => shape.box[key] > 0)
    && hasKeys(shape.views, Object.keys(VIEW_AXES), ['front'])
    && Object.values(shape.views).every((geometry) => isProfileGeometry(geometry, { draft: true }))
    && hasKeys(shape.stretch, Object.keys(AXIS_SIZE), [])
    && Object.values(shape.stretch).every((zones) => Array.isArray(zones)
      && zones.length > 0 && zones.length <= 4
      && Array.from(zones).every((zone) => Array.isArray(zone) && zone.length === 2
        && Number.isFinite(zone[0]) && Number.isFinite(zone[1]) && zone[0] < zone[1]))
    && (!Object.hasOwn(shape, 'notes') || (typeof shape.notes === 'string'
      && shape.notes === shape.notes.trim() && shape.notes.length <= 500))
    && (!Object.hasOwn(shape, 'builder') || isShapeBuilder(shape.builder, shape.views));
}

export function isShape(shape) {
  return isShapeDraft(shape) && Object.values(shape.views).every((geometry) => isProfileGeometry(geometry))
    && shapeStretchProblems(shape).length === 0 && shapeBuilderProblems(shape).length === 0;
}

export function isShapeList(list) {
  if (!Array.isArray(list)) return false;
  const ids = new Set();
  const liveNames = new Set();
  for (const shape of list) {
    if (!isShape(shape) || ids.has(shape.id)) return false;
    const name = shape.name.toLowerCase();
    if (!shape.archived && liveNames.has(name)) return false;
    ids.add(shape.id);
    if (!shape.archived) liveNames.add(name);
  }
  return true;
}

function rectangle(a, b, width, height, prefix, loopId) {
  const ids = [1, 2, 3, 4].map((n) => `${prefix}${n}`);
  return {
    units: 'in',
    points: Object.fromEntries(ids.map((id, i) => [id,
      [[a, b], [a + width, b], [a + width, b + height], [a, b + height]][i]])),
    loops: [{ id: loopId, closed: true, segs: ids.map((id, i) => ({
      type: 'line', from: id, to: ids[(i + 1) % 4],
    })) }],
  };
}

const PLACEHOLDER_FRONT = rectangle(0, 0, 1, 1, 'p', 'L1');

/** SH5: the starting shape for each New button ('drawn' | 'extrude' | 'stack'). */
function shapeTemplate(type) {
  if (type === 'extrude') {
    return buildShape({
      kind: EXTRUDE_TEMPLATE.kind, box: { x: 0, y: 0, z: 0, w: 1, h: 1, d: 1 },
      views: { front: PLACEHOLDER_FRONT, side: structuredClone(EXTRUDE_TEMPLATE.side) }, stretch: {},
      builder: structuredClone(EXTRUDE_TEMPLATE.builder),
    });
  }
  if (type === 'stack') {
    return buildShape({
      kind: STACK_TEMPLATE.kind, box: { x: 0, y: 0, z: 0, w: 1, h: 1, d: 1 },
      views: { front: PLACEHOLDER_FRONT }, stretch: {}, builder: structuredClone(STACK_TEMPLATE.builder),
    });
  }
  return {
    kind: 'other', box: { x: 0, y: 0, z: 0, w: 12, h: 12, d: 12 },
    views: { front: rectangle(0, 0, 12, 12, 'p', 'L1') }, stretch: {},
  };
}

function namedShape(shapes, id, base, type = 'drawn') {
  if (!isShapeList(shapes) || (base && !isShape(base))) return null;
  const names = new Set(shapes.map((shape) => shape.name.toLowerCase()));
  const initial = base ? `${base.name} copy` : 'New shape';
  let name = initial;
  for (let n = 2; names.has(name.toLowerCase()); n += 1) name = `${initial} ${n}`;
  const shape = {
    ...(base ? structuredClone(base) : shapeTemplate(type)),
    id, name, version: 1, archived: false,
  };
  return isShape(shape) && !shapes.some((entry) => entry.id === id) ? shape : null;
}

export function newShape(shapes, id = uuid(), type = 'drawn') {
  if (!['drawn', 'extrude', 'stack'].includes(type)) return null;
  return namedShape(shapes, id, null, type);
}

/** SH5: drop the recipe; the made views, box and zones stay and become editable. One way. */
export function convertShapeToDrawn(shape) {
  if (!isShapeDraft(shape)) return null;
  const { builder, ...rest } = structuredClone(shape);
  void builder;
  return rest;
}

/** SH5: a stack's origin is fixed; an extrusion's x origin is fixed at its left end. */
function builderAllows(shape, axes) {
  const type = shape.builder?.type;
  if (type === 'stack') return false;
  if (type === 'extrude') return !axes.includes('x');
  return true;
}

export function copyShape(shapes, shape, id = uuid()) {
  return isShape(shape) ? namedShape(shapes, id, shape) : null;
}

function validView(view) {
  return typeof view === 'string' && Object.hasOwn(VIEW_AXES, view);
}

/** Missing optional views use the corresponding face of the nominal size box. */
export function shapeView(shape, view) {
  if (!isShapeDraft(shape) || !validView(view)) return null;
  if (Object.hasOwn(shape.views, view)) return structuredClone(shape.views[view]);
  const [a, b] = VIEW_AXES[view];
  return rectangle(shape.box[a], shape.box[b], shape.box[AXIS_SIZE[a]], shape.box[AXIS_SIZE[b]], 'b', 'box');
}

export function fitShapeBox(shape) {
  if (!isShapeDraft(shape)) return null;
  const result = structuredClone(shape);
  for (const [axis, size] of Object.entries(AXIS_SIZE)) {
    const extents = Object.entries(shape.views).flatMap(([view, geometry]) => {
      const index = VIEW_AXES[view].indexOf(axis);
      if (index < 0) return [];
      const bounds = sectionProfileBounds({ geometry });
      if (!Number.isFinite(bounds.minX)) return [];
      return [index === 0 ? [bounds.minX, bounds.maxX] : [bounds.minY, bounds.maxY]];
    });
    if (!extents.length) continue;
    result.box[axis] = Math.min(...extents.map(([min]) => min));
    result.box[size] = Math.max(...extents.map(([, max]) => max)) - result.box[axis];
  }
  return isShapeDraft(result) ? result : null;
}

/** Transform points, arc centres, the box and zones together on each affected world axis. */
function transformShape(shape, offsets, flip = false) {
  const result = structuredClone(shape);
  const coordinate = (value, axis) => {
    const transformed = flip ? -value : value - offsets[axis];
    return transformed === 0 ? 0 : transformed;
  };
  for (const [view, source] of Object.entries(shape.views)) {
    // Each view must be independent even when the input reuses a geometry object.
    const geometry = structuredClone(source);
    result.views[view] = geometry;
    const axes = VIEW_AXES[view];
    const transformPoint = (point) => point.map((value, i) => Object.hasOwn(offsets, axes[i])
      ? coordinate(value, axes[i]) : value);
    geometry.points = Object.fromEntries(Object.entries(geometry.points)
      .map(([id, point]) => [id, transformPoint(point)]));
    for (const loop of geometry.loops) {
      for (const segment of loop.segs) {
        if (segment.type !== 'arc') continue;
        segment.center = transformPoint(segment.center);
        if (flip && axes.some((axis) => Object.hasOwn(offsets, axis))) segment.ccw = !segment.ccw;
      }
    }
  }
  for (const axis of Object.keys(offsets)) {
    result.box[axis] = coordinate(shape.box[axis] + (flip ? shape.box[AXIS_SIZE[axis]] : 0), axis);
    if (shape.stretch[axis]) result.stretch[axis] = shape.stretch[axis].map(([from, to]) => flip
      ? [coordinate(to, axis), coordinate(from, axis)]
      : [coordinate(from, axis), coordinate(to, axis)]).sort((a, b) => a[0] - b[0]);
  }
  return isShapeDraft(result) ? result : null;
}

export function moveShapeOrigin(shape, view, pointId) {
  if (!isShapeDraft(shape) || !validView(view) || !isText(pointId)
    || !Object.hasOwn(shape.views[view]?.points ?? {}, pointId)) return null;
  const point = shape.views[view].points[pointId];
  return moveShapeOriginTo(shape, Object.fromEntries(VIEW_AXES[view].map((axis, i) => [axis, point[i]])));
}

/** Places the given world coordinates at zero throughout the shape. */
export function moveShapeOriginTo(shape, at) {
  if (!isShapeDraft(shape) || !hasKeys(at, Object.keys(AXIS_SIZE), [])
    || Object.keys(at).length === 0 || !Object.values(at).every(Number.isFinite)
    || !builderAllows(shape, Object.keys(at))) return null;
  const moved = transformShape(shape, at);
  return moved && buildShape(moved);
}

/** The nine size-box origin choices, in canvas order from top left to bottom right. */
export function shapeOriginSpots(shape, view) {
  if (!isShapeDraft(shape) || !validView(view)) return null;
  const [a, b] = VIEW_AXES[view];
  return ['top', 'middle', 'bottom'].flatMap((row, r) => ['left', 'middle', 'right'].map((col, c) => ({
    row, col, at: {
      [a]: shape.box[a] + shape.box[AXIS_SIZE[a]] * c / 2,
      [b]: shape.box[b] + shape.box[AXIS_SIZE[b]] * (2 - r) / 2,
    },
  })));
}

export function flipShape(shape, axis) {
  if (!isShapeDraft(shape) || typeof axis !== 'string' || !Object.hasOwn(AXIS_SIZE, axis)
    || !builderAllows(shape, [axis])) return null;
  const flipped = transformShape(shape, { [axis]: 0 }, true);
  return flipped && buildShape(flipped);
}

/** Resolve zoned axes independently, preserving fixed details and the library shape. */
export function resolveShape(shape, target = {}) {
  const result = structuredClone(shape);
  const warnings = [];
  const shifts = {};
  let stretched = false;
  for (const [axis, size] of Object.entries(AXIS_SIZE)) {
    const zones = shape.stretch[axis] ?? [];
    const requested = target[size] ?? shape.box[size];
    const length = zones.reduce((sum, [from, to]) => sum + to - from, 0);
    const fixed = shape.box[size] - length;
    shifts[axis] = () => 0;
    if (!zones.length) continue;
    if (requested < fixed - EPS) {
      warnings.push({ code: 'shape-too-small', axis, fixed, target: requested });
      continue;
    }
    const extra = requested - shape.box[size];
    if (Math.abs(extra) > EPS) stretched = true;
    const shift = (value) => zones.reduce((sum, [from, to]) => (
      sum + extra * Math.max(0, Math.min(value - from, to - from)) / length
    ), 0);
    shifts[axis] = shift;
    result.box[axis] += shift(shape.box[axis]);
    result.box[size] = requested;
    result.stretch[axis] = zones.map(([from, to]) => [from + shift(from), to + shift(to)]);
  }
  for (const [view, source] of Object.entries(shape.views)) {
    const geometry = structuredClone(source);
    result.views[view] = geometry;
    const axes = VIEW_AXES[view];
    geometry.points = Object.fromEntries(Object.entries(source.points).map(([id, point]) => [id,
      point.map((value, i) => value + shifts[axes[i]](value))]));
    for (const loop of geometry.loops) {
      for (const segment of loop.segs) {
        if (segment.type !== 'arc') continue;
        // A valid zone cannot cross an arc: translate its centre with its endpoints.
        segment.center = segment.center.map((value, i) => (
          value + shifts[axes[i]](source.points[segment.from][i])
        ));
      }
    }
  }
  return {
    shape: result,
    origin: Object.fromEntries(Object.entries(shifts).map(([axis, shift]) => [axis, shift(0)])),
    stretched,
    warnings,
  };
}

/** Centre the size box across the section and place the stretched origin at fromBottom. */
export function placeShapeFront(resolved, { section, fromBottom, mirror = false }) {
  const { shape, origin } = resolved;
  const { box } = shape;
  const x = section.x + (section.width - box.w) / 2;
  const dz = section.z + fromBottom - origin.z;
  const toWall = ([px, pz]) => [
    x + (mirror ? box.x + box.w - px : px - box.x), pz + dz,
  ];
  const [insertX, insertZ] = toWall([origin.x, origin.z]);
  return {
    outlines: shapeOutlines(shape.views.front).map(({ closed, outline }) => ({
      closed,
      outline: transformOutline(outline, toWall, mirror),
    })),
    bounds: { x, z: box.z + dz, width: box.w, height: box.h },
    insert: { x: insertX, z: insertZ },
  };
}

export function shapeStretchProblems(shape) {
  if (!isShapeDraft(shape)) return null;
  const problems = [];
  for (const [axis, size] of Object.entries(AXIS_SIZE)) {
    const zones = shape.stretch[axis] ?? [];
    zones.forEach(([from, to], index) => {
      const add = (problem, extra = {}) => problems.push({ axis, index, problem, ...extra });
      // Resolve structural placement problems before checking the drawn arcs (anchor 3).
      if (from < shape.box[axis] - EPS || to > shape.box[axis] + shape.box[size] + EPS) {
        add('box');
        return;
      }
      if (index > 0 && from <= zones[index - 1][1]) {
        add('overlap');
        return;
      }
      for (const [view, geometry] of Object.entries(shape.views)) {
        const coord = VIEW_AXES[view].indexOf(axis);
        if (coord < 0) continue;
        const crosses = geometry.loops.some((loop) => loop.segs.some((segment) => {
          if (segment.type !== 'arc') return false;
          const bounds = sectionProfileBounds({ geometry: {
            points: { [segment.from]: geometry.points[segment.from], [segment.to]: geometry.points[segment.to] },
            loops: [{ segs: [segment] }],
          } });
          const [min, max] = coord === 0 ? [bounds.minX, bounds.maxX] : [bounds.minY, bounds.maxY];
          return min < to - EPS && max > from + EPS;
        }));
        if (crosses) add('arc', { view });
      }
    });
  }
  return problems;
}

export function stretchProblemText(problem, zone) {
  const start = `Stretch zone ${problem.axis} ${formatInches(zone[0])}–${formatInches(zone[1])}`;
  if (problem.problem === 'arc') return `${start} crosses an arc in the ${problem.view} view.`;
  if (problem.problem === 'box') return `${start} is outside the size box.`;
  if (problem.problem === 'overlap') return `${start} overlaps the zone before it.`;
  return null;
}

/** SH5: the view drawn by hand on a builder shape (an extrusion's Side view), else null. */
export function builderSourceView(shape) {
  return shape?.builder?.type === 'extrude' ? 'side' : null;
}

/** SH5: a view the builder makes (read-only in the editor). */
export function isMadeView(shape, view) {
  return Boolean(shape?.builder) && view !== builderSourceView(shape);
}

export function shapeViewProfile(shape, view) {
  const geometry = shapeView(shape, view);
  const source = view === builderSourceView(shape);
  return geometry ? {
    id: `${shape.id}:${view}`, name: shape.name, kind: 'other', geometry,
    drawnPoints: source ? structuredClone(shape.builder.drawnPoints) : { elevation: [] },
    version: 1, archived: false,
  } : null;
}

export function withShapeView(shape, view, profile) {
  if (!isShapeDraft(shape) || !validView(view) || !isSectionProfileDraft(profile)
    || isMadeView(shape, view)) return null;
  const result = structuredClone(shape);
  result.views[view] = structuredClone(profile.geometry);
  if (shape.builder) {
    result.builder.drawnPoints = structuredClone(profile.drawnPoints);
    return isShapeDraft(result) ? buildShape(result) : null;
  }
  return isShapeDraft(result) ? result : null;
}

/** SH5: a stack's turned section as a section-profile draft, so the profile editor tools work on it. */
export function stackSectionProfile(shape, index) {
  const section = shape?.builder?.type === 'stack' ? shape.builder.sections[index] : null;
  if (section?.type !== 'turned') return null;
  return {
    id: `${shape.id}:s${index}`, name: shape.name, kind: 'other',
    geometry: structuredClone(section.profile),
    drawnPoints: { elevation: [...section.drawnPoints.elevation] }, version: 1, archived: false,
  };
}

/** SH5: write a turned section's profile (and its lines across) back, then rebuild. */
export function withStackSectionProfile(shape, index, profile) {
  if (!stackSectionProfile(shape, index) || !isSectionProfileDraft(profile)) return null;
  const result = structuredClone(shape);
  result.builder.sections[index] = {
    type: 'turned', profile: structuredClone(profile.geometry),
    drawnPoints: { elevation: [...profile.drawnPoints.elevation] },
  };
  return isShapeDraft(result) ? buildShape(result) : null;
}

/** SH5: replace the recipe (and for an extrusion, its Side view) and rebuild. */
export function withShapeBuilder(shape, builder, side) {
  if (!isShapeDraft(shape)) return null;
  const result = structuredClone(shape);
  result.builder = structuredClone(builder);
  if (side) result.views.side = structuredClone(side);
  return isShapeDraft(result) ? buildShape(result) : null;
}
