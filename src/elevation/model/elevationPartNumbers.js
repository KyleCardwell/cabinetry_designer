import { layoutPartBadges } from '../canvas/partNumberLayout.js';
import { plotScale } from './drawingScale.js';
import { partNumbers, wallBadgeGroups, wallMoldingBadges } from './partNumbers.js';
import { resolveWall } from './room.js';

const badgeWidth = (text, scale) => Math.max(1 / 4, 0.075 * text.length + 0.1) * scale;

/** One canvas badge group laid out in drawing inches, with z up. */
export function layoutDxfBadges(pieces, numbers, { lift = 0, plotScale: scale = 24 } = {}) {
  if (pieces.length === 0) return [];
  const height = 3 / 16 * scale;
  const step = 1 / 4 * scale;
  const gap = 1 / 16 * scale;
  const maxLevels = Math.max(0, Math.min(3, Math.floor(
    (pieces[0].height / 2 - height / 2 - gap) / step,
  )));
  const byKey = new Map(pieces.map((piece) => [piece.id, piece]));
  const entries = pieces.flatMap((piece) => numbers.has(piece.id) ? [{
    key: piece.id,
    text: String(numbers.get(piece.id)),
    left: piece.x,
    right: piece.x + piece.width,
  }] : []);
  return layoutPartBadges(entries, {
    maxLevels, gap, fitMargin: gap, widthOf: (text) => badgeWidth(text, scale),
  }).map(({ key, text, width, center, level }) => {
    const piece = byKey.get(key);
    const x = piece.anchor?.x ?? center;
    const restZ = piece.anchor?.z ?? piece.z + piece.height / 2;
    const levels = piece.anchor ? 2 : level + lift;
    const z = restZ + levels * step;
    return {
      key, text, x, z, width, height,
      leader: levels > 0 ? { x1: x, z1: z - height / 2, x2: x, z2: restZ } : null,
    };
  });
}

/** Molding labels rest in the band, separated horizontally by their canvas slots. */
export function dxfMoldingBadges(badges, scale) {
  return badges.map((badge) => {
    const text = `${badge.label} ${badge.number}`;
    const width = badgeWidth(text, scale);
    return {
      key: badge.key,
      text,
      x: badge.x + badge.width / 2 + badge.slot * (width + 1 / 16 * scale),
      z: badge.z + badge.height / 2,
      width,
      height: 3 / 16 * scale,
      leader: null,
    };
  });
}

/** The same side view and numbered groups that ElevationCanvas gives PartNumberLayer. */
export function elevationPartNumbers(room, wall, side, settings) {
  const view = resolveWall(room, wall, side);
  const { byKey } = partNumbers(room, settings);
  const scale = plotScale(settings);
  return [
    ...wallBadgeGroups(room, view, settings).flatMap(({ pieces, lift }) =>
      layoutDxfBadges(pieces, byKey, { lift, plotScale: scale })),
    ...dxfMoldingBadges(wallMoldingBadges(room, view, settings, byKey), scale),
  ];
}
