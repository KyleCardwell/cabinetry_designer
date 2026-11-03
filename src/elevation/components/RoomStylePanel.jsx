import { useDispatch, useSelector } from 'react-redux';
import { selectRoomInheritedChain, selectSettings } from '../store/selectors.js';
import { resolveSetting } from '../model/settingsResolve.js';
import { controlBorder, sourceLabel } from './overrideHelpers.js';
import { resolveStyle } from '../model/index.js';
import { setRoomStyle, setRoomTFiller } from '../store/elevationSlice.js';
import StyleFields from './properties/StyleFields.jsx';
import Field from './properties/Field.jsx';

export default function RoomStylePanel() {
  const dispatch = useDispatch();
  const { rooms, activeRoomId } = useSelector((state) => state.elevation);
  const settings = useSelector(selectSettings);
  const inheritedChain = useSelector(selectRoomInheritedChain);
  const room = rooms.find((candidate) => candidate.id === activeRoomId) ?? null;
  if (!room) return null;

  return (
    <div className="space-y-2.5">
      <StyleFields
        label="Room"
        level="Room"
        inheritedFrom={sourceLabel(resolveSetting('defaultStyle.cabinetStyleId', inheritedChain).source)}
        value={room.style}
        inherited={resolveStyle(settings)}
        onChange={(style) => dispatch(setRoomStyle({ roomId: room.id, style }))}
      />
      <Field label="T-fillers (Euro)">
        <select
          value={room.tFiller ?? ''}
          onChange={(event) => dispatch(setRoomTFiller({
            roomId: room.id,
            value: event.target.value || null,
          }))}
          aria-label="Room T-fillers"
          className={`w-full rounded border ${controlBorder(room.tFiller != null)} bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none`}
        >
          <option value="">Default (None)</option>
          <option value="none">None</option>
          <option value="seams">Between cabinets</option>
          <option value="all">Every edge</option>
        </select>
      </Field>
    </div>
  );
}
