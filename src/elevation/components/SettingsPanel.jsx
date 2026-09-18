import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { crownOverlap } from '../model/profile.js';
import { formatInches } from '../model/units.js';
import { updateSettings } from '../store/elevationSlice.js';
import InchInput from './InchInput.jsx';

const NUMBER_SETTINGS = [
  ['baseDepth', 'Base depth'],
  ['upperDepth', 'Upper depth'],
  ['tallDepth', 'Tall depth'],
  ['roundTo', 'Cabinet rounding'],
  ['maxCabinetWidth', 'Max cabinet width'],
  ['minCabinetWidth', 'Min cabinet width'],
  ['fillerMinWidth', 'Min filler width'],
  ['fillerWarnWidth', 'Filler warning width'],
  ['endPanelThickness', 'End panel thickness'],
  ['defaultInteriorFillerWidth', 'Interior filler width'],
  ['minRunWidth', 'Minimum run width'],
  ['maxRunOverhang', 'Maximum run overhang'],
  ['bumperThickness', 'Bumper thickness'],
  ['doorThickness', 'Door thickness'],
  ['cornerFillerMinWidth', 'Corner filler minimum'],
  ['cornerSnapDistance', 'Corner snap distance'],
  ['adjacentRunGap', 'Adjacent run gap'],
  ['planGrid', 'Plan grid'],
];

const PROFILE_SETTINGS = [
  ['toeKickHeight', 'Toe kick height'],
  ['baseBoxHeight', 'Base box height'],
  ['countertopThickness', 'Countertop thickness'],
  ['upperClearance', 'Upper clearance'],
  ['crownTop', 'Top of crown'],
  ['topMoldHeight', 'Top mold'],
  ['crownHeight', 'Crown'],
  ['crownStackHeight', 'Crown total'],
];

const OPENING_NUMBER_SETTINGS = [
  ['casingWidth', 'Casing width'],
  ['casingThickness', 'Casing thickness'],
  ['defaultDoorWidth', 'Door width'],
  ['defaultDoorHeight', 'Door height'],
  ['defaultWindowWidth', 'Window width'],
  ['defaultWindowHeight', 'Window height'],
  ['defaultWindowSillZ', 'Window sill height'],
  ['minOpeningWidth', 'Minimum opening width'],
  ['openingSnap', 'Opening snap'],
];

const END_OPTIONS = [
  ['filler', 'Filler'],
  ['end_panel', 'End panel'],
  ['none', 'None'],
];

export default function SettingsPanel() {
  const dispatch = useDispatch();
  const settings = useSelector((state) => state.elevation.settings);
  const [open, setOpen] = useState(false);
  const overlap = crownOverlap(settings.defaultProfile);

  const update = (changes) => dispatch(updateSettings(changes));

  return (
    <section className="border-t border-gray-700 pt-4">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="w-full flex items-center justify-between text-sm font-semibold uppercase tracking-wide text-gray-300"
        aria-expanded={open}
      >
        Settings
        <span className="text-gray-500" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {NUMBER_SETTINGS.map(([key, label]) => (
              <label key={key} className="text-xs text-gray-400">
                {label}
                <InchInput
                  value={settings[key]}
                  onCommit={(value) => update({ [key]: value })}
                  aria-label={label}
                  className="mt-1"
                />
              </label>
            ))}
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-gray-300">Default height profile</p>
            <div className="grid grid-cols-2 gap-2">
              {PROFILE_SETTINGS.map(([key, label]) => (
                <label key={key} className="text-xs text-gray-400">
                  {label}
                  <InchInput
                    value={settings.defaultProfile[key]}
                    onCommit={(value) => update({ defaultProfile: { [key]: value } })}
                    aria-label={`Default ${label}`}
                    className="mt-1"
                  />
                </label>
              ))}
            </div>
            <p className={`mt-2 text-xs ${overlap < 0 ? 'text-amber-500/80' : 'text-gray-500'}`}>
              {overlap < 0 ? 'Gap' : 'Overlap'} {formatInches(Math.abs(overlap))}
            </p>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-gray-300">Openings</p>
            <div className="grid grid-cols-2 gap-2">
              {OPENING_NUMBER_SETTINGS.map(([key, label]) => (
                <label key={key} className="text-xs text-gray-400">
                  {label}
                  <InchInput
                    value={settings[key]}
                    onCommit={(value) => update({ [key]: value })}
                    aria-label={label}
                    className="mt-1"
                  />
                </label>
              ))}
            </div>
            <label className="mt-3 block text-xs text-gray-400">
              Default measured to
              <select
                value={settings.defaultOpeningMeasureMode}
                onChange={(event) => update({ defaultOpeningMeasureMode: event.target.value })}
                className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="jamb">Jamb</option>
                <option value="casing">Outside casing</option>
              </select>
            </label>
            <label className="mt-3 flex items-center gap-2 text-xs text-gray-300">
              <input
                type="checkbox"
                checked={settings.openingsHaveCasing}
                onChange={(event) => update({ openingsHaveCasing: event.target.checked })}
                className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500"
              />
              New openings include casing
            </label>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={settings.snapHeightsToDefaults}
              onChange={(event) => update({ snapHeightsToDefaults: event.target.checked })}
              className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500"
            />
            Snap run heights to defaults
          </label>

          <label className="flex items-center gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={settings.autoEndPanelOnFreeEnd}
              onChange={(event) => update({ autoEndPanelOnFreeEnd: event.target.checked })}
              className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500"
            />
            Add end panels to free run ends
          </label>

          <label className="flex items-center gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={settings.orthoWalls}
              onChange={(event) => update({ orthoWalls: event.target.checked })}
              className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500"
            />
            Orthogonal plan walls
          </label>

          <div>
            <p className="mb-2 text-xs font-medium text-gray-300">Default ends</p>
            <div className="grid grid-cols-2 gap-2">
              {['left', 'right'].map((side) => (
                <label key={side} className="text-xs text-gray-400 capitalize">
                  {side}
                  <select
                    value={settings.defaultEnds[side]}
                    onChange={(event) => update({
                      defaultEnds: { [side]: event.target.value },
                    })}
                    className="mt-1 w-full px-2.5 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-gray-100 focus:outline-none focus:border-blue-500"
                  >
                    {END_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
