/**
 * SH5 shape builders: an extrusion (a Side-view cross-section pulled along x) and a leg / column
 * stack (square and turned sections, top to bottom). The recipe is kept on `shape.builder`; the
 * made views, box and stretch zones are stored on the shape as usual, so nothing downstream reads
 * the recipe. This file must not import libraryShapes.js (libraryShapes imports it).
 */
import { isProfileGeometry, sectionProfileBounds } from './sectionProfiles.js';

const EPS = 1e-6;
export const MAX_STACK_SECTIONS = 12;
const clean = (value) => (Math.abs(value) < 1e-12 ? 0 : value);

function isPlain(value) {
  return value !== null && typeof value === 'object'
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function hasKeys(value, allowed, required = allowed) {
  return isPlain(value) && Reflect.ownKeys(value).every((key) => allowed.includes(key))
    && required.every((key) => Object.hasOwn(value, key));
}

function isIdList(list, points) {
  return Array.isArray(list) && new Set(list).size === list.length
    && list.every((id) => typeof id === 'string' && Object.hasOwn(points, id));
}

function isDrawnPoints(drawn, points, views) {
  return hasKeys(drawn, views, ['elevation'])
    && views.every((view) => !Object.hasOwn(drawn, view) || isIdList(drawn[view], points));
}

/** Structure only (numbers may still be out of range in a draft; see shapeBuilderProblems). */
export function isShapeBuilder(builder, views) {
  if (!isPlain(builder)) return false;
  if (builder.type === 'extrude') {
    return hasKeys(builder, ['type', 'length', 'stretches', 'drawnPoints'])
      && Number.isFinite(builder.length) && typeof builder.stretches === 'boolean'
      && isPlain(views) && isPlain(views.side) && isPlain(views.side.points)
      && isDrawnPoints(builder.drawnPoints, views.side.points, ['elevation', 'plan']);
  }
  if (builder.type === 'stack') {
    if (!hasKeys(builder, ['type', 'sections', 'stretch'], ['type', 'sections'])
      || !Array.isArray(builder.sections) || builder.sections.length > MAX_STACK_SECTIONS) return false;
    if (Object.hasOwn(builder, 'stretch') && (!Number.isInteger(builder.stretch)
      || builder.stretch < 0 || builder.stretch >= builder.sections.length)) return false;
    return builder.sections.every((section) => {
      if (section?.type === 'square') {
        return hasKeys(section, ['type', 'width', 'height'])
          && Number.isFinite(section.width) && Number.isFinite(section.height);
      }
      return section?.type === 'turned' && hasKeys(section, ['type', 'profile', 'drawnPoints'])
        && isProfileGeometry(section.profile, { draft: true })
        && isDrawnPoints(section.drawnPoints, section.profile.points, ['elevation']);
    });
  }
  return false;
}

/** A turned half profile as a bottom → top chain, or null when it isn't one open bottom-to-top loop. */
function turnedChain(profile) {
  if (!isProfileGeometry(profile) || profile.loops.length !== 1 || profile.loops[0].closed) return null;
  const { minX, minY, maxY } = sectionProfileBounds({ geometry: profile });
  if (maxY - minY <= EPS) return null;
  let segs = profile.loops[0].segs.map((segment) => ({ ...segment }));
  const y = (id) => profile.points[id][1];
  if (y(segs[0].from) > y(segs.at(-1).to)) {
    segs = segs.reverse().map((segment) => ({
      ...segment, from: segment.to, to: segment.from,
      ...(segment.type === 'arc' ? { ccw: !segment.ccw } : {}),
    }));
  }
  const ids = [segs[0].from, ...segs.map((segment) => segment.to)];
  if (Math.abs(y(ids[0]) - minY) > EPS || Math.abs(y(ids.at(-1)) - maxY) > EPS) return null;
  return { segs, ids, minX, minY, maxY };
}

function sectionHeight(section) {
  if (section.type === 'square') return section.height;
  const chain = turnedChain(section.profile);
  return chain ? chain.maxY - chain.minY : 0;
}

/** [{ problem, index? }] — empty for a drawn shape or a buildable recipe. */
export function shapeBuilderProblems(shape) {
  const builder = shape?.builder;
  if (!builder) return [];
  const problems = [];
  if (builder.type === 'extrude') {
    if (!(builder.length > 0)) problems.push({ problem: 'length' });
    return problems;
  }
  if (builder.sections.length === 0) problems.push({ problem: 'empty' });
  builder.sections.forEach((section, index) => {
    if (section.type === 'square') {
      if (!(section.width > 0) || !(section.height > 0)) problems.push({ problem: 'size', index });
      return;
    }
    const bounds = sectionProfileBounds({ geometry: section.profile });
    if (!turnedChain(section.profile)) problems.push({ problem: 'turned', index });
    else if (bounds.minX < -EPS) problems.push({ problem: 'axis', index });
  });
  if (Object.hasOwn(builder, 'stretch') && builder.sections[builder.stretch]?.type !== 'square') {
    problems.push({ problem: 'stretch' });
  }
  return problems;
}

export function builderProblemText(problem) {
  const n = (problem.index ?? 0) + 1;
  switch (problem.problem) {
    case 'length': return 'The extrusion needs a length.';
    case 'empty': return 'Add at least one section.';
    case 'size': return `Section ${n} needs a width and a height.`;
    case 'turned': return `Section ${n}'s profile must be one open line from its bottom to its top.`;
    case 'axis': return `Section ${n}'s profile crosses the centre line.`;
    case 'stretch': return 'Only a square section can stretch.';
    default: return null;
  }
}

function geometry() {
  const g = { units: 'in', points: {}, loops: [] };
  return {
    g,
    point(id, [a, b]) { g.points[id] = [clean(a), clean(b)]; return id; },
    loop(id, closed, segs) { g.loops.push({ id, closed, segs }); },
  };
}

function line(from, to) {
  return { type: 'line', from, to };
}

function addRectangle(out, prefix, loopId, [x0, y0], [x1, y1]) {
  const ids = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map((xy, i) => out.point(`${prefix}${i + 1}`, xy));
  out.loop(loopId, true, ids.map((id, i) => line(id, ids[(i + 1) % 4])));
}

function addLine(out, prefix, loopId, a, b) {
  out.loop(loopId, false, [line(out.point(`${prefix}a`, a), out.point(`${prefix}b`, b))]);
}

function extrusionView(side, bounds, length, ids, coord) {
  const out = geometry();
  const [min, max] = coord === 0 ? [bounds.minX, bounds.maxX] : [bounds.minY, bounds.maxY];
  addRectangle(out, 'f', 'outline', [0, min], [length, max]);
  const used = [min, max];
  let k = 0;
  for (const id of ids) {
    const value = side.points[id][coord];
    if (used.some((other) => Math.abs(other - value) <= EPS)) continue;
    used.push(value);
    k += 1;
    addLine(out, `l${k}`, `line${k}`, [0, value], [length, value]);
  }
  return out.g;
}

function buildExtrusion(shape) {
  const { builder } = shape;
  const side = shape.views.side;
  const bounds = sectionProfileBounds({ geometry: side });
  const L = builder.length;
  const planIds = builder.drawnPoints.plan ?? builder.drawnPoints.elevation;
  return {
    views: {
      front: extrusionView(side, bounds, L, builder.drawnPoints.elevation, 1),
      plan: extrusionView(side, bounds, L, planIds, 0),
      side: structuredClone(side),
    },
    box: {
      x: 0, y: clean(bounds.minX), z: clean(bounds.minY),
      w: L, h: bounds.maxY - bounds.minY, d: bounds.maxX - bounds.minX,
    },
    stretch: builder.stretches ? { x: [[0, L]] } : {},
  };
}

function addTurned(out, n, section, z0) {
  const chain = turnedChain(section.profile);
  const { points } = section.profile;
  const dz = z0 - chain.minY;
  const at = (id) => [points[id][0], points[id][1] + dz];
  const onAxis = (id) => points[id][0] <= EPS;
  const last = chain.ids.length - 1;
  const right = chain.ids.map((id, j) => out.point(`s${n}r${j}`, at(id)));
  const left = chain.ids.map((id, j) => (
    (j === 0 || j === last) && onAxis(id) ? right[j] : out.point(`s${n}m${j}`, [-at(id)[0], at(id)[1]])));
  const segs = chain.segs.map((segment, j) => ({
    ...segment, from: right[j], to: right[j + 1],
    ...(segment.type === 'arc' ? { center: [clean(segment.center[0]), clean(segment.center[1] + dz)] } : {}),
  }));
  if (left[last] !== right[last]) segs.push(line(right[last], left[last]));
  for (let j = last; j > 0; j -= 1) {
    const segment = chain.segs[j - 1];
    // Mirrored and run the other way: the arc keeps its ccw.
    segs.push(segment.type === 'arc'
      ? { type: 'arc', from: left[j], to: left[j - 1], center: [clean(-segment.center[0]), clean(segment.center[1] + dz)], ccw: segment.ccw }
      : line(left[j], left[j - 1]));
  }
  if (left[0] !== right[0]) segs.push(line(left[0], right[0]));
  out.loop(`s${n}`, true, segs);
  const ends = new Set([chain.ids[0], chain.ids[last]]);
  let k = 0;
  for (const id of section.drawnPoints.elevation) {
    if (ends.has(id) || points[id][0] <= EPS) continue;
    k += 1;
    const [x, z] = at(id);
    addLine(out, `s${n}l${k}`, `s${n}line${k}`, [-x, z], [x, z]);
  }
}

function buildStack(shape) {
  const { builder } = shape;
  const heights = builder.sections.map(sectionHeight);
  const bottoms = [];
  let z = 0;
  for (let i = builder.sections.length - 1; i >= 0; i -= 1) {
    bottoms[i] = z;
    z += heights[i];
  }
  const total = z;
  const front = geometry();
  let width = 0;
  let radius = 0;
  builder.sections.forEach((section, i) => {
    const n = i + 1;
    if (section.type === 'square') {
      width = Math.max(width, section.width);
      addRectangle(front, `s${n}p`, `s${n}`, [-section.width / 2, bottoms[i]], [section.width / 2, bottoms[i] + heights[i]]);
    } else {
      radius = Math.max(radius, sectionProfileBounds({ geometry: section.profile }).maxX);
      addTurned(front, n, section, bottoms[i]);
    }
  });
  const plan = geometry();
  if (width > 0) addRectangle(plan, 'sq', 'square', [-width / 2, -width / 2], [width / 2, width / 2]);
  if (radius > EPS) {
    const c1 = plan.point('c1', [radius, 0]);
    const c2 = plan.point('c2', [-radius, 0]);
    plan.loop('circle', true, [
      { type: 'arc', from: c1, to: c2, center: [0, 0], ccw: true },
      { type: 'arc', from: c2, to: c1, center: [0, 0], ccw: true },
    ]);
  }
  const size = Math.max(width, 2 * radius);
  const stretch = Object.hasOwn(builder, 'stretch')
    ? { z: [[bottoms[builder.stretch], bottoms[builder.stretch] + heights[builder.stretch]]] } : {};
  return {
    views: { front: front.g, side: structuredClone(front.g), plan: plan.g },
    box: { x: clean(-size / 2), y: clean(-size / 2), z: 0, w: size, h: total, d: size },
    stretch,
  };
}

/**
 * Remakes the views, box and zones from the recipe. A drawn shape comes back as is; a recipe with
 * problems keeps its previous made views, box and zones.
 */
export function buildShape(shape) {
  if (!shape?.builder || !isShapeBuilder(shape.builder, shape.views)
    || shapeBuilderProblems(shape).length) return shape;
  const made = shape.builder.type === 'extrude' ? buildExtrusion(shape) : buildStack(shape);
  if (!Object.values(made.views).every((view) => isProfileGeometry(view))) return shape;
  return { ...structuredClone(shape), ...made };
}

export function newStackSection(type) {
  if (type === 'square') return { type: 'square', width: 3.5, height: 6 };
  if (type === 'turned') {
    return {
      type: 'turned',
      profile: { units: 'in', points: { q1: [1, 0], q2: [1, 2] },
        loops: [{ id: 'L1', closed: false, segs: [line('q1', 'q2')] }] },
      drawnPoints: { elevation: [] },
    };
  }
  return null;
}

/** Every point but the two ends of a turned profile (the default lines across). */
export function turnedInteriorPoints(profile) {
  const chain = turnedChain(profile);
  return chain ? chain.ids.slice(1, -1) : [];
}

export const EXTRUDE_TEMPLATE = {
  kind: 'accessory',
  builder: { type: 'extrude', length: 30, stretches: true, drawnPoints: { elevation: [] } },
  side: {
    units: 'in', points: { p1: [0.65625, 0], p2: [-0.65625, 0] },
    loops: [{ id: 'L1', closed: true, segs: [
      { type: 'arc', from: 'p1', to: 'p2', center: [0, 0], ccw: true },
      { type: 'arc', from: 'p2', to: 'p1', center: [0, 0], ccw: true },
    ] }],
  },
};

export const STACK_TEMPLATE = {
  kind: 'leg',
  builder: { type: 'stack', stretch: 0, sections: [{ type: 'square', width: 3.5, height: 34.5 }] },
};
