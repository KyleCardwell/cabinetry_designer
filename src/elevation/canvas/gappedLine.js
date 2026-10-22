/** Remove a centred gap, dropping subpixel pieces (pass 0.5 / scale for plan coordinates). */
export function gappedLine(start, end, center, halfGap, minLength = 0.5) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < minLength) return [];
  if (halfGap <= 0) return [[start.x, start.y, end.x, end.y]];

  const ux = dx / length;
  const uy = dy / length;
  const along = (center.x - start.x) * ux + (center.y - start.y) * uy;
  const gapStart = Math.max(0, Math.min(length, along - halfGap));
  const gapEnd = Math.max(0, Math.min(length, along + halfGap));
  const pieces = [];
  if (gapStart >= minLength) {
    pieces.push([start.x, start.y, start.x + ux * gapStart, start.y + uy * gapStart]);
  }
  if (length - gapEnd >= minLength) {
    pieces.push([start.x + ux * gapEnd, start.y + uy * gapEnd, end.x, end.y]);
  }
  return pieces;
}
