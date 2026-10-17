import { useDispatch } from 'react-redux';
import {
  CABINET_PURPOSES,
  REVEAL_KEYS,
  REVEAL_SOURCE_LABELS,
  formatInches,
  isInsetStyle,
  resolveStyle,
} from '../../model/index.js';
import { setCabinetPullHeight, setCabinetPurpose, setDoorStylePick, setPullPick, setItemReveals, setItemStyle } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import DoorStylePicks from './DoorStylePicks.jsx';
import Field from './Field.jsx';
import PullPicks from './PullPicks.jsx';
import StyleFields from './StyleFields.jsx';

const REVEAL_STEP = 1 / 32;

const REVEAL_LABELS = {
  top: 'Top',
  bottom: 'Bottom',
  left: 'Left',
  right: 'Right',
  horizontal: 'Between stacked',
  vertical: 'Between side by side',
};

// `faceLayout` is this cabinet's entry from runFaceLayouts (faces, style, reveals).
export default function CabinetStyleProperties({ room, wall, run, item, itemIds = [item.id], settings, faceLayout }) {
  const dispatch = useDispatch();
  const at = { wallId: wall.id, runId: run.id, itemIds: [item.id] };
  const pullTargets = { ...at, itemIds };
  const manual = item.reveals ?? {};
  const { values, sources } = faceLayout.reveals;

  const setReveal = (key, value) => {
    dispatch(setItemReveals({ ...at, reveals: { ...manual, [key]: value } }));
    return true;
  };

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Cabinet style</h3>
      <Field label="Purpose">
        <select
          value={item.purpose ?? ''}
          onChange={(event) => dispatch(setCabinetPurpose({
            ...pullTargets, purpose: event.target.value || null,
          }))}
          aria-label="Cabinet purpose"
          className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
        >
          <option value="">None</option>
          {CABINET_PURPOSES.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </Field>
      <StyleFields
        label="Cabinet"
        level="Cabinet"
        inheritedFrom="Run"
        value={item.style}
        inherited={resolveStyle(settings, room, run)}
        onChange={(style) => dispatch(setItemStyle({ ...at, style }))}
      />
      <DoorStylePicks
        room={room}
        settings={settings}
        node={item}
        levelsAbove={[
          { level: 'run', node: run },
          { level: 'wall', node: wall },
          { level: 'room', node: room },
        ]}
        label="Cabinet"
        onChange={(key, styleId) => dispatch(setDoorStylePick({
          level: 'cabinet', wallId: wall.id, runId: run.id, itemIds: [item.id], key, styleId,
        }))}
      />
      <PullPicks
        settings={settings}
        node={item}
        levelsAbove={[{ level: 'run', node: run }, { level: 'wall', node: wall }]}
        label="Cabinet"
        pullHeight={item.pullHeight ?? null}
        onPullHeightChange={(value) => dispatch(setCabinetPullHeight({ ...pullTargets, value }))}
        onChange={(key, pullId) => dispatch(setPullPick({
          roomId: room.id, level: 'cabinet', ...pullTargets, key, pullId,
        }))}
      />
      {isInsetStyle(faceLayout.style) && faceLayout.box && (
        <p className="text-xs text-gray-400">
          {`Box ${formatInches(faceLayout.box.width)} wide`}
        </p>
      )}

      <div className="space-y-1.5">
        <p className="text-xs text-gray-400">Reveals (blank = automatic)</p>
        {REVEAL_KEYS.map((key) => (
          <div key={key} className="grid grid-cols-[1fr_5rem] items-center gap-2 text-xs">
            <span className="text-gray-400">
              {REVEAL_LABELS[key]}
              <span className="ml-1 text-gray-500">
                {formatInches(values[key], REVEAL_STEP)} · {REVEAL_SOURCE_LABELS[sources[key]]}
              </span>
            </span>
            <InchInput
              value={manual[key] ?? null}
              allowBlank
              displayStep={REVEAL_STEP}
              onCommit={(next) => setReveal(key, next)}
              aria-label={`Manual ${REVEAL_LABELS[key]} reveal`}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
