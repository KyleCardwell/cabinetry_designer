import { v4 as uuid } from 'uuid';
import { CABINET_TYPE_IDS } from './constants.js';
import { cornerAt } from './corners.js';
import { wallFrame } from './geometry.js';
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

function normalizeContext(ctx) {
  if (ctx?.settings) return ctx;
  return { settings: ctx, room: null, wall: null };
}

/**
 * Create a run from drawn bounds and room/wall context.
 *
 * @param {{x:number,width:number,bottomZ:number,topZ:number}} bounds
 * @param {{settings:object,room:object,wall:object}} ctx
 * @returns {object}
 */
export function createRun({ x, width, bottomZ, topZ }, ctx) {
  const { settings, room, wall } = normalizeContext(ctx);
  const cabinetTypeId = inferRunType(bottomZ, topZ);
  const profile = resolveProfile(settings, room, wall);
  const typeDefaults = defaultsForType(cabinetTypeId, settings, profile);
  const roundedX = roundTo(x, 0.5);
  const roundedWidth = roundTo(width, 0.5);
  const length = wall ? wallFrame(room, wall).length : Number.POSITIVE_INFINITY;
  const anchors = {
    left: roundedX <= settings.cornerSnapDistance,
    right: length - (roundedX + roundedWidth) <= settings.cornerSnapDistance,
  };
  const ends = {
    left: { type: settings.defaultEnds.left, width: null },
    right: { type: settings.defaultEnds.right, width: null },
  };
  for (const side of ['left', 'right']) {
    if (wall && anchors[side] && cornerAt(room, wall, side).type === 'inside') {
      ends[side] = { type: 'filler', width: null };
    }
  }
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
