import { createSelector, current, isDraft } from '@reduxjs/toolkit';
import { cleanOverrides, resolveSettings } from './settingsResolve.js';

const resolveEffectiveSettings = createSelector(
  [
    (settings) => settings,
    (_settings, overrides) => overrides,
    (_settings, _overrides, profile) => profile,
    (_settings, _overrides, _profile, prefs) => prefs,
  ],
  (settings, overrides, profile, prefs) => ({
    ...resolveSettings([
      { level: 'team', values: settings },
      { level: 'room', values: { ...cleanOverrides(overrides, 'room'), defaultProfile: profile } },
    ]),
    ...prefs,
  }),
);

/** Settings used by a particular room, cached by the four settings inputs. */
export function effectiveSettings(parts, room) {
  // Snapshot mutable reducer drafts so cached values never retain revoked proxies
  // or hide later edits made in the same reducer.
  const inputs = [parts.settings, room?.settingsOverrides, room?.profile, parts.prefs]
    .map((value) => (isDraft(value) ? current(value) : value));
  return resolveEffectiveSettings(...inputs);
}
