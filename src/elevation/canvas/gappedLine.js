/** Remove a centred gap from a line, preserving its direction and dropping subpixel pieces. */
export function gappedLine(start, end, center, halfGap) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.5) return [];
  if (halfGap <= 0) return [[start.x, start.y, end.x, end.y]];

  const ux = dx / length;
  const uy = dy / length;
  const along = (center.x - start.x) * ux + (center.y - start.y) * uy;
  const gapStart = Math.max(0, Math.min(length, along - halfGap));
  const gapEnd = Math.max(0, Math.min(length, along + halfGap));
  const pieces = [];
  if (gapStart >= 0.5) {
    pieces.push([start.x, start.y, start.x + ux * gapStart, start.y + uy * gapStart]);
  }
  if (length - gapEnd >= 0.5) {
    pieces.push([start.x + ux * gapEnd, start.y + uy * gapEnd, end.x, end.y]);
  }
  return pieces;
}
