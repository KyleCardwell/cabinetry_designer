import { runFaceLayouts } from './faceLayouts.js';
import { cellPieces, partPieces } from './cells.js';
import { frameBadgeAnchor, frameMembers, frameRegions, regionOpenings } from './frames.js';
import { wallLength } from './geometry.js';
import { resolveProfile } from './profile.js';
import {
  endCornerAnglesForRun,
  endMinWidthsForRun,
  pinTargetsForRun,
} from './room.js';
import { splitRun } from './splitRun.js';
import { teeFillers } from './tees.js';
import { wallEndPanels } from './wallEndPanels.js';
import {
  PART_MOLDINGS,
  carriesMolding,
  compareRuns,
  moldingPartKey,
  roomParts,
  wallEndPanelPartKey,
} from './parts.js';

export { PART_MOLDINGS, moldingPartKey, wallEndPanelPartKey } from './parts.js';
export const MOLDING_LABELS = { toeKick: 'TK', topMold: 'TM', crown: 'CR' };
/** Horizontal slot for each molding badge: -1 left of centre, 0 centre, 1 right. */
export const MOLDING_BADGE_SLOTS = { toeKick: 0, topMold: -1, crown: 1 };

export function partNumbers(room, settings) {
  const ordered = roomParts(room, settings);
  const start = Number.isInteger(room?.partNumberStart) && room.partNumberStart > 0
    ? room.partNumberStart
    : 1;
  const overrides = room?.partNumberOverrides ?? {};
  const byKey = new Map();
  const taken = new Set();
  const overrideKeys = new Set();
  const claims = new Map();
  for (const part of ordered) {
    const override = overrides[part.key];
    if (!Number.isInteger(override) || override <= 0) continue;
    byKey.set(part.key, override);
    taken.add(override);
    overrideKeys.add(part.key);
    const keys = claims.get(override) ?? [];
    keys.push(part.key);
    claims.set(override, keys);
  }
  let next = start;
  for (const part of ordered) {
    if (byKey.has(part.key)) continue;
    while (taken.has(next)) next += 1;
    byKey.set(part.key, next);
    taken.add(next);
    next += 1;
  }

  const parts = ordered.map((part) => ({ ...part, number: byKey.get(part.key) }));
  const warnings = [...claims.entries()]
    .filter(([, keys]) => keys.length > 1)
    .map(([number, keys]) => ({ code: 'duplicate-part-number', number, keys }));
  return { parts, byKey, overrideKeys, warnings };
}

export function wallMoldingBadges(room, wall, settings, byKey) {
  const profile = resolveProfile(settings, room, wall);
  const runs = [...wall.runs].sort(compareRuns);
  return PART_MOLDINGS.flatMap((molding) => {
    const key = moldingPartKey(molding);
    const number = byKey.get(key);
    const run = runs.find((candidate) => carriesMolding(wall, candidate, profile, molding));
    if (!run || number === undefined) return [];
    const boxTop = run.z + run.height;
    const toeKickHeight = run.overrides?.toeKickHeight ?? profile.toeKickHeight;
    const rect = molding === 'toeKick'
      ? {
        x: run.x + Math.min(3, run.width / 2),
        z: 0,
        width: Math.max(0, run.width - 6),
        height: toeKickHeight,
      }
      : molding === 'topMold'
        ? { x: run.x, z: boxTop, width: run.width, height: profile.topMoldHeight }
        : {
          x: run.x,
          z: boxTop + profile.crownStackHeight - profile.crownHeight,
          width: run.width,
          height: profile.crownHeight,
        };
    return [{
      molding,
      slot: MOLDING_BADGE_SLOTS[molding],
      key,
      number,
      label: MOLDING_LABELS[molding],
      ...rect,
    }];
  });
}

/**
 * Every part-badge group on one elevation, in draw order.
 * Each group lays out independently, exactly as RunGroup laid one run out.
 * @returns {{key: string, lift: number, pieces: object[]}[]}
 */
export function wallBadgeGroups(room, wall, settings) {
  const groups = wall.runs.flatMap((run) => {
    const layout = splitRun(run, settings, {
      endMinWidths: endMinWidthsForRun(room, wall, run, settings),
      endCornerAngles: endCornerAnglesForRun(room, wall, run),
      pinTargets: pinTargetsForRun(run, wall, wallLength(wall), settings),
    });
    const cells = cellPieces(run, layout);
    const frames = frameRegions(room, run, cells, settings);
    const covered = new Set(frames.regions.flatMap((region) => region.fillerIds));
    const seamTees = teeFillers(room, run, cells, settings).tees.filter((tee) => !tee.end);
    let layouts = null;
    const faceLayouts = () => (layouts ??= runFaceLayouts(room, wall, run, settings, layout));
    return [
      {
        key: `run:${run.id}`,
        lift: 0,
        pieces: partPieces(cells.pieces, settings).filter((piece) => !covered.has(piece.id)),
      },
      // A T-filler between boxes badges one level up, clear of the boxes' own (SPEC-37).
      {
        key: `tees:${run.id}`,
        lift: 1,
        pieces: seamTees.map(({ id, x, z, width, height }) => ({ id, x, z, width, height })),
      },
      // Each frame's badge sits two levels up, over the stile nearest its centre (SPEC-36.2.1).
      ...frames.regions.map((region) => {
        const openings = regionOpenings(region, faceLayouts());
        return {
          key: region.id,
          lift: 2,
          pieces: [{
            id: region.id,
            x: region.x,
            z: region.z,
            width: region.width,
            height: region.height,
            anchor: frameBadgeAnchor(region, frameMembers(region, openings)),
          }],
        };
      }),
    ];
  }).filter((group) => group.pieces.length > 0);

  for (const panel of wallEndPanels(room, wall, settings)) {
    const side = panel[wall.side ?? 'front'];
    groups.push({
      key: `panel:${panel.endpoint}`,
      lift: 1,
      pieces: [{
        id: wallEndPanelPartKey(wall.id, panel.endpoint),
        x: side.x,
        z: 0,
        width: panel.width,
        height: panel.top,
      }],
    });
  }

  return groups;
}
