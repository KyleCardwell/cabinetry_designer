import { v4 as uuid } from 'uuid';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from './constants.js';
import { bandsCompatible, cornerAt } from './corners.js';
import { clamp, wallFrame } from './geometry.js';
import {
  counterTop,
  moldingStack,
  resolveProfile,
} from './profile.js';
import { syncAutoItems } from './splitRun.js';
import { roundTo } from './units.js';

/** Infer a run's cabinet type from its drawn vertical range. */
export function inferRunType(bottomZ, topZ) {
  if (bottomZ < 24 && topZ > 60) return CABINET_TYPE_IDS.TALL;
  if (bottomZ < 24) return CABINET_TYPE_IDS.BASE;
  return CABINET_TYPE_IDS.UPPER;
}

/**
 * Return default box geometry from a resolved height profile.
 *
 * @param {number} typeId
 * @param {object} settings
 * @param {object} [profile]
 * @returns {{z:number,height:number,depth:number}}
 */
export function defaultsForType(typeId, settings, profile = settings.defaultProfile) {
  const boxTop = profile.crownTop - moldingStack(profile);
  if (typeId === CABINET_TYPE_IDS.BASE) {
    return {
      z: profile.toeKickHeight,
      height: profile.baseBoxHeight,
      depth: settings.baseDepth,
    };
  }
  if (typeId === CABINET_TYPE_IDS.TALL) {
    return {
      z: profile.toeKickHeight,
      height: boxTop - profile.toeKickHeight,
      depth: settings.tallDepth,
    };
  }
  const z = counterTop(profile) + profile.upperClearance;
  return { z, height: boxTop - z, depth: settings.upperDepth };
}

/**
 * Create a run from drawn bounds and room/wall context.
 *
 * @param {{x:number,width:number,bottomZ:number,topZ:number}} bounds
 * @param {{settings:object,room:object,wall:object}} ctx
 * @returns {object}
 */
export function createRun({ x, width, bottomZ, topZ }, ctx) {
  const { settings, room, wall } = ctx;
  const cabinetTypeId = inferRunType(bottomZ, topZ);
  const profile = resolveProfile(settings, room, wall);
  const typeDefaults = defaultsForType(cabinetTypeId, settings, profile);
  const length = wall ? wallFrame(room, wall).length : Number.POSITIVE_INFINITY;
  const maxRunOverhang = settings.maxRunOverhang ?? DEFAULT_SETTINGS.maxRunOverhang;
  const minimumX = -maxRunOverhang;
  const maximumX = length + maxRunOverhang;
  const requestedX = roundTo(x, 0.5);
  const requestedWidth = roundTo(width, 0.5);
  const roundedX = clamp(requestedX, minimumX, maximumX);
  const roundedEnd = clamp(requestedX + requestedWidth, minimumX, maximumX);
  const roundedWidth = Math.max(0, roundedEnd - roundedX);
  const edges = { left: roundedX, right: roundedX + roundedWidth };
  const anchors = Object.fromEntries(['left', 'right'].map((side) => {
    const distance = side === 'left' ? Math.abs(edges.left) : Math.abs(length - edges.right);
    return [
      side,
      Boolean(
        wall
        && distance <= settings.cornerSnapDistance
        && cornerAt(room, wall, side).type === 'inside',
      ),
    ];
  }));
  const isAdjacent = (side) => wall?.runs.some((run) => (
    bandsCompatible(cabinetTypeId, run)
    && Math.min(
      Math.abs(edges[side] - run.x),
      Math.abs(edges[side] - (run.x + run.width)),
    ) <= settings.adjacentRunGap
  ));
  const ends = Object.fromEntries(['left', 'right'].map((side) => {
    let type = settings.defaultEnds[side];
    if (anchors[side]) type = 'filler';
    else if (settings.autoEndPanelOnFreeEnd && !isAdjacent(side)) type = 'end_panel';
    return [side, { type, width: null }];
  }));
  const heightMode = settings.snapHeightsToDefaults ? 'auto' : 'manual';
  const geometry = heightMode === 'auto'
    ? typeDefaults
    : {
        z: roundTo(bottomZ, 0.5),
        height: roundTo(topZ - bottomZ, 0.5),
        depth: typeDefaults.depth,
      };

  const run = {
    id: uuid(),
    cabinetTypeId,
    x: roundedX,
    width: roundedWidth,
    ...geometry,
    ends,
    autoCount: true,
    maxCabinetWidth: null,
    items: [],
    heightMode,
    overrides: {},
    anchors,
  };

  return syncAutoItems(run, settings);
}
