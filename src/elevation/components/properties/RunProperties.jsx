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
import PanelSection from '../panel/PanelSection.jsx';
import PanelTabs from '../panel/PanelTabs.jsx';
import PartNumberField from './PartNumberField.jsx';
import PartReportFields from './PartReportFields.jsx';
import RunBottomSection from './RunBottomSection.jsx';
import RunBaseCutoutsSection from './RunBaseCutoutsSection.jsx';
import RunTopSegmentsSection from './RunTopSegmentsSection.jsx';
import RunCabinetsSection from './RunCabinetsSection.jsx';
import RunEndsSection from './RunEndsSection.jsx';
import RunStyleFields from './RunStyleFields.jsx';
import RunGeometrySection from './RunGeometrySection.jsx';
import RunHeightsSection from './RunHeightsSection.jsx';
import RunPiecesSection from './RunPiecesSection.jsx';
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
    <PanelSection id="run.furnitureBase" title={`Furniture base FB #${numbers.byKey.get(group.key)}`}>
      <div className="space-y-2">
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
      </div>
    </PanelSection>
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

  const tabs = [
    { id: 'layout', label: 'Layout', sections: [
      <PanelSection key="run" id="run.type" title="Run">
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
      </PanelSection>,
      <RunGeometrySection
        key="geometry"
        wall={wall}
        run={run}
        settings={settings}
        actionBase={actionBase}
        validateAndDispatch={validateAndDispatch}
      />,
      <RunEndsSection
        key="ends"
        room={room}
        wall={wall}
        run={run}
        settings={settings}
        actionBase={actionBase}
      />,
      <RunCabinetsSection key="cabinets" run={run} actionBase={actionBase} />,
      <RunPiecesSection key="pieces" run={run} layout={layout} insets={insets} />,
    ] },
    { id: 'heights', label: 'Heights & base', sections: [
      <RunHeightsSection
        key="heights"
        room={room}
        wall={wall}
        run={run}
        settings={settings}
        actionBase={actionBase}
        validateAndDispatch={validateAndDispatch}
      />,
      <RunFurnitureBaseSection key="furnitureBase" room={room} wall={wall} run={run} settings={settings} />,
      <RunBaseCutoutsSection key="baseCutouts" room={room} wall={wall} run={run} settings={settings} />,
      <RunTopSegmentsSection key="topSegments" room={room} wall={wall} run={run} settings={settings} />,
      <RunBottomSection key="bottom" room={room} run={run} settings={settings} actionBase={actionBase} />,
    ] },
    { id: 'style', label: 'Style', sections: [
      <RunStyleFields key="style" room={room} wall={wall} run={run} settings={settings} />,
      <PanelSection key="doorStyles" id="run.doorStyles" title="Door styles">
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
      </PanelSection>,
    ] },
    { id: 'hardware', label: 'Hardware', sections: [
      <PullPicks
        key="pulls"
        sectionId="run.pulls"
        settings={settings}
        node={run}
        levelsAbove={[{ level: 'wall', node: wall }]}
        label="Run"
        onChange={(key, pullId) => dispatch(setPullPick({
          roomId: room.id, level: 'run', ...actionBase, key, pullId,
        }))}
      />,
    ] },
  ].map((tab) => ({ ...tab, sections: tab.sections.filter(Boolean) }))
    .filter((tab) => tab.sections.length > 0);

  return (
    <PanelTabs id="run" tabs={tabs}>
      {(active) => <div className="mt-4 space-y-5">{tabs.find((tab) => tab.id === active).sections}</div>}
    </PanelTabs>
  );
}
