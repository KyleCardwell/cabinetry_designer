import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from './constants.js';

/** The shop's band depths (SPEC-42): settings.bandDepths over the defaults. */
export function bandDepths(settings) {
  return { ...DEFAULT_SETTINGS.bandDepths, ...settings?.bandDepths };
}

/** Whether a run has a toe kick of its own: a base or tall that isn't sitting on another run. */
export function hasToeKick(run) {
  return !run.stack?.below
    && (run.cabinetTypeId === CABINET_TYPE_IDS.BASE || run.cabinetTypeId === CABINET_TYPE_IDS.TALL);
}
