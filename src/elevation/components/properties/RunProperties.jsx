import { useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { boxInsets, frameRegions } from '../../model/index.js';
import { furnitureBaseGroups } from '../../model/furnitureBaseGroups.js';
import { partNumbers } from '../../model/partNumbers.js';
import { compareRuns } from '../../model/parts.js';
import { formatInchesInput } from '../../model/units.js';
import { wallSideOf } from '../../model/wallSides.js';
import { prepareRunUpdate } from '../../properties/helpers.js';
import {
  setDoorStylePick,
  setPullPick,
  setRunType,
  updateRun,
} from '../../store/elevationSlice.js';
import DoorStylePicks from './DoorStylePicks.jsx';
import PullPicks from './PullPicks.jsx';
import Field from './Field.jsx';
import PartNumberField from './PartNumberField.jsx';
import PartReportFields from './PartReportFields.jsx';
import RunBottomSection from './RunBottomSection.jsx';
import RunBaseCutoutsSection from './RunBaseCutoutsSection.jsx';
import RunCabinetsSection from './RunCabinetsSection.jsx';
import RunEndsSection from './RunEndsSection.jsx';
import RunFaceOptions from './RunFaceOptions.jsx';
import RunGeometrySection from './RunGeometrySection.jsx';
import RunHeightsSection from './RunHeightsSection.jsx';
import RunPiecesSection from './RunPiecesSection.jsx';
import WarningsList from './WarningsList.jsx';
import { RUN_TYPES } from './constants.js';

const PLACEMENT_MESSAGES = {
  'out-of-bounds': 'Run must stay inside the wall.',
  conflict: 'Run conflicts with another run.',
};

export function RunFurnitureBaseSection({ room, wall, run, settings }) {
  const group = useMemo(() => furnitureBaseGroups(room, settings)
    .find(({ runIds }) => runIds.includes(run.id)), [room, run.id, settings]);
  const numbers = useMemo(() => partNumbers(room, settings), [room, settings]);
  if (!group) return null;

  const source = wall.sideSource ?? wall;
  const runs = [...source.runs].sort((a, b) => (
    Number(wallSideOf(a) === 'back') - Number(wallSideOf(b) === 'back') || compareRuns(a, b)
  ));
  const label = (id) => {
    const index = runs.findIndex((member) => member.id === id);
    const side = wallSideOf(runs[index]) === 'back'
      ? ` (${source.thickness > 0 ? 'wall' : 'island'} back)` : '';
    return `Run ${index + 1}${side}`;
  };
  const companions = group.runIds.filter((id) => id !== run.id).map(label);
  const bottomScribe = group.orderedHeight - group.height;
  const widthScribe = group.orderedWidth - group.width;

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Furniture base FB #{numbers.byKey.get(group.key)}
      </h3>
      <p className="text-xs text-gray-300">
        {label(run.id)}{companions.length > 0 && ` · with: ${companions.join(', ')}`}
      </p>
      <p className="text-xs text-gray-300">
        Ordered size (W × H × D): {[
          group.orderedWidth, group.orderedHeight, group.depth,
        ].map((value) => formatInchesInput(value)).join(' × ')} in
      </p>
      {bottomScribe > 1e-6 && (
        <p className="text-xs text-gray-500">(+{formatInchesInput(bottomScribe)} scribe bottom)</p>
      )}
      {widthScribe > 1e-6 && (
        <p className="text-xs text-gray-500">(+{formatInchesInput(bottomScribe)} scribe left/right) at square stops</p>
      )}
      <PartNumberField
        roomId={room.id}
        partKey={group.key}
        autoNumber={numbers.byKey.get(group.key)}
        override={room.partNumberOverrides?.[group.key]}
        duplicate={numbers.warnings.some((warning) => warning.keys.includes(group.key))}
      />
      <PartReportFields room={room} partKey={group.key} kind="furniture_base" settings={settings} autoName="" />
    </section>
  );
}

export default function RunProperties({ room, wall, run, layout, settings, showMessage }) {
  const dispatch = useDispatch();
  const actionBase = { wallId: wall.id, runId: run.id };
  const frames = useMemo(() => frameRegions(room, run, layout, settings), [room, run, layout, settings]);
  const insets = useMemo(() => boxInsets(frames, layout, settings), [frames, layout, settings]);

  const validateAndDispatch = (changes) => {
    const { validation } = prepareRunUpdate(room, wall.id, run, settings, changes);
    if (!validation.ok) {
      showMessage(PLACEMENT_MESSAGES[validation.reason] ?? validation.reason);
      return false;
    }
    dispatch(updateRun({ ...actionBase, changes }));
    return true;
  };

  const changeType = (typeId, resetToDefaults = false) => {
    const changes = {
      cabinetTypeId: typeId,
      ...(resetToDefaults ? { heightMode: 'auto', overrides: {} } : {}),
    };
    const { validation } = prepareRunUpdate(room, wall.id, run, settings, changes);
    if (!validation.ok) {
      showMessage(PLACEMENT_MESSAGES[validation.reason] ?? validation.reason);
      return;
    }
    dispatch(setRunType({ ...actionBase, typeId, resetToDefaults }));
  };

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Run
        </h3>
        <Field label="Type">
          <select
            value={run.cabinetTypeId}
            onChange={(event) => changeType(Number(event.target.value))}
            className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            {RUN_TYPES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>
      </section>

      <RunGeometrySection
        wall={wall}
        run={run}
        settings={settings}
        actionBase={actionBase}
        validateAndDispatch={validateAndDispatch}
      />

      <RunEndsSection
        room={room}
        wall={wall}
        run={run}
        settings={settings}
        actionBase={actionBase}
      />

      <RunHeightsSection
        room={room}
        wall={wall}
        run={run}
        settings={settings}
        actionBase={actionBase}
        validateAndDispatch={validateAndDispatch}
      />

      <RunCabinetsSection run={run} actionBase={actionBase} />

      <RunFurnitureBaseSection room={room} wall={wall} run={run} settings={settings} />

      <RunBaseCutoutsSection room={room} wall={wall} run={run} settings={settings} />

      <RunPiecesSection run={run} layout={layout} insets={insets} />

      <RunFaceOptions room={room} wall={wall} run={run} settings={settings} />

      {room.doorStyles?.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Door styles
          </h3>
          <DoorStylePicks
            room={room}
            settings={settings}
            node={run}
            levelsAbove={[{ level: 'wall', node: wall }, { level: 'room', node: room }]}
            label="Run"
            onChange={(key, styleId) => dispatch(setDoorStylePick({
              level: 'run', ...actionBase, key, styleId,
            }))}
          />
        </section>
      )}

      <PullPicks
        settings={settings}
        node={run}
        levelsAbove={[{ level: 'wall', node: wall }]}
        label="Run"
        onChange={(key, pullId) => dispatch(setPullPick({
          roomId: room.id, level: 'run', ...actionBase, key, pullId,
        }))}
      />

      <RunBottomSection room={room} run={run} settings={settings} actionBase={actionBase} />

      <WarningsList layout={layout} />
    </div>
  );
}
