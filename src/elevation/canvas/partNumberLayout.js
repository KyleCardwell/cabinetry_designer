import { badgeBlockers } from '../model/elevationPartNumbers.js';
import { placePartBadges } from '../model/badgePlacement.js';
import { badgeText, wallBadgeGroups, wallMoldingBadges } from '../model/partNumbers.js';

export const PART_BADGE_FONT_SIZE = 15;
export const PART_BADGE_HEIGHT = 20;
/** px above the piece's vertical centre where a badge rests, clear of the width text. */
export const PART_BADGE_LIFT = 20;
export function partBadgeWidth(text, { charWidth = 9, padding = 7, minWidth = 22 } = {}) {
  return Math.max(minWidth, text.length * charWidth + 2 * padding);
}

/** Place all screen pills together in wall inches, using the current pixels per inch. */
export function placeScreenPartBadges(room, wall, settings, numbers, ppi, parts = []) {
  if (!numbers) return { parts: [], moldings: [] };
  const height = PART_BADGE_HEIGHT / ppi;
  const runBadges = wallBadgeGroups(room, wall, settings).flatMap(({ pieces }) => pieces.flatMap((piece) => {
    if (!numbers.byKey.has(piece.id)) return [];
    const text = badgeText(numbers.byKey, piece.id);
    return [{
      key: piece.id,
      text,
      width: partBadgeWidth(text) / ppi,
      height,
      rect: piece,
      prefer: piece.anchor ?? {
        x: piece.x + piece.width / 2,
        z: piece.z + piece.height / 2 + PART_BADGE_LIFT / ppi,
      },
      axis: piece.anchor ? 'vertical' : 'free',
      blockers: badgeBlockers(parts, piece.id),
    }];
  }));
  const moldings = wallMoldingBadges(room, wall, settings, numbers.byKey).map((badge) => {
    const text = `${badge.label} ${badge.number}`;
    const width = partBadgeWidth(text) / ppi;
    return {
      key: badge.key,
      text,
      width,
      height,
      rect: badge,
      prefer: {
        x: badge.x + badge.width / 2 + badge.slot * (width + 4 / ppi),
        z: badge.z + badge.height / 2,
      },
      axis: 'horizontal',
      blockers: [],
    };
  });
  const placed = placePartBadges([...runBadges, ...moldings], { gap: 3 / ppi });
  return { parts: placed.slice(0, runBadges.length), moldings: placed.slice(runBadges.length) };
}
