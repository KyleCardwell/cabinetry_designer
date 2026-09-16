import { v4 as uuid } from 'uuid';
import { CABINET_TYPE_IDS } from './constants.js';
import { syncAutoItems } from './splitRun.js';
import { roundTo } from './units.js';

/**
 * Infer a run's cabinet type from its drawn vertical range.
 *
 * @param {number} bottomZ
 * @param {number} topZ
 * @returns {number}
 */
export function inferRunType(bottomZ, topZ) {
  if (bottomZ < 24 && topZ > 60) return CABINET_TYPE_IDS.TALL;
  if (bottomZ < 24) return CABINET_TYPE_IDS.BASE;
  return CABINET_TYPE_IDS.UPPER;
}

/**
 * Return the default box geometry for a cabinet type.
 *
 * @param {number} typeId
 * @param {object} settings
 * @returns {{z: number, height: number, depth: number}}
 */
export function defaultsForType(typeId, settings) {
  if (typeId === CABINET_TYPE_IDS.BASE) {
    return {
      z: settings.toeKickHeight,
      height: settings.baseBoxHeight,
      depth: settings.baseDepth,
    };
  }
  if (typeId === CABINET_TYPE_IDS.TALL) {
    return {
      z: settings.toeKickHeight,
      height: settings.tallBoxHeight,
      depth: settings.tallDepth,
    };
  }
  return {
    z: settings.upperBottomZ,
    height: settings.upperBoxHeight,
    depth: settings.upperDepth,
  };
}

/**
 * Create a run from a drawn rectangle and synchronize its auto cabinet items.
 *
 * @param {{x: number, width: number, bottomZ: number, topZ: number}} bounds
 * @param {object} settings
 * @returns {object}
 */
export function createRun({ x, width, bottomZ, topZ }, settings) {
  const cabinetTypeId = inferRunType(bottomZ, topZ);
  const typeDefaults = defaultsForType(cabinetTypeId, settings);
  const geometry = settings.snapHeightsToDefaults
    ? typeDefaults
    : {
        z: roundTo(bottomZ, 0.5),
        height: roundTo(topZ - bottomZ, 0.5),
        depth: typeDefaults.depth,
      };

  const run = {
    id: uuid(),
    cabinetTypeId,
    x: roundTo(x, 0.5),
    width: roundTo(width, 0.5),
    ...geometry,
    ends: {
      left: { type: settings.defaultEnds.left, width: null },
      right: { type: settings.defaultEnds.right, width: null },
    },
    autoCount: true,
    maxCabinetWidth: null,
    items: [],
  };

  return syncAutoItems(run, settings);
}
