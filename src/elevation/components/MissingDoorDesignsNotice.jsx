import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { missingDoorDesigns } from '../model/doorDesigns.js';
import { missingDesignName } from '../../projects/roomText.js';
import { moveMissingDoorDesign } from '../store/elevationSlice.js';

const SELECT_CLASS = 'w-auto rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-xs text-gray-200 hover:bg-gray-700';

export function MissingDoorDesignRow({ room, designId, styles, readOnly }) {
  const dispatch = useDispatch();
  const designs = useSelector((state) => state.elevation.settings.doorDesigns);
  const [choice, setChoice] = useState('');
  const reassignTo = designs.some((design) => design.id === choice)
    ? choice
    : (designs[0]?.id ?? '');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p>
        {missingDesignName(designId)} isn&apos;t in the Library any more.{' '}
        {styles.length === 1 ? 'Style' : 'Styles'}{' '}
        <strong>{styles.map((style) => style.label).join(', ')}</strong>{' '}
        use it and draw as the built-in 5-piece until moved.
        {readOnly && ' Someone who can edit the room can move them.'}
      </p>
      {!readOnly && <>
        <label className="flex items-center gap-2">
          Move them to
          <select
            value={reassignTo}
            onChange={(event) => setChoice(event.target.value)}
            aria-label={`Move styles using ${designId} to`}
            className={SELECT_CLASS}
          >
            {designs.map(({ id, code, vendor }) => (
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
      </>}
    </div>
  );
}

export default function MissingDoorDesignsNotice() {
  const { rooms, activeRoomId, settings, cloud } = useSelector((state) => state.elevation);
  const room = rooms.find((candidate) => candidate.id === activeRoomId) ?? null;
  if (!room) return null;

  const missing = missingDoorDesigns(room, settings.doorDesigns);
  if (missing.length === 0) return null;

  return (
    <div className="space-y-2 border-b border-amber-700 bg-amber-900/40 px-4 py-2 text-xs text-amber-100">
      {missing.map(({ designId, styles }) => (
        <MissingDoorDesignRow key={designId} room={room} designId={designId} styles={styles} readOnly={Boolean(cloud?.room?.readOnly)} />
      ))}
    </div>
  );
}
