import { CABINET_TYPE_IDS } from './constants.js';

function definedEntries(value) {
  return Object.entries(value ?? {}).filter(([, entry]) => entry !== null && entry !== undefined);
}

function mergeDefined(...values) {
  return Object.fromEntries(values.flatMap(definedEntries));
}

/** Resolve the inherited height profile for a wall. */
export function resolveProfile(settings, room, wall) {
  return mergeDefined(settings.defaultProfile, room?.profile, wall?.profile);
}

/** Return the specified total height of the top-mold and crown stack. */
export function moldingStack(profile) {
  return profile.crownStackHeight;
}

/** Return the resolved top of the cabinet box. */
export function boxTopOf(profile) {
  return profile.boxTop ?? (profile.crownTop - moldingStack(profile));
}

/** Return the derived overlap between the top-mold and crown profiles. */
export function crownOverlap(profile) {
  return profile.topMoldHeight + profile.crownHeight - profile.crownStackHeight;
}

/** Return the finished countertop surface height. */
export function counterTop(profile) {
  return profile.toeKickHeight + profile.baseBoxHeight + profile.countertopThickness;
}

/**
 * Resolve a run's vertical box geometry and diagnostics.
 *
 * @param {object} run
 * @param {object} profile
 * @param {object[]} baseRunsBelow
 * @param {number|object} [wallOrHeight]
 * @returns {{z:number,height:number,warnings:object[],errors:object[]}}
 */
export function resolveVertical(run, profile, baseRunsBelow = [], wallOrHeight) {
  const warnings = [];
  const errors = [];

  if (run.heightMode === 'manual') {
    if (run.height <= 0) errors.push({ code: 'no-room-for-box' });
    return { z: run.z, height: run.height, warnings, errors };
  }

  const q = mergeDefined(profile, run.overrides);
  const boxTop = boxTopOf(q);
  let z;
  let height;

  if (run.cabinetTypeId === CABINET_TYPE_IDS.BASE) {
    z = q.toeKickHeight;
    height = q.baseBoxHeight;
  } else if (run.cabinetTypeId === CABINET_TYPE_IDS.TALL) {
    z = q.toeKickHeight;
    height = boxTop - z;
  } else {
    const overlappingBases = baseRunsBelow.filter((base) => (
      base.cabinetTypeId === CABINET_TYPE_IDS.BASE
      && Math.min(run.x + run.width, base.x + base.width) - Math.max(run.x, base.x) > 1e-6
    ));
    const counterHeights = overlappingBases.map((base) => (
      counterTop(mergeDefined(profile, base.overrides))
    ));
    let counterReference = counterTop(q);
    if (counterHeights.length > 0) {
      counterReference = Math.max(...counterHeights);
      if (counterHeights.some((value) => Math.abs(value - counterHeights[0]) > 1e-6)) {
        warnings.push({ code: 'mixed-counter-heights' });
      }
    }
    z = counterReference + q.upperClearance;
    height = boxTop - z;
  }

  if (height <= 0) errors.push({ code: 'no-room-for-box' });
  const wallHeight = typeof wallOrHeight === 'number'
    ? wallOrHeight
    : wallOrHeight?.height ?? profile.wallHeight;
  if (
    run.cabinetTypeId !== CABINET_TYPE_IDS.BASE
    && Number.isFinite(wallHeight)
    && boxTop + moldingStack(q) > wallHeight + 1e-6
  ) {
    warnings.push({ code: 'crown-above-ceiling' });
  }

  return { z, height, warnings, errors };
}
