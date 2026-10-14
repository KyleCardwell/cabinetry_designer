import { allowedAt, registryEntry } from '../../model/settingsRegistry.js';
import { isValidSettingValue, withOverride } from '../../model/settingsResolve.js';
import { syncRoomAt } from './helpers.js';

export const LAYER_LEVELS = ['project', 'phase'];

export const cloudReducers = {
  /** Set or clear one project/phase override (`value` null/undefined = inherit). */
  setLayerSetting(state, action) {
    const { level, key, value } = action.payload;
    const layer = LAYER_LEVELS.includes(level) ? state.layers?.[level] : null;
    if (!layer || !registryEntry(key) || !allowedAt(key, level)) return;
    const clearing = value === null || value === undefined;
    if (!clearing && !isValidSettingValue(key, value)) return;
    layer.values = withOverride(layer.values, key, clearing ? null : value);
    for (let index = 0; index < state.rooms.length; index += 1) syncRoomAt(state, index);
  },
};
