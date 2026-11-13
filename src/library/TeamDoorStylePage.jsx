import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import DoorStyleFields from '../elevation/components/DoorStyleFields.jsx';
import { DEFAULT_DOOR_STYLE, isDoorStyle } from '../elevation/model/doorStyles.js';
import { setTeamDoorStyle } from '../elevation/store/elevationSlice.js';

const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700';

function TeamDoorStyleContent({ settings }) {
  const dispatch = useDispatch();
  const [draft, setDraft] = useState(() => structuredClone(settings.teamDoorStyle));
  const reason = !isDoorStyle(draft) ? 'Every size must be more than 0' : '';
  const unchanged = JSON.stringify(draft) === JSON.stringify(settings.teamDoorStyle);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-100">Team door style</h1>
        <p className="mt-2 text-sm text-gray-400">
          Every door, drawer front and panel that doesn't pick a style uses this (shown as Std). New room styles start as a copy of it.
        </p>
      </div>
      <div className="max-w-5xl space-y-4">
        <DoorStyleFields draft={draft} setDraft={setDraft} designs={settings.doorDesigns} />
        {reason && <p role="status" className="text-xs text-red-400">{reason}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={Boolean(reason) || unchanged}
            className={`${BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
            onClick={() => {
              if (reason || unchanged) return;
              dispatch(setTeamDoorStyle({ style: draft }));
            }}
          >
            Save
          </button>
          <button
            type="button"
            className={BUTTON_CLASS}
            onClick={() => setDraft(structuredClone(settings.teamDoorStyle))}
          >
            Revert
          </button>
          <button
            type="button"
            className={BUTTON_CLASS}
            onClick={() => setDraft(structuredClone(DEFAULT_DOOR_STYLE))}
          >
            Standard
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TeamDoorStylePage() {
  const settings = useSelector((state) => state.elevation.settings);

  return <TeamDoorStyleContent key={JSON.stringify(settings.teamDoorStyle)} settings={settings} />;
}
