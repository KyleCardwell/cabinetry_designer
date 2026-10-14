/** Final frame sizes for an installed part, including the short-face rule (SPEC-46). */
export function partSizes(style, design, { width, height, coreHeight = height, sizes = {} }) {
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

  return {
    construction: design.construction,
    slab: null,
    stiles: { left, right },
    rails: { top, bottom },
    midRails: (sizes.midRails ?? []).map(({ at, width }) => ({
      at, width: width ?? style.rails.top + style.mid.extra,
    })),
    midStiles: (sizes.midStiles ?? []).map(({ at, width }) => ({
      at, width: width ?? style.stiles.left + style.mid.extra,
    })),
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
