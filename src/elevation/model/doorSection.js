import { profileDoorGhost } from './profileGhost.js';
import { DOOR_PROFILE_SLOTS } from './doorStyles.js';
import { doorProfileSlotKind, sectionProfileBounds, stretchProfileGeometry } from './sectionProfiles.js';
import { doorProfileOffsets } from './doorProfileLines.js';

const EPS = 1e-6;

function round6(v) {
  const rounded = Number(v.toFixed(6));
  return Object.is(rounded, -0) ? 0 : rounded;
}

const line = (from, to) => ({ type: 'line', from, to });

function moveGeometry(geometry, dx) {
  const move = ([x, y]) => [round6(x + dx), round6(y)];
  return {
    units: geometry.units,
    points: Object.fromEntries(Object.entries(geometry.points).map(([id, point]) => [id, move(point)])),
    loops: geometry.loops.map((loop) => ({
      ...loop,
      segs: loop.segs.map((segment) => (segment.type === 'arc'
        ? { ...segment, center: move(segment.center) } : { ...segment })),
    })),
  };
}

function cutGeometry(geometry, loop) {
  const points = { ...geometry.points };
  const segs = [...loop.segs];
  const start = segs[0].from;
  const end = segs[segs.length - 1].to;
  let last = end;
  if (points[end][1] !== 0) {
    points._e = [points[end][0], 0];
    segs.push(line(last, '_e'));
    last = '_e';
  }
  let target = start;
  if (points[start][1] !== 0) {
    points._s = [points[start][0], 0];
    target = '_s';
  }
  if (points[last][0] !== points[target][0] || points[last][1] !== points[target][1]) {
    segs.push(line(last, target));
  }
  if (target === '_s') segs.push(line('_s', start));
  return { units: 'in', points, loops: [{ id: loop.id, closed: true, segs }] };
}

/** SPEC-48.4 the door style's half section: the body, the picked profiles at their lines, and the wood each open line cuts away. */
export function doorSection(style, design, profiles) {
  if (!design || !Number.isFinite(style?.thickness) || style.thickness <= 0) return null;
  const slab = design.construction === 'slab';
  const offsets = slab ? doorProfileOffsets(style, design, profiles) : null;

  let body;
  if (design.construction === 'five_piece') {
    body = profileDoorGhost('door_outside', style, design.panelJoint);
    if (body === null) return null;
  } else if (design.construction === 'slab') {
    const moldings = offsets?.applied ?? [];
    const w = Math.max(3, ...moldings.map(({ offset, width }) => offset + width + 1));
    const T = style.thickness;
    body = {
      units: 'in',
      points: { b1: [0, 0], b2: [w, 0], b3: [w, -T], b4: [0, -T] },
      loops: [{
        id: 'slab',
        closed: true,
        segs: [line('b1', 'b2'), line('b2', 'b3'), line('b3', 'b4'), line('b4', 'b1')],
      }],
    };
  } else {
    return null;
  }

  const placed = [];
  const cuts = [];
  const skipped = [];
  for (const slot of DOOR_PROFILE_SLOTS) {
    if (!design.slots.includes(slot)) continue;
    const picks = slot === 'applied' ? (style.appliedMoldings ?? [])
      : [{ profileId: style.profiles?.[slot] }];
    for (const [index, { profileId, offset = 0 }] of picks.entries()) {
      if (typeof profileId !== 'string') continue;
      const profile = profiles.find(({ id }) => id === profileId);
      if (!profile || profile.kind !== doorProfileSlotKind(slot)) {
        skipped.push(slot);
        continue;
      }
      if (slot === 'outside' && offsets?.warnings.some(({ code }) => code === 'door-profile-routed-on-mdf')) {
        skipped.push(slot);
        continue;
      }
      const target = slot === 'inside' && design.construction === 'five_piece'
        ? -(style.thickness - style.panel.thickness) : -style.thickness;
      const stretched = stretchProfileGeometry(profile, target) ?? profile.geometry;
      const dx = slot === 'outside' ? 0 : slab && slot === 'applied'
        ? offset - (offsets.slots.outside?.reachOut ?? 0) - sectionProfileBounds({ geometry: stretched }).minX
        : style.stiles.left + offset;
      const geometry = moveGeometry(stretched, dx);
      const identity = { slot, ...(slot === 'applied' ? { index } : {}) };
      placed.push({ ...identity, profileId, name: profile.name, geometry });
      for (const loop of geometry.loops) {
        if (loop.closed === false) cuts.push({ ...identity, geometry: cutGeometry(geometry, loop) });
      }
    }
  }
  return { units: 'in', body, placed, cuts, skipped };
}

/** SPEC-50.1 dimension chains for the door style's half section, measured from the core edge. */
export function doorSectionDimensions(style, design, profiles) {
  if (doorSection(style, design, profiles) === null) return null;

  const { slots, applied: moldings } = doorProfileOffsets(style, design, profiles);
  const { outside, inside } = slots;
  const slab = design.construction === 'slab';
  const edge = -(outside?.reachOut ?? 0);
  const left = [];
  const below = [];
  const above = [];
  const add = (chain, label, from, to) => {
    from = round6(from);
    to = round6(to);
    const value = round6(to - from);
    if (value <= EPS) return;
    chain.push({ label, from, to, value });
  };

  add(left, 'thickness', -style.thickness, 0);
  add(below, 'molding', edge, 0);
  if (outside) add(above, 'outside', -outside.reachOut, outside.reachIn);
  if (design.construction === 'five_piece' || slab) {
    const S = slab ? 0 : style.stiles.left;
    if (slab) {
      if (moldings.length) add(below, 'offset', edge, edge + Math.min(...moldings.map(({ offset }) => offset)));
    } else {
      add(below, 'stile', 0, S);
    }
    const spans = [
      ...(inside && !slab ? [[S + inside.minX, S + inside.maxX]] : []),
      ...moldings.filter(({ profileId }) => profileId !== null)
        .map(({ offset, minX, maxX, width }) => slab
          ? [edge + offset, edge + offset + width]
          : [S + offset + minX, S + offset + maxX]),
    ].filter(([from, to]) => to - from > EPS).sort(([a], [b]) => a - b);
    const merged = [];
    for (const [from, to] of spans) {
      const previous = merged.at(-1);
      if (previous && from <= previous[1] + EPS) previous[1] = Math.max(previous[1], to);
      else merged.push([from, to]);
    }
    let cursor = Math.max(0, outside?.reachIn ?? 0);
    for (const [from, to] of merged) {
      add(above, 'flat', cursor, from);
      add(above, 'profile', from, to);
      cursor = Math.max(cursor, to);
    }
    if (!slab) add(above, 'flat', cursor, S);
  }
  return { left, below, above };
}
