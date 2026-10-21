import { useDispatch, useSelector } from 'react-redux';
import { selectRoomInheritedChain, selectSettings } from '../store/selectors.js';
import { resolveSetting } from '../model/settingsResolve.js';
import { sourceLabel } from './overrideHelpers.js';
import { resolveStyle } from '../model/index.js';
import { setRoomStyle } from '../store/elevationSlice.js';
import StyleFields from './properties/StyleFields.jsx';

export default function RoomStylePanel() {
  const dispatch = useDispatch();
  const { rooms, activeRoomId } = useSelector((state) => state.elevation);
  const settings = useSelector(selectSettings);
  const inheritedChain = useSelector(selectRoomInheritedChain);
  const room = rooms.find((candidate) => candidate.id === activeRoomId) ?? null;
  if (!room) return null;

  return (
    <StyleFields
      label="Room"
      level="Room"
      inheritedFrom={sourceLabel(resolveSetting('defaultStyle.cabinetStyleId', inheritedChain).source)}
      value={room.style}
      inherited={resolveStyle(settings)}
      onChange={(style) => dispatch(setRoomStyle({ roomId: room.id, style }))}
    />
  );
}
