import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { missingDoorDesigns } from '../model/doorDesigns.js';
import { moveMissingDoorDesign } from '../store/elevationSlice.js';

const SELECT_CLASS = 'w-auto rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-xs text-gray-200 hover:bg-gray-700';

export default function MissingDoorDesignsNotice() {
  const dispatch = useDispatch();
  const { rooms, activeRoomId, settings } = useSelector((state) => state.elevation);
  const [choices, setChoices] = useState({});
  const room = rooms.find((candidate) => candidate.id === activeRoomId) ?? null;
  if (!room) return null;

  const missing = missingDoorDesigns(room, settings.doorDesigns);
  if (missing.length === 0) return null;

  return (
    <div className="space-y-2 border-b border-amber-700 bg-amber-900/40 px-4 py-2 text-xs text-amber-100">
      {missing.map(({ designId, styles }) => {
        const reassignTo = settings.doorDesigns.some((design) => design.id === choices[designId])
          ? choices[designId]
          : settings.doorDesigns[0].id;
        return (
          <div key={designId} className="flex flex-wrap items-center gap-2">
            <p>
              Door design <code>{designId}</code> isn&apos;t in the Library any more.{' '}
              {styles.length === 1 ? 'Style' : 'Styles'}{' '}
              <strong>{styles.map((style) => style.label).join(', ')}</strong>{' '}
              use it and draw as the built-in 5-piece until moved.
            </p>
            <label className="flex items-center gap-2">
              Move them to
              <select
                value={reassignTo}
                onChange={(event) => setChoices((current) => ({ ...current, [designId]: event.target.value }))}
                aria-label={`Move styles using ${designId} to`}
                className={SELECT_CLASS}
              >
                {settings.doorDesigns.map(({ id, code, vendor }) => (
                  <option key={id} value={id}>{code}{vendor !== null ? ` · ${vendor}` : ''}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={BUTTON_CLASS}
              onClick={() => dispatch(moveMissingDoorDesign({ roomId: room.id, designId, reassignTo }))}
            >
              Move
            </button>
          </div>
        );
      })}
    </div>
  );
}
