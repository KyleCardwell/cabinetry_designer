import { useDispatch } from 'react-redux';
import { prepareRunUpdate } from '../../properties/helpers.js';
import {
  setRunType,
  updateRun,
} from '../../store/elevationSlice.js';
import Field from './Field.jsx';
import RunBottomSection from './RunBottomSection.jsx';
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

export default function RunProperties({ room, wall, run, layout, settings, showMessage }) {
  const dispatch = useDispatch();
  const actionBase = { wallId: wall.id, runId: run.id };

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

      <RunPiecesSection run={run} layout={layout} />

      <RunFaceOptions room={room} wall={wall} run={run} settings={settings} />

      <RunBottomSection run={run} settings={settings} actionBase={actionBase} />

      <WarningsList layout={layout} />
    </div>
  );
}
