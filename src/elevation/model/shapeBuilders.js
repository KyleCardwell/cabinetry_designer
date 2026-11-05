/**
 * SH5 shape builders: an extrusion (a Side-view cross-section pulled along x) and a leg / column
 * stack (square, tapered and turned sections, top to bottom). The recipe is kept on `shape.builder`; the
 * made views, box and stretch zones are stored on the shape as usual. Stack height resolution
 * rebuilds the recipe to preserve details. This file must not import libraryShapes.js.
 */
import { arcMeasure, isProfileGeometry, sectionProfileBounds } from './sectionProfiles.js';

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
      if (Object.hasOwn(section ?? {}, 'details') && (!Array.isArray(section.details)
        || section.details.length > 8 || !section.details.every((detail) => (
          hasKeys(detail, ['from', 'at', 'profile', 'drawnPoints'], ['from', 'at', 'profile'])
          && ['bottom', 'top'].includes(detail.from) && Number.isFinite(detail.at)
          && isProfileGeometry(detail.profile, { draft: true })
          && (!Object.hasOwn(detail, 'drawnPoints')
            || isDrawnPoints(detail.drawnPoints, detail.profile.points, ['elevation']))
        )))) return false;
      if (section?.type === 'square') {
        return hasKeys(section, ['type', 'width', 'height', 'details'], ['type', 'width', 'height'])
          && Number.isFinite(section.width) && Number.isFinite(section.height);
      }
      if (section?.type === 'tapered') {
        return hasKeys(section, ['type', 'shape', 'top', 'bottom', 'height', 'taper', 'details'],
          ['type', 'shape', 'top', 'bottom', 'height', 'taper'])
          && ['square', 'round'].includes(section.shape)
          && [section.top, section.bottom, section.height].every(Number.isFinite)
          && ['all', 'inside'].includes(section.taper)
          && (section.shape !== 'round' || section.taper === 'all');
      }
      return section?.type === 'turned' && hasKeys(section, ['type', 'profile', 'drawnPoints', 'details'], ['type', 'profile', 'drawnPoints'])
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
  if (section.type === 'square' || section.type === 'tapered') return section.height;
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
    if (section.type === 'tapered') {
      if (!(section.top > 0) || !(section.bottom > 0) || !(section.height > 0)) {
        problems.push({ problem: 'taper', index });
      }
      return;
    }
    const bounds = sectionProfileBounds({ geometry: section.profile });
    if (!turnedChain(section.profile)) problems.push({ problem: 'turned', index });
    else if (bounds.minX < -EPS) problems.push({ problem: 'axis', index });
  });
  builder.sections.forEach((section, index) => {
    if (!problems.some((p) => p.index === index)) problems.push(...detailProblems(section, index));
  });
  if (Object.hasOwn(builder, 'stretch') && !['square', 'tapered'].includes(builder.sections[builder.stretch]?.type)) {
    problems.push({ problem: 'stretch' });
  }
  return problems;
}

export function builderProblemText(problem) {
  const n = (problem.index ?? 0) + 1;
  const k = (problem.detailIndex ?? 0) + 1;
  switch (problem.problem) {
    case 'length': return 'The extrusion needs a length.';
    case 'empty': return 'Add at least one section.';
    case 'size': return `Section ${n} needs a width and a height.`;
    case 'taper': return `Section ${n} needs a top width, a bottom width and a height.`;
    case 'turned': return `Section ${n}'s profile must be one open line from its bottom to its top.`;
    case 'axis': return `Section ${n}'s profile crosses the centre line.`;
    case 'detail-profile': return `Section ${n}, detail ${k} must be one open line from its bottom to its top, with both ends at 0.`;
    case 'detail-outside': return `Section ${n}, detail ${k} doesn't fit in its section.`;
    case 'detail-overlap': return `Section ${n}, details ${k} and ${problem.otherDetailIndex + 1} overlap.`;
    case 'detail-deep': return `Section ${n}, detail ${k} cuts past the middle of the leg.`;
    case 'detail-base': return `Section ${n}, detail ${k} sits where the profile turns back on itself.`;
    case 'stretch': return 'Only a square or tapered section can stretch.';
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

// Edge segments carry coordinates until the final geometry is assigned stable made ids.
function sectionEdges(section, bottom, height, view) {
  let right;
  let left;
  if (section.type === 'turned') {
    const chain = turnedChain(section.profile);
    const at = (id) => [section.profile.points[id][0], section.profile.points[id][1] - chain.minY + bottom];
    right = chain.segs.map((s) => ({ ...s, from: at(s.from), to: at(s.to),
      ...(s.type === 'arc' ? { center: [s.center[0], s.center[1] - chain.minY + bottom] } : {}) }));
  } else {
    const top = (section.type === 'square' ? section.width : section.top) / 2;
    let rb = section.type === 'square' ? top : section.bottom / 2;
    let lb = -rb;
    if (section.taper === 'inside') {
      lb = view === 'side' ? -top : top - section.bottom;
      rb = view === 'side' ? -top + section.bottom : top;
    }
    right = [{ type: 'line', from: [rb, bottom], to: [top, bottom + height] }];
    left = [{ type: 'line', from: [lb, bottom], to: [-top, bottom + height] }];
  }
  left ??= right.map((s) => ({ ...s, from: [-s.from[0], s.from[1]], to: [-s.to[0], s.to[1]],
    ...(s.type === 'arc' ? { center: [-s.center[0], s.center[1]], ccw: !s.ccw } : {}) }));
  return { right, left };
}

function measureEdgeArc(s) {
  return arcMeasure({ ...s, from: 'a', to: 'b' }, { a: s.from, b: s.to });
}

function edgePoint(s, t) {
  if (t <= 0) return s.from;
  if (t >= 1) return s.to;
  if (s.type === 'line') return s.from.map((v, i) => v + t * (s.to[i] - v));
  const { radius, start, direction, sweep } = measureEdgeArc(s);
  const angle = start + direction * sweep * t;
  return [s.center[0] + radius * Math.cos(angle), s.center[1] + radius * Math.sin(angle)];
}

function angleParameter(s, angle) {
  const { start, direction, sweep } = measureEdgeArc(s);
  const turn = 2 * Math.PI;
  return ((direction * (angle - start) % turn + turn) % turn) / sweep;
}

function heightCuts(s, z) {
  if (s.type === 'line') {
    return Math.abs(s.to[1] - s.from[1]) <= EPS ? [] : [(z - s.from[1]) / (s.to[1] - s.from[1])];
  }
  const { radius } = measureEdgeArc(s);
  const dy = (z - s.center[1]) / radius;
  if (Math.abs(dy) > 1 + 1e-12) return [];
  const a = Math.asin(Math.max(-1, Math.min(1, dy)));
  return [angleParameter(s, a), angleParameter(s, Math.PI - a)];
}

function edgeLocation(edge, z) {
  for (let i = 0; i < edge.length; i += 1) {
    const s = edge[i];
    if (Math.abs(s.from[1] - z) <= EPS) return { at: i, point: s.from };
    const cuts = heightCuts(s, z).filter((t) => t >= 0 && t <= 1).sort((a, b) => a - b);
    if (cuts.length) return { at: i + cuts[0], point: edgePoint(s, cuts[0]) };
    if (Math.abs(s.to[1] - z) <= EPS) return { at: i + 1, point: s.to };
  }
  return null;
}

function edgeSlice(edge, from, to) {
  const result = [];
  for (let i = Math.floor(from); i < Math.min(to, edge.length); i += 1) {
    const a = Math.max(0, from - i);
    const b = Math.min(1, to - i);
    if (b - a > 1e-12) result.push({ ...edge[i], from: edgePoint(edge[i], a), to: edgePoint(edge[i], b) });
  }
  return result;
}

function baseTurnsBack(edge, lo, hi) {
  return edge.some((s) => {
    const cuts = [0, 1, ...(s.type === 'arc'
      ? [Math.PI / 2, 3 * Math.PI / 2].map((a) => angleParameter(s, a)).filter((t) => t > 0 && t < 1) : [])]
      .sort((a, b) => a - b);
    return cuts.slice(1).some((t, i) => {
      const a = edgePoint(s, cuts[i])[1];
      const b = edgePoint(s, t)[1];
      return a > b + EPS && Math.min(a, hi) > Math.max(b, lo) + EPS;
    });
  });
}

function detailSpan(detail, bottom, height) {
  const chain = turnedChain(detail.profile);
  if (!chain || [chain.ids[0], chain.ids.at(-1)].some((id) => Math.abs(detail.profile.points[id][0]) > EPS)) return null;
  const dh = chain.maxY - chain.minY;
  const lo = detail.from === 'bottom' ? bottom + detail.at : bottom + height - detail.at - dh;
  return { detail, chain, lo, hi: lo + dh };
}

function detailProblems(section, index) {
  const problems = [];
  const height = sectionHeight(section);
  const spans = [];
  const edges = sectionEdges(section, 0, height, 'front');
  (section.details ?? []).forEach((detail, detailIndex) => {
    const add = (problem, extra = {}) => problems.push({ problem, index, detailIndex, ...extra });
    const span = detailSpan(detail, 0, height);
    if (!span) { add('detail-profile'); return; }
    const { lo, hi, chain } = span;
    if (detail.at < 0 || lo < -EPS || hi > height + EPS) { add('detail-outside'); return; }
    for (const other of spans) {
      if (Math.min(hi, other.hi) - Math.max(lo, other.lo) > EPS) {
        problems.push({ problem: 'detail-overlap', index, detailIndex: other.detailIndex, otherDetailIndex: detailIndex });
      }
    }
    spans.push({ ...span, detailIndex });
    if (baseTurnsBack(edges.right, lo, hi)) { add('detail-base'); return; }
    const depth = -chain.minX;
    const zs = [lo, hi, ...Object.values(detail.profile.points).map((p) => lo + p[1] - chain.minY)];
    if (depth > 0 && zs.some((z) => {
      const r = edgeLocation(edges.right, z);
      const l = edgeLocation(edges.left, z);
      return r && l && depth >= (r.point[0] - l.point[0]) / 2;
    })) add('detail-deep');
  });
  return problems;
}

/** Smallest height that leaves room for the fixed-size details at both ends. */
export function stackSectionMinimumHeight(section) {
  const reaches = { bottom: 0, top: 0 };
  for (const detail of section.details ?? []) {
    const chain = turnedChain(detail.profile);
    if (chain) reaches[detail.from] = Math.max(reaches[detail.from], detail.at + chain.maxY - chain.minY);
  }
  return reaches.bottom + reaches.top;
}

function spliceEdge(base, spans, side) {
  const edge = [];
  const hidden = [];
  const ticks = [];
  let cursor = 0;
  const connect = (a, b) => {
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > EPS) edge.push({ type: 'line', from: a, to: b });
  };
  for (const span of spans) {
    const { detail, chain, lo, hi } = span;
    const pb = edgeLocation(base, lo);
    const pt = edgeLocation(base, hi);
    edge.push(...edgeSlice(base, cursor, pb.at));
    hidden.push(edgeSlice(base, pb.at, pt.at));
    const anchor = detail.from === 'bottom' ? pb.point : pt.point;
    const anchorY = detail.from === 'bottom' ? chain.minY : chain.maxY;
    const at = (id) => [anchor[0] + side * detail.profile.points[id][0], anchor[1] + detail.profile.points[id][1] - anchorY];
    connect(pb.point, at(chain.ids[0]));
    edge.push(...chain.segs.map((s) => ({ ...s, from: at(s.from), to: at(s.to),
      ...(s.type === 'arc' ? { center: [anchor[0] + side * s.center[0], anchor[1] + s.center[1] - anchorY],
        ccw: side === 1 ? s.ccw : !s.ccw } : {}) })));
    connect(at(chain.ids.at(-1)), pt.point);
    ticks.push([pb.point, pt.point, ...(detail.drawnPoints?.elevation ?? [])
      .filter((id) => chain.ids.includes(id) && id !== chain.ids[0] && id !== chain.ids.at(-1)).map(at)]);
    cursor = pt.at;
  }
  edge.push(...edgeSlice(base, cursor, base.length));
  return { edge, hidden, ticks };
}

function writeEdge(out, edge, prefix) {
  const ids = [edge[0].from, ...edge.map((s) => s.to)].map((xy, j) => out.point(`${prefix}${j}`, xy));
  return edge.map((s, j) => ({ ...s, from: ids[j], to: ids[j + 1],
    ...(s.type === 'arc' ? { center: s.center.map(clean) } : {}) }));
}

function detailedSection(section, n, bottom, height, view) {
  const base = sectionEdges(section, bottom, height, view);
  const spans = section.details.map((d) => detailSpan(d, bottom, height)).sort((a, b) => a.lo - b.lo);
  const right = spliceEdge(base.right, spans, 1);
  const left = spliceEdge(base.left, spans, -1);
  const out = geometry();
  const r = writeEdge(out, right.edge, `s${n}r`);
  const m = writeEdge(out, left.edge, `s${n}m`);
  const reverse = [...m].reverse().map((s) => ({ ...s, from: s.to, to: s.from,
    ...(s.type === 'arc' ? { ccw: !s.ccw } : {}) }));
  out.loop(`s${n}`, true, [...r, line(r.at(-1).to, m.at(-1).to), ...reverse, line(m[0].from, r[0].from)]);
  let k = 0;
  const across = (a, b) => { k += 1; addLine(out, `s${n}l${k}`, `s${n}line${k}`, a, b); };
  right.ticks.forEach((ticks, i) => ticks.forEach((p, j) => across(left.ticks[i][j], p)));
  if (section.type === 'turned') {
    const chain = turnedChain(section.profile);
    for (const id of section.drawnPoints.elevation) {
      const [x, y] = section.profile.points[id];
      const z = bottom + y - chain.minY;
      if (id === chain.ids[0] || id === chain.ids.at(-1) || x <= EPS
        || spans.some((s) => z >= s.lo - EPS && z <= s.hi + EPS)) continue;
      across([-x, z], [x, z]);
    }
  }
  return { made: out.g, hidden: [...right.hidden, ...left.hidden] };
}

/** Editor-only base pieces replaced by details; never included in a made view. */
export function stackHiddenBase(shape, view) {
  const out = geometry();
  if (shape?.builder?.type !== 'stack' || !['front', 'side'].includes(view)
    || !isShapeBuilder(shape.builder, shape.views) || shapeBuilderProblems(shape).length) return out.g;
  let bottom = 0;
  for (let i = shape.builder.sections.length - 1; i >= 0; i -= 1) {
    const section = shape.builder.sections[i];
    const height = sectionHeight(section);
    if (section.details?.length) {
      detailedSection(section, i + 1, bottom, height, view).hidden.forEach((edge, j) => {
        if (edge.length) out.loop(`s${i + 1}hidden${j}`, false, writeEdge(out, edge, `s${i + 1}h${j}p`));
      });
    }
    bottom += height;
  }
  return out.g;
}

export function newStackDetail() {
  return {
    from: 'bottom', at: 0,
    profile: { units: 'in', points: { b1: [0, 0], b2: [0, 0.5] },
      loops: [{ id: 'L1', closed: false, segs: [{ type: 'arc', from: 'b1', to: 'b2', center: [0, 0.25], ccw: true }] }] },
    drawnPoints: { elevation: [] },
  };
}

function stackSectionView(section, n, bottom, height, view) {
  const out = geometry();
  if (section.details?.length) return detailedSection(section, n, bottom, height, view).made;
  if (section.type === 'square') {
    addRectangle(out, `s${n}p`, `s${n}`, [-section.width / 2, bottom], [section.width / 2, bottom + height]);
  } else if (section.type === 'tapered') {
    const halfTop = section.top / 2;
    let left = -section.bottom / 2;
    let right = section.bottom / 2;
    if (section.taper === 'inside') {
      left = view === 'side' ? -halfTop : halfTop - section.bottom;
      right = view === 'side' ? -halfTop + section.bottom : halfTop;
    }
    const ids = [[left, bottom], [right, bottom], [halfTop, bottom + height], [-halfTop, bottom + height]]
      .map((point, i) => out.point(`s${n}p${i + 1}`, point));
    out.loop(`s${n}`, true, ids.map((id, i) => line(id, ids[(i + 1) % 4])));
  } else {
    addTurned(out, n, section, bottom);
  }
  return out.g;
}

function buildStack(shape, sectionHeights = {}) {
  const { builder } = shape;
  const heights = builder.sections.map((section, i) => sectionHeights[i] ?? sectionHeight(section));
  const bottoms = [];
  let z = 0;
  for (let i = builder.sections.length - 1; i >= 0; i -= 1) {
    bottoms[i] = z;
    z += heights[i];
  }
  const total = z;
  const front = geometry();
  const side = builder.sections.some((section) => section.type === 'tapered' && section.taper === 'inside')
    ? geometry() : null;
  let width = 0;
  let radius = 0;
  builder.sections.forEach((section, i) => {
    const n = i + 1;
    const sectionFront = stackSectionView(section, n, bottoms[i], heights[i], 'front');
    Object.assign(front.g.points, sectionFront.points);
    front.g.loops.push(...sectionFront.loops);
    if (side) {
      const sectionSide = stackSectionView(section, n, bottoms[i], heights[i], 'side');
      Object.assign(side.g.points, sectionSide.points);
      side.g.loops.push(...sectionSide.loops);
    }
    const bounds = sectionProfileBounds({ geometry: sectionFront });
    if (section.type === 'square' || (section.type === 'tapered' && section.shape === 'square')) {
      width = Math.max(width, 2 * Math.max(Math.abs(bounds.minX), Math.abs(bounds.maxX)));
    } else {
      radius = Math.max(radius, bounds.maxX);
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
  const sideView = side?.g ?? structuredClone(front.g);
  const frontBounds = sectionProfileBounds({ geometry: front.g });
  const sideBounds = sectionProfileBounds({ geometry: sideView });
  const stretch = Object.hasOwn(builder, 'stretch')
    ? { z: [[bottoms[builder.stretch], bottoms[builder.stretch] + heights[builder.stretch]]] } : {};
  return {
    views: { front: front.g, side: sideView, plan: plan.g },
    box: {
      x: clean(frontBounds.minX), y: clean(sideBounds.minX), z: 0,
      w: frontBounds.maxX - frontBounds.minX, h: total, d: sideBounds.maxX - sideBounds.minX,
    },
    stretch,
  };
}

/**
 * Remakes the views, box and zones from the recipe. A drawn shape comes back as is; a recipe with
 * problems keeps its previous made views, box and zones.
 */
export function buildShape(shape, { sectionHeights } = {}) {
  if (!shape?.builder || !isShapeBuilder(shape.builder, shape.views)
    || shapeBuilderProblems(shape).length) return shape;
  const made = shape.builder.type === 'extrude' ? buildExtrusion(shape) : buildStack(shape, sectionHeights);
  if (!Object.values(made.views).every((view) => isProfileGeometry(view))) return shape;
  const result = { ...structuredClone(shape), ...made };
  if (shape.builder.type === 'stack' && sectionHeights) {
    result.builder.sections.forEach((section, i) => {
      if (sectionHeights[i] !== undefined && ['square', 'tapered'].includes(section.type)) section.height = sectionHeights[i];
    });
  }
  return result;
}

export function newStackSection(type) {
  if (type === 'square') return { type: 'square', width: 3.5, height: 6 };
  if (type === 'tapered') {
    return { type: 'tapered', shape: 'square', top: 2, bottom: 1.5, height: 12, taper: 'all' };
  }
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
