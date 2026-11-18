import { placePartBadges } from './badgePlacement.js';
import { plotScale } from './drawingScale.js';
import { badgeText, partNumbers, wallBadgeGroups, wallMoldingBadges } from './partNumbers.js';
import { resolveWall } from './room.js';

const badgeWidth = (text, scale) => Math.max(1 / 4, 0.075 * text.length + 0.1) * scale;

/** All numbered groups share one placement pass against the face's opaque payload parts. */
export function elevationPartNumbers(room, wall, side, settings, byKey, parts = []) {
  const view = resolveWall(room, wall, side);
  byKey ??= partNumbers(room, settings).byKey;
  const scale = plotScale(settings);
  const height = 3 / 16 * scale;
  const gap = 1 / 16 * scale;
  const badges = wallBadgeGroups(room, view, settings).flatMap(({ pieces }) => pieces
    .filter(({ id }) => byKey.has(id)).map((piece) => {
      const own = (part) => part.id === piece.id || part.id.startsWith(`${piece.id}:`);
      const ownParts = parts.filter(own);
      const front = Math.max(...ownParts.map(({ front }) => front));
      const text = badgeText(byKey, piece.id);
      return {
        key: piece.id, text, width: badgeWidth(text, scale), height,
        rect: { x: piece.x, z: piece.z, width: piece.width, height: piece.height },
        prefer: piece.anchor ?? { x: piece.x + piece.width / 2, z: piece.z + piece.height / 2 },
        axis: piece.anchor ? 'vertical' : 'free',
        blockers: ownParts.length ? parts.filter((part) => !own(part)
          && part.opaque !== false && part.front > front + 1 / 64) : [],
      };
    }));
  badges.push(...wallMoldingBadges(room, view, settings, byKey).map((badge) => {
    const text = `${badge.label} ${badge.number}`;
    const width = badgeWidth(text, scale);
    return {
      key: badge.key, text, width, height,
      rect: { x: badge.x, z: badge.z, width: badge.width, height: badge.height },
      prefer: { x: badge.x + badge.width / 2 + badge.slot * (width + gap), z: badge.z + badge.height / 2 },
      axis: 'horizontal', blockers: [],
    };
  }));
  return placePartBadges(badges, { gap });
}
