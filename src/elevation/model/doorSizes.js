/** Style mid widths that preserve the frame's flat after profiles and applied moldings. */
export function midDefaults(style, design, offsets) {
  const applied = design.construction === 'five_piece'
    ? (offsets?.applied ?? []).filter(({ profileId }) => profileId !== null) : [];
  const lap = design.construction === 'five_piece'
    ? Math.max(0, offsets?.slots.inside?.reachOut ?? 0, ...applied.map(({ reachOut }) => reachOut)) : 0;
  const over = Math.max(0, ...applied.map(({ reachIn }) => reachIn));
  return {
    rail: style.mid.rail ?? style.rails.top + lap,
    stile: style.mid.stile ?? style.stiles.left + lap,
    lap,
    over,
  };
}

/** Final frame sizes for an installed part, including the short-face rule (SPEC-46). */
export function partSizes(style, design, { width, height, coreHeight = height, sizes = {} }, mid = midDefaults(style, design)) {
  if (coreHeight < style.shortFace.slabBelow - 1e-9) {
    return {
      construction: 'slab', slab: design.construction === 'slab' ? 'design' : 'rule',
      molding: false, designId: design.construction === 'slab' ? design.id : 'slab',
    };
  }

  if (design.construction === 'slab') {
    return {
      construction: 'slab', slab: 'design', molding: true, designId: design.id,
      midRails: (sizes.midRails ?? []).map(({ at }) => ({ at, width: 0 })),
      midStiles: (sizes.midStiles ?? []).map(({ at }) => ({ at, width: 0 })),
      opening: { width, height },
    };
  }

  const { step, minPanel, minRail } = style.shortFace;
  const down = (value) => Math.floor(value / step + 1e-9) * step;
  const typedTop = sizes.rails?.top;
  const typedBottom = sizes.rails?.bottom;
  const rail = (side, typed, other) => typed ?? Math.min(
    style.rails[side],
    Math.max(minRail, down(other == null ? (height - minPanel) / 2 : height - minPanel - other)),
  );
  const top = rail('top', typedTop, typedBottom);
  const bottom = rail('bottom', typedBottom, typedTop);
  const railSource = (side, typed, value) => typed != null
    ? 'part'
    : Math.abs(value - style.rails[side]) <= 1e-9 ? 'style' : 'rule';
  const left = sizes.stiles?.left ?? style.stiles.left;
  const right = sizes.stiles?.right ?? style.stiles.right;
  const mids = (entries, kind) => (entries ?? []).map(({ at, width }) => ({
    at,
    width: width ?? mid[kind],
    source: width != null ? 'part' : style.mid[kind] != null ? 'style' : 'flat',
    ...(mid.over > 0 ? { overall: (width ?? mid[kind]) + 2 * mid.over } : {}),
  }));

  return {
    construction: design.construction,
    slab: null,
    stiles: { left, right },
    rails: { top, bottom },
    midRails: mids(sizes.midRails, 'rail'),
    midStiles: mids(sizes.midStiles, 'stile'),
    opening: { width: width - left - right, height: height - top - bottom },
    sources: {
      top: railSource('top', typedTop, top),
      bottom: railSource('bottom', typedBottom, bottom),
      left: sizes.stiles?.left != null ? 'part' : 'style',
      right: sizes.stiles?.right != null ? 'part' : 'style',
    },
    notes: sizes.notes ?? {},
  };
}

/**
 * A shorter front above must never have a bigger panel than one below (SPEC-46); warns, never fixes.
 * Molding rectangles count as panels (P17).
 */
export function frontStackWarnings(parts) {
  const warnings = [];
  const hasOpening = ({ construction, molding }) => construction === 'five_piece'
    || (construction === 'slab' && molding);
  for (const a of parts) {
    for (const b of parts) {
      if (a === b
        || !hasOpening(a.sizes)
        || !hasOpening(b.sizes)) continue;
      if (
        Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1e-6
        && a.z >= b.z + b.height - 1e-6
        && a.height <= b.height + 1e-6
        && a.sizes.opening.height > b.sizes.opening.height + 1e-6
      ) {
        warnings.push({ code: 'front-panel-over-taller', path: a.path, below: b.path });
      }
    }
  }
  return warnings;
}
