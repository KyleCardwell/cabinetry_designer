import { DOOR_PROFILE_SLOTS } from './doorStyles.js';
import { doorProfileSlotKind, sectionProfileBounds } from './sectionProfiles.js';

const EPS = 1e-6;

function round6(v) {
  const rounded = Number(v.toFixed(6));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** SPEC-50 a door style's picked profiles as elevation offsets, with their reach and the style-level warnings. */
export function doorProfileOffsets(style, design, profiles = []) {
  const slots = {};
  const warnings = [];
  if (!design) return { slots, warnings };

  for (const slot of DOOR_PROFILE_SLOTS) {
    if (!design.slots.includes(slot) || typeof style?.profiles?.[slot] !== 'string') continue;
    const profileId = style.profiles[slot];
    const profile = profiles.find(({ id }) => id === profileId);
    if (!profile || profile.kind !== doorProfileSlotKind(slot)) {
      warnings.push({ code: 'door-profile-missing', slot });
      continue;
    }

    const b = sectionProfileBounds(profile);
    const reachOut = round6(Math.max(0, -b.minX));
    const covers = profile.geometry.loops.some((loop) => {
      if (!loop.closed) return false;
      const pointIds = new Set(loop.segs.flatMap(({ from, to }) => [from, to]));
      const bounds = sectionProfileBounds({ geometry: {
        ...profile.geometry,
        points: Object.fromEntries([...pointIds].map((id) => [id, profile.geometry.points[id]])),
        loops: [loop],
      } });
      return bounds.minX < -EPS && bounds.maxX > EPS;
    });
    const lines = new Set();
    for (const id of profile.drawnPoints?.elevation ?? []) {
      if (!Object.hasOwn(profile.geometry.points, id)) continue;
      const x = round6(profile.geometry.points[id][0]);
      const keep = slot === 'outside' ? Math.abs(x) > EPS && x > -reachOut + EPS
        : slot === 'panel' ? x > EPS : Math.abs(x) > EPS;
      if (keep) lines.add(x);
    }
    slots[slot] = {
      profileId,
      name: profile.name,
      lines: [...lines].sort((a, b) => a - b),
      reachIn: round6(Math.max(0, b.maxX)),
      reachOut,
      covers,
    };
    if (Number.isFinite(style.thickness)
      && !Object.hasOwn(profile, 'stretch')
      && profile.geometry.loops.some((loop) => loop.closed === false)
      && b.minY < -style.thickness - EPS) {
      warnings.push({ code: 'door-profile-too-deep', slot });
    }
    const target = slot === 'inside' && design.construction === 'five_piece'
      ? -(style.thickness - style.panel.thickness) : -style.thickness;
    if (Object.hasOwn(profile, 'stretch') && target >= profile.stretch.y - EPS) {
      warnings.push({ code: 'door-profile-too-thin', slot });
    }
  }
  return { slots, warnings };
}

export function inset(r, d) {
  if (d === 0) {
    const { x, z, width, height } = r;
    return { x, z, width, height };
  }
  return {
    x: round6(r.x + d),
    z: round6(r.z + d),
    width: round6(r.width - 2 * d),
    height: round6(r.height - 2 * d),
  };
}

/** SPEC-50 one part's profile lines (rectangles in wall coordinates) and its fit warnings. */
export function partProfileLines(offsets, detail, rect) {
  const { slots } = offsets;
  const lines = [];
  const warnings = [];
  const fivePiece = detail.construction === 'five_piece';
  const molding = detail.construction === 'slab_applied';
  const openingsShown = !(fivePiece
    ? ['inside', 'panel', 'applied'].some((slot) => slots[slot]?.covers)
    : molding && slots.applied?.covers);
  const addLines = (reference, slot) => {
    for (const d of slots[slot]?.lines ?? []) {
      const r = inset(reference, d);
      if (r.width <= EPS || r.height <= EPS
        || r.x < rect.x - EPS || r.z < rect.z - EPS
        || r.x + r.width > rect.x + rect.width + EPS
        || r.z + r.height > rect.z + rect.height + EPS
        || lines.some((line) => line.x === r.x && line.z === r.z
          && line.width === r.width && line.height === r.height)) continue;
      lines.push(r);
    }
  };

  if ((slots.outside?.reachOut ?? 0) > EPS && !slots.outside.covers
    && detail.core.width > EPS && detail.core.height > EPS) lines.push(detail.core);
  addLines(detail.core, 'outside');
  if (!fivePiece && !molding) return { lines, warnings, openingsShown };
  for (const opening of detail.openings) {
    if (fivePiece) {
      addLines(opening, 'inside');
      addLines(opening, 'panel');
    }
    addLines(opening, 'applied');
  }

  const edgeIn = slots.outside?.reachIn ?? 0;
  const frameOut = Math.max(slots.inside?.reachOut ?? 0, slots.applied?.reachOut ?? 0);
  const { stiles, rails, midRails, midStiles } = detail.sizes;
  for (const [side, size] of [
    ['left', stiles.left], ['right', stiles.right], ['top', rails.top], ['bottom', rails.bottom],
  ]) {
    if (edgeIn + frameOut > size + EPS) warnings.push({ code: 'door-profile-too-wide', side });
  }
  if (frameOut > 0 && [...midRails, ...midStiles].some(({ width }) => 2 * frameOut > width + EPS)) {
    warnings.push({ code: 'door-profile-too-wide', side: 'mid' });
  }
  const inward = Math.max(
    slots.inside?.reachIn ?? 0, slots.panel?.reachIn ?? 0, slots.applied?.reachIn ?? 0,
  );
  if (inward > 0 && detail.openings.some(({ width, height }) => 2 * inward > Math.min(width, height) + EPS)) {
    warnings.push({ code: 'door-profile-panel-too-small' });
  }
  return { lines, warnings, openingsShown };
}
