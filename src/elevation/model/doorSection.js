import { profileDoorGhost } from './profileGhost.js';
import { DOOR_PROFILE_SLOTS } from './doorStyles.js';
import { doorProfileSlotKind, stretchProfileGeometry } from './sectionProfiles.js';
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

  let body;
  if (design.construction === 'five_piece') {
    body = profileDoorGhost('door_outside', style);
    if (body === null) return null;
  } else if (design.construction === 'slab' || design.construction === 'slab_applied') {
    const applied = design.construction === 'slab_applied';
    if (applied && (!Number.isFinite(style.stiles?.left) || style.stiles.left <= 0)) return null;
    const w = applied ? style.stiles.left + 3 : 3;
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
    if (!design.slots.includes(slot) || typeof style.profiles?.[slot] !== 'string') continue;
    const profileId = style.profiles[slot];
    const profile = profiles.find(({ id }) => id === profileId);
    if (!profile || profile.kind !== doorProfileSlotKind(slot)) {
      skipped.push(slot);
      continue;
    }
    const target = slot === 'inside' && design.construction === 'five_piece'
      ? -(style.thickness - style.panel.thickness) : -style.thickness;
    const stretched = stretchProfileGeometry(profile, target) ?? profile.geometry;
    const geometry = moveGeometry(stretched, slot === 'outside' ? 0 : style.stiles.left);
    placed.push({ slot, profileId, name: profile.name, geometry });
    for (const loop of geometry.loops) {
      if (loop.closed === false) cuts.push({ slot, geometry: cutGeometry(geometry, loop) });
    }
  }
  return { units: 'in', body, placed, cuts, skipped };
}

/** SPEC-50.1 dimension chains for the door style's half section, measured from the core edge. */
export function doorSectionDimensions(style, design, profiles) {
  if (doorSection(style, design, profiles) === null) return null;

  const { slots } = doorProfileOffsets(style, design, profiles);
  const { outside, inside, applied } = slots;
  const frameOut = Math.max(inside?.reachOut ?? 0, applied?.reachOut ?? 0);
  const frameIn = Math.max(inside?.reachIn ?? 0, applied?.reachIn ?? 0);
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
  add(below, 'molding', -(outside?.reachOut ?? 0), 0);
  if (outside) add(above, 'outside', -outside.reachOut, outside.reachIn);
  if (design.construction !== 'slab') {
    const S = style.stiles.left;
    add(below, design.construction === 'five_piece' ? 'stile' : 'inset', 0, S);
    add(above, 'flat', Math.max(0, outside?.reachIn ?? 0), S - frameOut);
    if (inside || applied) add(above, 'profile', S - frameOut, S + frameIn);
  }
  return { left, below, above };
}
