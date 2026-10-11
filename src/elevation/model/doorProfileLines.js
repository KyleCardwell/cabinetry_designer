import { DOOR_PROFILE_SLOTS } from './doorStyles.js';
import { doorProfileSlotKind, sectionProfileBounds, stretchProfileGeometry } from './sectionProfiles.js';

const EPS = 1e-6;

function round6(v) {
  const rounded = Number(v.toFixed(6));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** SPEC-50 a door style's picked profiles as elevation offsets, with their reach and the style-level warnings. */
export function doorProfileOffsets(style, design, profiles = []) {
  const slots = {};
  const applied = [];
  const warnings = [];
  if (!design) return { slots, applied, warnings };

  for (const slot of DOOR_PROFILE_SLOTS) {
    if (!design.slots.includes(slot)) continue;
    const picks = slot === 'applied' ? (style?.appliedMoldings ?? [])
      : [{ profileId: style?.profiles?.[slot] }];
    for (const [index, { profileId, offset = 0 }] of picks.entries()) {
      if (slot === 'applied' && profileId === null) {
        applied.push({ index, profileId, name: null, offset, lines: [], applyLine: offset,
          minX: 0, maxX: 0, reachIn: round6(Math.max(0, offset)),
          reachOut: round6(Math.max(0, -offset)), covers: false });
        continue;
      }
      if (typeof profileId !== 'string') continue;
      const profile = profiles.find(({ id }) => id === profileId);
      if (!profile || profile.kind !== doorProfileSlotKind(slot)) {
        warnings.push({ code: 'door-profile-missing', slot, ...(slot === 'applied' ? { index } : {}) });
        continue;
      }

      const target = slot === 'inside' && design.construction === 'five_piece'
        ? -(style.thickness - style.panel.thickness) : -style.thickness;
      const geometry = stretchProfileGeometry(profile, target) ?? profile.geometry;
      const b = sectionProfileBounds({ geometry });
      const reachOut = round6(Math.max(0, -b.minX));
      const covers = geometry.loops.some((loop) => {
        if (!loop.closed) return false;
        const pointIds = new Set(loop.segs.flatMap(({ from, to }) => [from, to]));
        const bounds = sectionProfileBounds({ geometry: {
          ...geometry,
          points: Object.fromEntries([...pointIds].map((id) => [id, geometry.points[id]])),
          loops: [loop],
        } });
        return bounds.minX < -EPS && bounds.maxX > EPS;
      });
      const lines = new Set();
      for (const id of profile.drawnPoints?.elevation ?? []) {
        if (!Object.hasOwn(geometry.points, id)) continue;
        const x = round6(geometry.points[id][0]);
        const keep = slot === 'outside' ? Math.abs(x) > EPS && x > -reachOut + EPS
          : slot === 'panel' ? x > EPS : Math.abs(x) > EPS;
        if (keep) lines.add(x);
      }
      const picked = {
        profileId,
        name: profile.name,
        lines: [...lines].sort((a, b) => a - b),
        reachIn: round6(Math.max(0, b.maxX)),
        reachOut,
        covers,
      };
      if (slot === 'applied') {
        applied.push({ ...picked, index, offset,
          lines: picked.lines.map((x) => round6(offset + x)),
          applyLine: covers ? null : offset, minX: b.minX, maxX: b.maxX,
          reachIn: round6(Math.max(0, offset + b.maxX)),
          reachOut: round6(Math.max(0, -(offset + b.minX))),
        });
      } else {
        slots[slot] = picked;
      }
      if (Number.isFinite(style.thickness)
        && !Object.hasOwn(profile, 'stretch')
        && profile.geometry.loops.some((loop) => loop.closed === false)
        && b.minY < -style.thickness - EPS) {
        warnings.push({ code: 'door-profile-too-deep', slot });
      }
      if (Object.hasOwn(profile, 'stretch') && target >= profile.stretch.y - EPS) {
        warnings.push({ code: 'door-profile-too-thin', slot });
      }
    }
  }
  return { slots, applied, warnings };
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
  const { slots, applied = [] } = offsets;
  const lines = [];
  const warnings = [];
  const fivePiece = detail.construction === 'five_piece';
  const molding = detail.construction === 'slab_applied';
  const fitted = [];
  if (fivePiece || molding) {
    for (const pick of applied) {
      const bounds = pick.profileId === null ? [pick.applyLine]
        : [pick.offset + pick.minX, pick.offset + pick.maxX];
      if (detail.openings.length === 0 || detail.openings.some((opening) => bounds.some((d) => {
        const r = inset(opening, d);
        return r.width <= EPS || r.height <= EPS;
      }))) {
        warnings.push({ code: 'applied-molding-no-room', index: pick.index });
      } else {
        fitted.push(pick);
      }
    }
  }
  const openingsShown = !(fivePiece
    ? slots.inside?.covers || slots.panel?.covers
      || fitted.some(({ offset, covers }) => offset === 0 && covers)
    : molding && applied.length > 0);
  const addLines = (reference, distances) => {
    for (const d of distances) {
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
  addLines(detail.core, slots.outside?.lines ?? []);
  if (!fivePiece && !molding) return { lines, warnings, openingsShown };
  for (const opening of detail.openings) {
    if (fivePiece) {
      addLines(opening, slots.inside?.lines ?? []);
      addLines(opening, slots.panel?.lines ?? []);
    }
    for (const pick of fitted) {
      if (pick.applyLine !== null && !(fivePiece && pick.offset === 0)) {
        addLines(opening, [pick.applyLine]);
      }
      addLines(opening, pick.lines);
    }
  }

  const edgeIn = slots.outside?.reachIn ?? 0;
  const frameOut = Math.max(slots.inside?.reachOut ?? 0, ...fitted.map(({ reachOut }) => reachOut));
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
    slots.inside?.reachIn ?? 0, slots.panel?.reachIn ?? 0, ...fitted.map(({ reachIn }) => reachIn),
  );
  if (inward > 0 && detail.openings.some(({ width, height }) => 2 * inward > Math.min(width, height) + EPS)) {
    warnings.push({ code: 'door-profile-panel-too-small' });
  }
  return { lines, warnings, openingsShown };
}
