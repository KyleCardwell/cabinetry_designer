import { CABINET_TYPE_IDS } from './constants.js';

const { BASE, UPPER, TALL } = CABINET_TYPE_IDS;
const leaf = (type, size = null) => ({ type, size });
const stack = (children, size = null) => ({ direction: 'vertical', size, children });

export const FACE_PRESETS = [
  { key: 'd', label: 'D', description: 'Door', cabinetTypeIds: [BASE, UPPER, TALL], face: leaf('door') },
  { key: 'pd', label: 'PD', description: 'Pair door', cabinetTypeIds: [BASE, UPPER, TALL], face: leaf('pair_door') },
  { key: '2d', label: '2D', description: '2-door stack', cabinetTypeIds: [BASE, UPPER, TALL], face: stack([leaf('door'), leaf('door')]) },
  { key: '2df', label: '2Df', description: '2-drawer stack', cabinetTypeIds: [BASE], face: stack([leaf('drawer_front'), leaf('drawer_front')]) },
  { key: '3df', label: '3Df', description: '3-drawer stack', cabinetTypeIds: [BASE], face: stack([leaf('drawer_front', 5.875), leaf('drawer_front'), leaf('drawer_front')]) },
  { key: '4df', label: '4Df', description: '4-drawer stack', cabinetTypeIds: [BASE], face: stack([leaf('drawer_front', 5.875), leaf('drawer_front', 5.875), leaf('drawer_front'), leaf('drawer_front')]) },
  { key: 'df_d', label: 'Df/D', description: 'Drawer front over door', cabinetTypeIds: [BASE], face: stack([leaf('drawer_front', 5.875), leaf('door')]) },
  { key: 'df_pd', label: 'Df/PD', description: 'Drawer front over pair door', cabinetTypeIds: [BASE], face: stack([leaf('drawer_front', 5.875), leaf('pair_door')]) },
  { key: 'fs', label: 'FS', description: '7" opening over pair door', cabinetTypeIds: [BASE], face: stack([leaf('open', 7), leaf('pair_door')]) },
  { key: 'd_4df', label: 'D/4Df', description: 'Door over 4-drawer stack', cabinetTypeIds: [TALL], face: stack([leaf('door'), stack([leaf('drawer_front', 5.875), leaf('drawer_front', 5.875), leaf('drawer_front'), leaf('drawer_front')], 30.25)]) },
  { key: 'pd_3df', label: 'PD/3Df', description: 'Pair door over 3-drawer stack', cabinetTypeIds: [TALL], face: stack([leaf('pair_door'), stack([leaf('drawer_front', 5.875), leaf('drawer_front'), leaf('drawer_front')], 30.25)]) },
];

/** Presets available for a run's cabinet type, in list order. */
export function presetsFor(cabinetTypeId) {
  return FACE_PRESETS.filter((preset) => preset.cabinetTypeIds.includes(cabinetTypeId));
}
