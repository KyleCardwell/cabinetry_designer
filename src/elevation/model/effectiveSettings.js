import { createSelector, current, isDraft } from '@reduxjs/toolkit';
import { cleanOverrides, resolveSettings } from './settingsResolve.js';

const resolveEffectiveSettings = createSelector(
  [
    (settings) => settings,
    (_settings, project) => project,
    (_settings, _project, phase) => phase,
    (_settings, _project, _phase, overrides) => overrides,
    (_settings, _project, _phase, _overrides, profile) => profile,
    (_settings, _project, _phase, _overrides, _profile, prefs) => prefs,
  ],
  (settings, project, phase, overrides, profile, prefs) => ({
    ...resolveSettings([
      { level: 'team', values: settings },
      ...(project ? [{ level: 'project', values: project }] : []),
      ...(phase ? [{ level: 'phase', values: phase }] : []),
      { level: 'room', values: { ...cleanOverrides(overrides, 'room'), defaultProfile: profile } },
    ]),
    ...prefs,
  }),
);

/**
 * Settings used by a particular room: shop standard → project → phase → room (SPEC-DB4 d),
 * cached by its inputs. `parts.layers` is `{ project, phase }`, each `{ id, values }` or null.
 */
export function effectiveSettings(parts, room) {
  // Snapshot mutable reducer drafts so cached values never retain revoked proxies
  // or hide later edits made in the same reducer.
  const inputs = [
    parts.settings,
    parts.layers?.project?.values ?? null,
    parts.layers?.phase?.values ?? null,
    room?.settingsOverrides,
    room?.profile,
    parts.prefs,
  ].map((value) => (isDraft(value) ? current(value) : value));
  return resolveEffectiveSettings(...inputs);
}
