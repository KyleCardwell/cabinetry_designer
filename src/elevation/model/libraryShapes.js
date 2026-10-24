import { v4 as uuid } from 'uuid';
import { SHAPE_KINDS } from './constants.js';
import { isProfileGeometry, isSectionProfileDraft, sectionProfileBounds } from './sectionProfiles.js';
import { formatInches } from './units.js';

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
  return hasKeys(shape, ['id', 'name', 'archived', 'version', 'kind', 'box', 'views', 'stretch', 'notes'],
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
      && shape.notes === shape.notes.trim() && shape.notes.length <= 500));
}

export function isShape(shape) {
  return isShapeDraft(shape) && Object.values(shape.views).every((geometry) => isProfileGeometry(geometry))
    && shapeStretchProblems(shape).length === 0;
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

function namedShape(shapes, id, base) {
  if (!isShapeList(shapes) || (base && !isShape(base))) return null;
  const names = new Set(shapes.map((shape) => shape.name.toLowerCase()));
  const initial = base ? `${base.name} copy` : 'New shape';
  let name = initial;
  for (let n = 2; names.has(name.toLowerCase()); n += 1) name = `${initial} ${n}`;
  const shape = {
    ...(base ? structuredClone(base) : {
      kind: 'other', box: { x: 0, y: 0, z: 0, w: 12, h: 12, d: 12 },
      views: { front: rectangle(0, 0, 12, 12, 'p', 'L1') }, stretch: {},
    }),
    id, name, version: 1, archived: false,
  };
  return isShape(shape) && !shapes.some((entry) => entry.id === id) ? shape : null;
}

export function newShape(shapes, id = uuid()) {
  return namedShape(shapes, id, null);
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
  return transformShape(shape, Object.fromEntries(VIEW_AXES[view].map((axis, i) => [axis, point[i]])));
}

export function flipShape(shape, axis) {
  if (!isShapeDraft(shape) || typeof axis !== 'string' || !Object.hasOwn(AXIS_SIZE, axis)) return null;
  return transformShape(shape, { [axis]: 0 }, true);
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

export function shapeViewProfile(shape, view) {
  const geometry = shapeView(shape, view);
  return geometry ? {
    id: `${shape.id}:${view}`, name: shape.name, kind: 'other', geometry,
    drawnPoints: { elevation: [] }, version: 1, archived: false,
  } : null;
}

export function withShapeView(shape, view, profile) {
  if (!isShapeDraft(shape) || !validView(view) || !isSectionProfileDraft(profile)) return null;
  const result = structuredClone(shape);
  result.views[view] = structuredClone(profile.geometry);
  return isShapeDraft(result) ? result : null;
}
