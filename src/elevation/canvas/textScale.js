/** Canvas text factors for zoom relative to fit. */
export function textScales(zoom) {
  if (!Number.isFinite(zoom) || zoom <= 0) return { label: 1, dimension: 1 };

  return {
    label: Math.max(1, Math.min(4, zoom)),
    dimension: Math.max(1, Math.min(2.5, Math.sqrt(zoom))),
  };
}
